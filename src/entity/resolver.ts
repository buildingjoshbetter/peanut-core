// 4-Stage Entity Resolution Pipeline
// 1. Exact match on unique attributes (email, phone)
// 2. Fuzzy match on name
// 3. Graph proximity scoring
// 4. LLM tie-breaker for ambiguous cases

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection';
import { nameSimilarity, normalizeName } from './matcher';
import { callLLM, extractJSON, type LLMConfig } from '../extraction/llm';
import type { Entity, EntityType } from '../types';

export interface ResolveCandidate {
  name: string;
  type: EntityType;
  email?: string;
  phone?: string;
  attributes?: Record<string, string>;
}

export interface ResolveMatch {
  entityId: string;
  canonicalName: string;
  score: number;
  matchType: 'exact' | 'fuzzy' | 'graph' | 'llm';
}

/**
 * Stage 1: Exact match on unique attributes
 */
function findExactMatch(candidate: ResolveCandidate): ResolveMatch | null {
  const db = getDb();

  // Try email first (most reliable)
  if (candidate.email) {
    const match = db.prepare(`
      SELECT e.id, e.canonical_name
      FROM entities e
      JOIN entity_attributes ea ON e.id = ea.entity_id
      WHERE ea.attribute_type = 'email' AND ea.attribute_value = ?
    `).get(candidate.email.toLowerCase()) as { id: string; canonical_name: string } | undefined;

    if (match) {
      return {
        entityId: match.id,
        canonicalName: match.canonical_name,
        score: 1.0,
        matchType: 'exact',
      };
    }
  }

  // Try phone
  if (candidate.phone) {
    // Normalize phone for comparison
    const normalizedPhone = candidate.phone.replace(/\D/g, '');
    const phoneVariants = [
      normalizedPhone,
      `+1${normalizedPhone}`,
      `+${normalizedPhone}`,
      normalizedPhone.slice(-10),  // Last 10 digits
    ];

    for (const variant of phoneVariants) {
      const match = db.prepare(`
        SELECT e.id, e.canonical_name
        FROM entities e
        JOIN entity_attributes ea ON e.id = ea.entity_id
        WHERE ea.attribute_type = 'phone' AND REPLACE(REPLACE(REPLACE(ea.attribute_value, '-', ''), ' ', ''), '+', '') LIKE ?
      `).get(`%${variant.slice(-10)}`) as { id: string; canonical_name: string } | undefined;

      if (match) {
        return {
          entityId: match.id,
          canonicalName: match.canonical_name,
          score: 1.0,
          matchType: 'exact',
        };
      }
    }
  }

  return null;
}

/**
 * Stage 2: Fuzzy match on name
 */
