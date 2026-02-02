// Entity, fact, and relationship extraction from messages

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection';
import { callLLM, extractJSON, type LLMConfig } from './llm';
import {
  ENTITY_EXTRACTION_PROMPT,
  FACT_EXTRACTION_PROMPT,
  RELATIONSHIP_EXTRACTION_PROMPT,
  type ExtractedEntity,
  type ExtractedFact,
  type ExtractedRelationship,
  type ExtractionResult,
} from './types';

/**
 * Extract entities from message text using LLM
 */
export async function extractEntities(
  messageText: string,
  llmConfig: LLMConfig
): Promise<ExtractedEntity[]> {
  const prompt = ENTITY_EXTRACTION_PROMPT + messageText;

  try {
    const response = await callLLM(prompt, llmConfig);
    const result = extractJSON<{ entities: ExtractedEntity[] }>(response.text);
    return result?.entities ?? [];
  } catch (error) {
    console.error('Entity extraction failed:', error);
    return [];
  }
}

/**
 * Extract facts/assertions from message text using LLM
 */
export async function extractFacts(
  messageText: string,
  llmConfig: LLMConfig
): Promise<ExtractedFact[]> {
  const prompt = FACT_EXTRACTION_PROMPT + messageText;

  try {
    const response = await callLLM(prompt, llmConfig);
    const result = extractJSON<{ facts: ExtractedFact[] }>(response.text);
    return result?.facts ?? [];
  } catch (error) {
    console.error('Fact extraction failed:', error);
    return [];
  }
}

/**
 * Extract relationships from message context using LLM
 */
export async function extractRelationships(
  messageText: string,
  sender: string,
  recipients: string[],
  llmConfig: LLMConfig
): Promise<ExtractedRelationship[]> {
  const prompt = RELATIONSHIP_EXTRACTION_PROMPT
    .replace('{sender}', sender)
    .replace('{recipients}', recipients.join(', '))
    + messageText;

  try {
    const response = await callLLM(prompt, llmConfig);
    const result = extractJSON<{ relationships: ExtractedRelationship[] }>(response.text);
    return result?.relationships ?? [];
  } catch (error) {
    console.error('Relationship extraction failed:', error);
    return [];
  }
}

/**
 * Full extraction pipeline for a message
 */
export async function extractFromMessage(
  messageText: string,
  sender: string,
  recipients: string[],
  llmConfig: LLMConfig
): Promise<ExtractionResult> {
  // Run extractions in parallel for speed
  const [entities, facts, relationships] = await Promise.all([
    extractEntities(messageText, llmConfig),
    extractFacts(messageText, llmConfig),
    extractRelationships(messageText, sender, recipients, llmConfig),
  ]);

  return { entities, facts, relationships };
}

/**
 * Store extracted facts as assertions in the database
 */