function findFuzzyMatches(candidate: ResolveCandidate, threshold: number = 0.7): ResolveMatch[] {
  const db = getDb();

  // Get all entities of the same type
  const entities = db.prepare(`
    SELECT id, canonical_name FROM entities WHERE entity_type = ?
  `).all(candidate.type) as Array<{ id: string; canonical_name: string }>;

  const matches: ResolveMatch[] = [];
  const normalizedCandidate = normalizeName(candidate.name);

  for (const entity of entities) {
    const score = nameSimilarity(candidate.name, entity.canonical_name);

    if (score >= threshold) {
      matches.push({
        entityId: entity.id,
        canonicalName: entity.canonical_name,
        score,
        matchType: 'fuzzy',
      });
    }
  }

  // Sort by score descending
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Stage 3: Score by graph proximity
 * If candidate shares connections with existing entity, they're more likely the same
 */
function scoreByGraphProximity(
  candidate: ResolveCandidate,
  fuzzyMatches: ResolveMatch[],
  contextEntityIds: string[]  // Entities the candidate appeared with in current message
): ResolveMatch[] {
  if (fuzzyMatches.length === 0 || contextEntityIds.length === 0) {
    return fuzzyMatches;
  }

  const db = getDb();

  const scoredMatches = fuzzyMatches.map(match => {
    // Count how many context entities this match is connected to
    const connections = db.prepare(`
      SELECT COUNT(DISTINCT
        CASE
          WHEN from_entity_id = ? THEN to_entity_id
          ELSE from_entity_id
        END
      ) as count
      FROM graph_edges
      WHERE (from_entity_id = ? OR to_entity_id = ?)
        AND (from_entity_id IN (${contextEntityIds.map(() => '?').join(',')})
             OR to_entity_id IN (${contextEntityIds.map(() => '?').join(',')}))
    `).get(
      match.entityId,
      match.entityId,
      match.entityId,
      ...contextEntityIds,
      ...contextEntityIds
    ) as { count: number };

    // Boost score based on shared connections
    const proximityBoost = Math.min(connections.count * 0.1, 0.3);

    return {
      ...match,
      score: Math.min(match.score + proximityBoost, 1.0),
      matchType: 'graph' as const,
    };
  });

  return scoredMatches.sort((a, b) => b.score - a.score);
}

/**
 * Stage 4: LLM tie-breaker for ambiguous cases
 */
async function llmResolve(
  candidate: ResolveCandidate,
  matches: ResolveMatch[],
  contextText: string,
  llmConfig: LLMConfig
): Promise<ResolveMatch | null> {
  if (matches.length === 0) return null;

  const db = getDb();

  // Build context about each match
  const matchDescriptions = matches.map((match, idx) => {
    const attrs = db.prepare(`
      SELECT attribute_type, attribute_value FROM entity_attributes WHERE entity_id = ?
    `).all(match.entityId) as Array<{ attribute_type: string; attribute_value: string }>;

    const attrStr = attrs.map(a => `${a.attribute_type}: ${a.attribute_value}`).join(', ');
    return `${idx + 1}. "${match.canonicalName}" (${attrStr || 'no attributes'})`;
  }).join('\n');

  const prompt = `Given a mention of "${candidate.name}" in this context:
"${contextText.substring(0, 500)}"

Which of these existing entities is the same person/entity? Or is this a new entity?

Options:
${matchDescriptions}
0. This is a NEW entity (not any of the above)

Respond with just the number (0-${matches.length}) and a brief reason:
{"choice": 1, "reason": "..."}`;

  try {
    const response = await callLLM(prompt, llmConfig);
    const result = extractJSON<{ choice: number; reason: string }>(response.text);

    if (result && result.choice > 0 && result.choice <= matches.length) {
      const chosen = matches[result.choice - 1];
      if (chosen) {
        return { ...chosen, matchType: 'llm' };
      }
    }
  } catch (error) {
    console.error('LLM resolution failed:', error);
  }

  return null;
}

/**
 * Create a new entity
 */
function createEntity(candidate: ResolveCandidate): string {
  const db = getDb();
  const entityId = uuidv4();

  db.prepare(`
    INSERT INTO entities (id, canonical_name, entity_type)
    VALUES (?, ?, ?)
  `).run(entityId, candidate.name, candidate.type);

  // Add email attribute
  if (candidate.email) {
    db.prepare(`
      INSERT INTO entity_attributes (id, entity_id, attribute_type, attribute_value)
      VALUES (?, ?, 'email', ?)
    `).run(uuidv4(), entityId, candidate.email.toLowerCase());
  }

  // Add phone attribute
  if (candidate.phone) {
    db.prepare(`
      INSERT INTO entity_attributes (id, entity_id, attribute_type, attribute_value)
      VALUES (?, ?, 'phone', ?)
    `).run(uuidv4(), entityId, candidate.phone);
  }

  // Add other attributes
  if (candidate.attributes) {
    for (const [key, value] of Object.entries(candidate.attributes)) {
      db.prepare(`
        INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), entityId, key, value);
    }
  }

  return entityId;
}

/**
 * Add attribute to existing entity
 */
function addAttributeToEntity(
  entityId: string,
  attributeType: string,
  attributeValue: string
): void {
  const db = getDb();

  db.prepare(`
    INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), entityId, attributeType, attributeValue);
}

/**
 * Main resolution function: 4-stage pipeline
 */
export async function resolveEntity(
  candidate: ResolveCandidate,
  options: {
    contextEntityIds?: string[];
    contextText?: string;
    llmConfig?: LLMConfig;
    fuzzyThreshold?: number;
    highConfidenceThreshold?: number;
  } = {}
): Promise<{ entityId: string; created: boolean; matchType: string }> {
  const {
    contextEntityIds = [],
    contextText = '',
    llmConfig,
    fuzzyThreshold = 0.7,
    highConfidenceThreshold = 0.9,
  } = options;

  // Stage 1: Exact match
  const exactMatch = findExactMatch(candidate);
  if (exactMatch) {
    // Still add any new attributes we learned
    if (candidate.email && !candidate.email.includes('@')) {
      addAttributeToEntity(exactMatch.entityId, 'alias', candidate.name);
    }
    return { entityId: exactMatch.entityId, created: false, matchType: 'exact' };
  }

  // Stage 2: Fuzzy match
  let fuzzyMatches = findFuzzyMatches(candidate, fuzzyThreshold);

  // If we have a single very high confidence match, use it
  if (fuzzyMatches.length === 1 && fuzzyMatches[0]!.score >= highConfidenceThreshold) {
    const match = fuzzyMatches[0]!;
    // Add any new attributes
    if (candidate.email) addAttributeToEntity(match.entityId, 'email', candidate.email.toLowerCase());
    if (candidate.phone) addAttributeToEntity(match.entityId, 'phone', candidate.phone);
    return { entityId: match.entityId, created: false, matchType: 'fuzzy' };
  }

  // Stage 3: Graph proximity (if we have context)
  if (fuzzyMatches.length > 0 && contextEntityIds.length > 0) {
    fuzzyMatches = scoreByGraphProximity(candidate, fuzzyMatches, contextEntityIds);

    // If top match is now very high confidence, use it
    if (fuzzyMatches[0] && fuzzyMatches[0].score >= highConfidenceThreshold) {
      const match = fuzzyMatches[0];
      if (candidate.email) addAttributeToEntity(match.entityId, 'email', candidate.email.toLowerCase());
      if (candidate.phone) addAttributeToEntity(match.entityId, 'phone', candidate.phone);
      return { entityId: match.entityId, created: false, matchType: 'graph' };
    }
  }

  // Stage 4: LLM tie-breaker (if available and we have ambiguous matches)
  if (llmConfig && fuzzyMatches.length > 1 && contextText) {
    const llmMatch = await llmResolve(candidate, fuzzyMatches.slice(0, 5), contextText, llmConfig);
    if (llmMatch) {
      if (candidate.email) addAttributeToEntity(llmMatch.entityId, 'email', candidate.email.toLowerCase());
      if (candidate.phone) addAttributeToEntity(llmMatch.entityId, 'phone', candidate.phone);
      return { entityId: llmMatch.entityId, created: false, matchType: 'llm' };
    }
  }

  // No confident match found - create new entity
  const newEntityId = createEntity(candidate);
  return { entityId: newEntityId, created: true, matchType: 'new' };
}

/**
 * Merge two entities (combine all attributes and edges)
 */
export function mergeEntities(keepId: string, mergeId: string): void {
  const db = getDb();

  // Get the entity being merged
  const mergeEntity = db.prepare('SELECT * FROM entities WHERE id = ?').get(mergeId) as {
    canonical_name: string;
    merge_history: string;
  } | undefined;

  if (!mergeEntity) return;

  // Update merge history on kept entity
  const keepEntity = db.prepare('SELECT merge_history FROM entities WHERE id = ?').get(keepId) as {
    merge_history: string;
  } | undefined;

  const history = JSON.parse(keepEntity?.merge_history || '[]') as string[];
  history.push(mergeId);
  const mergeHistory = JSON.parse(mergeEntity.merge_history || '[]') as string[];
  history.push(...mergeHistory);

  db.prepare(`
    UPDATE entities SET merge_history = ?, updated_at = datetime('now') WHERE id = ?
  `).run(JSON.stringify(history), keepId);

  // Add merged entity's name as an alias
  db.prepare(`
    INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value)
    VALUES (?, ?, 'alias', ?)
  `).run(uuidv4(), keepId, mergeEntity.canonical_name);

  // Move all attributes to kept entity
  db.prepare(`
    UPDATE OR IGNORE entity_attributes SET entity_id = ? WHERE entity_id = ?
  `).run(keepId, mergeId);

  // Update graph edges
  db.prepare(`
    UPDATE graph_edges SET from_entity_id = ? WHERE from_entity_id = ?
  `).run(keepId, mergeId);
  db.prepare(`
    UPDATE graph_edges SET to_entity_id = ? WHERE to_entity_id = ?
  `).run(keepId, mergeId);

  // Update messages
  db.prepare(`
    UPDATE messages SET sender_entity_id = ? WHERE sender_entity_id = ?
  `).run(keepId, mergeId);

  // Update assertions
  db.prepare(`
    UPDATE assertions SET subject_entity_id = ? WHERE subject_entity_id = ?
  `).run(keepId, mergeId);
  db.prepare(`
    UPDATE assertions SET object_entity_id = ? WHERE object_entity_id = ?
  `).run(keepId, mergeId);

  // Delete the merged entity
  db.prepare('DELETE FROM entity_attributes WHERE entity_id = ?').run(mergeId);
  db.prepare('DELETE FROM entities WHERE id = ?').run(mergeId);
}

/**
 * Find potential duplicate entities
 */
export function findPotentialDuplicates(threshold: number = 0.8): Array<{
  entity1: { id: string; name: string };
  entity2: { id: string; name: string };
  score: number;
}> {
  const db = getDb();

  const entities = db.prepare(`
    SELECT id, canonical_name FROM entities WHERE entity_type = 'person'
  `).all() as Array<{ id: string; canonical_name: string }>;

  const duplicates: Array<{
    entity1: { id: string; name: string };
    entity2: { id: string; name: string };
    score: number;
  }> = [];

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const e1 = entities[i]!;
      const e2 = entities[j]!;

      const score = nameSimilarity(e1.canonical_name, e2.canonical_name);
      if (score >= threshold) {
        duplicates.push({
          entity1: { id: e1.id, name: e1.canonical_name },
          entity2: { id: e2.id, name: e2.canonical_name },
          score,
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.score - a.score);
}