export function storeAssertions(
  facts: ExtractedFact[],
  sourceType: string,
  sourceId: string,
  sourceTimestamp: Date
): number {
  const db = getDb();
  let stored = 0;

  for (const fact of facts) {
    // Try to resolve subject entity
    const subjectEntity = db.prepare(`
      SELECT id FROM entities WHERE canonical_name = ? COLLATE NOCASE
    `).get(fact.subject) as { id: string } | undefined;

    // Try to resolve object as entity (might be a literal value)
    const objectEntity = db.prepare(`
      SELECT id FROM entities WHERE canonical_name = ? COLLATE NOCASE
    `).get(fact.object) as { id: string } | undefined;

    db.prepare(`
      INSERT INTO assertions (
        id, subject_entity_id, predicate, object_text, object_entity_id,
        confidence, source_type, source_id, source_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      subjectEntity?.id ?? null,
      fact.predicate,
      fact.object,
      objectEntity?.id ?? null,
      fact.confidence,
      sourceType,
      sourceId,
      sourceTimestamp.toISOString()
    );

    stored++;
  }

  return stored;
}

/**
 * Store extracted relationships as graph edges
 */
export function storeRelationships(
  relationships: ExtractedRelationship[],
  sourceTimestamp: Date
): number {
  const db = getDb();
  let stored = 0;

  for (const rel of relationships) {
    // Try to resolve both entities
    const fromEntity = db.prepare(`
      SELECT id FROM entities WHERE canonical_name = ? COLLATE NOCASE
    `).get(rel.fromEntity) as { id: string } | undefined;

    const toEntity = db.prepare(`
      SELECT id FROM entities WHERE canonical_name = ? COLLATE NOCASE
    `).get(rel.toEntity) as { id: string } | undefined;

    if (fromEntity && toEntity) {
      // Upsert edge
      db.prepare(`
        INSERT INTO graph_edges (id, from_entity_id, to_entity_id, edge_type, strength, evidence_count, last_evidence_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(from_entity_id, to_entity_id, edge_type) DO UPDATE SET
          evidence_count = evidence_count + 1,
          last_evidence_at = excluded.last_evidence_at,
          strength = MIN(1.0, strength + (? * 0.1))
      `).run(
        uuidv4(),
        fromEntity.id,
        toEntity.id,
        rel.relationshipType,
        rel.confidence,
        sourceTimestamp.toISOString(),
        rel.confidence
      );

      stored++;
    }
  }

  return stored;
}

/**
 * Process unprocessed messages through extraction pipeline
 */
export async function processUnprocessedMessages(
  llmConfig: LLMConfig,
  batchSize: number = 10
): Promise<{
  processed: number;
  assertionsCreated: number;
  relationshipsCreated: number;
  errors: number;
}> {
  const db = getDb();

  // Get unprocessed messages
  const messages = db.prepare(`
    SELECT m.id, m.body_text, m.source_type, m.timestamp,
           e.canonical_name as sender_name
    FROM messages m
    LEFT JOIN entities e ON m.sender_entity_id = e.id
    WHERE m.processed = 0
    ORDER BY m.timestamp DESC
    LIMIT ?
  `).all(batchSize) as Array<{
    id: string;
    body_text: string;
    source_type: string;
    timestamp: string;
    sender_name: string | null;
  }>;

  let processed = 0;
  let assertionsCreated = 0;
  let relationshipsCreated = 0;
  let errors = 0;

  for (const msg of messages) {
    try {
      // Get recipients for this message
      const recipientIds = db.prepare(`
        SELECT recipient_entity_ids FROM messages WHERE id = ?
      `).get(msg.id) as { recipient_entity_ids: string } | undefined;

      let recipientNames: string[] = [];
      if (recipientIds?.recipient_entity_ids) {
        const ids = JSON.parse(recipientIds.recipient_entity_ids) as string[];
        for (const id of ids) {
          const entity = db.prepare(`
            SELECT canonical_name FROM entities WHERE id = ?
          `).get(id) as { canonical_name: string } | undefined;
          if (entity) {
            recipientNames.push(entity.canonical_name);
          }
        }
      }

      // Run extraction
      const result = await extractFromMessage(
        msg.body_text,
        msg.sender_name || 'Unknown',
        recipientNames,
        llmConfig
      );

      // Store results
      const sourceTimestamp = new Date(msg.timestamp);
      assertionsCreated += storeAssertions(result.facts, msg.source_type, msg.id, sourceTimestamp);
      relationshipsCreated += storeRelationships(result.relationships, sourceTimestamp);

      // Mark as processed
      db.prepare('UPDATE messages SET processed = 1 WHERE id = ?').run(msg.id);

      processed++;
    } catch (error) {
      console.error(`Failed to process message ${msg.id}:`, error);
      errors++;
    }
  }

  return { processed, assertionsCreated, relationshipsCreated, errors };
}

/**
 * Simple rule-based extraction for when LLM is not available
 * Extracts basic patterns without requiring external API
 */
export function extractBasicPatterns(text: string): {
  emails: string[];
  phones: string[];
  urls: string[];
  mentions: string[];  // @mentions
} {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  const mentionRegex = /@[a-zA-Z0-9_]+/g;

  return {
    emails: [...text.matchAll(emailRegex)].map(m => m[0].toLowerCase()),
    phones: [...text.matchAll(phoneRegex)].map(m => m[0]),
    urls: [...text.matchAll(urlRegex)].map(m => m[0]),
    mentions: [...text.matchAll(mentionRegex)].map(m => m[0]),
  };
}
