// Graph-based search - traverse relationships to find relevant content

import { getDb } from '../db/connection';
import { nameSimilarity } from '../entity/matcher';
import type { SearchResult, SearchOptions } from './types';

/**
 * Parse a query to identify entity references
 * e.g., "Jake's boss" -> { entity: "Jake", relation: "boss" }
 */
interface QueryParse {
  entities: string[];
  relations: string[];
  keywords: string[];
}

export function parseQuery(query: string): QueryParse {
  const possessivePattern = /(\w+)'s\s+(\w+)/gi;
  const entities: string[] = [];
  const relations: string[] = [];

  // Find possessive patterns like "Jake's boss"
  let match;
  while ((match = possessivePattern.exec(query)) !== null) {
    entities.push(match[1]!);
    relations.push(match[2]!);
  }

  // Remaining words are keywords
  const processedQuery = query.replace(possessivePattern, '').trim();
  const keywords = processedQuery.split(/\s+/).filter(w => w.length > 2);

  return { entities, relations, keywords };
}

/**
 * Find entities matching a name query
 */
export function findMatchingEntities(name: string, threshold: number = 0.7): Array<{
  id: string;
  name: string;
  score: number;
}> {
  const db = getDb();

  const allEntities = db.prepare(`
    SELECT id, canonical_name FROM entities
  `).all() as Array<{ id: string; canonical_name: string }>;

  const matches: Array<{ id: string; name: string; score: number }> = [];

  for (const entity of allEntities) {
    const score = nameSimilarity(name, entity.canonical_name);
    if (score >= threshold) {
      matches.push({
        id: entity.id,
        name: entity.canonical_name,
        score,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Traverse graph to find related entities
 */
export function getConnectedEntities(
  entityId: string,
  edgeTypes?: string[],
  depth: number = 1
): Array<{ id: string; name: string; edgeType: string; distance: number }> {
  const db = getDb();
  const visited = new Set<string>();
  const results: Array<{ id: string; name: string; edgeType: string; distance: number }> = [];

  function traverse(currentId: string, currentDepth: number) {
    if (currentDepth > depth || visited.has(currentId)) return;
    visited.add(currentId);

    // Get outgoing edges
    let edgeCondition = '';
    const params: unknown[] = [currentId];

    if (edgeTypes?.length) {
      edgeCondition = `AND ge.edge_type IN (${edgeTypes.map(() => '?').join(',')})`;
      params.push(...edgeTypes);
    }

    const outgoing = db.prepare(`
      SELECT ge.to_entity_id as entity_id, ge.edge_type, e.canonical_name
      FROM graph_edges ge
      JOIN entities e ON ge.to_entity_id = e.id
      WHERE ge.from_entity_id = ? ${edgeCondition}
    `).all(...params) as Array<{ entity_id: string; edge_type: string; canonical_name: string }>;

    // Get incoming edges
    const incoming = db.prepare(`
      SELECT ge.from_entity_id as entity_id, ge.edge_type, e.canonical_name
      FROM graph_edges ge
      JOIN entities e ON ge.from_entity_id = e.id
      WHERE ge.to_entity_id = ? ${edgeCondition}
    `).all(...params) as Array<{ entity_id: string; edge_type: string; canonical_name: string }>;

    for (const edge of [...outgoing, ...incoming]) {
      if (!visited.has(edge.entity_id)) {
        results.push({
          id: edge.entity_id,
          name: edge.canonical_name,
          edgeType: edge.edge_type,
          distance: currentDepth,
        });

        if (currentDepth < depth) {
          traverse(edge.entity_id, currentDepth + 1);
        }
      }
    }
  }

  traverse(entityId, 1);
  return results;
}

/**
 * Map relation words to edge types
 */
const RELATION_TO_EDGE: Record<string, string[]> = {
  'boss': ['reports_to'],
  'manager': ['reports_to'],
  'employee': ['reports_to'],
  'report': ['reports_to'],
  'colleague': ['works_with', 'communicates_with'],
  'coworker': ['works_with', 'communicates_with'],
  'friend': ['friend', 'knows'],
  'wife': ['family', 'spouse'],
  'husband': ['family', 'spouse'],
  'spouse': ['family', 'spouse'],
  'brother': ['family'],
  'sister': ['family'],
  'mom': ['family'],
  'mother': ['family'],
  'dad': ['family'],
  'father': ['family'],
  'parent': ['family'],
  'child': ['family'],
  'son': ['family'],
  'daughter': ['family'],
  'family': ['family'],
};

/**
 * Graph-based search for relationship queries
 * e.g., "Jake's boss" -> Find Jake, then traverse reports_to edge
 */
export function graphSearch(
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const parsed = parseQuery(query);
  const limit = options.limit ?? 20;
  const results: SearchResult[] = [];

  // Handle relationship queries
  for (let i = 0; i < parsed.entities.length; i++) {
    const entityName = parsed.entities[i]!;
    const relation = parsed.relations[i]?.toLowerCase();

    // Find the base entity
    const entityMatches = findMatchingEntities(entityName, 0.6);
    if (entityMatches.length === 0) continue;

    const baseEntity = entityMatches[0]!;

    // Map relation to edge types
    const edgeTypes = relation ? RELATION_TO_EDGE[relation] : undefined;

    // Traverse graph
    const connected = getConnectedEntities(baseEntity.id, edgeTypes, 1);

    for (const conn of connected) {
      results.push({
        id: conn.id,
        type: 'entity',
        score: baseEntity.score * (1 / (conn.distance + 1)),
        source: 'graph',
        highlight: `${baseEntity.name}'s ${conn.edgeType.replace('_', ' ')}`,
        data: {
          id: conn.id,
          canonicalName: conn.name,
          relationship: conn.edgeType,
          via: baseEntity.name,
        },
      });
    }
  }

  // Also find messages involving these entities
  const entityIds = results
    .filter(r => r.type === 'entity')
    .map(r => (r.data as { id: string }).id);

  if (entityIds.length > 0) {
    const db = getDb();

    const messages = db.prepare(`
      SELECT m.id, m.subject, m.body_text, m.timestamp, e.canonical_name as sender_name
      FROM messages m
      LEFT JOIN entities e ON m.sender_entity_id = e.id
      WHERE m.sender_entity_id IN (${entityIds.map(() => '?').join(',')})
      ORDER BY m.timestamp DESC
      LIMIT ?
    `).all(...entityIds, limit) as Array<{
      id: string;
      subject: string | null;
      body_text: string;
      timestamp: string;
      sender_name: string | null;
    }>;

    for (const msg of messages) {
      results.push({
        id: msg.id,
        type: 'message',
        score: 0.5,  // Lower score for messages found via graph
        source: 'graph',
        highlight: msg.subject || msg.body_text.substring(0, 100),
        data: {
          id: msg.id,
          subject: msg.subject,
          bodyText: msg.body_text,
          timestamp: new Date(msg.timestamp),
          senderName: msg.sender_name,
        },
      });
    }
  }

  return results.slice(0, limit);
}

/**
 * Find messages between two entities
 */
export function findMessagesBetween(
  entityId1: string,
  entityId2: string,
  limit: number = 50
): SearchResult[] {
  const db = getDb();

  const messages = db.prepare(`
    SELECT m.id, m.subject, m.body_text, m.timestamp, m.sender_entity_id,
           se.canonical_name as sender_name
    FROM messages m
    LEFT JOIN entities se ON m.sender_entity_id = se.id
    WHERE (m.sender_entity_id = ? AND EXISTS (
             SELECT 1 FROM json_each(m.recipient_entity_ids) WHERE json_each.value = ?
           ))
       OR (m.sender_entity_id = ? AND EXISTS (
             SELECT 1 FROM json_each(m.recipient_entity_ids) WHERE json_each.value = ?
           ))
    ORDER BY m.timestamp DESC
    LIMIT ?
  `).all(entityId1, entityId2, entityId2, entityId1, limit) as Array<{
    id: string;
    subject: string | null;
    body_text: string;
    timestamp: string;
    sender_entity_id: string;
    sender_name: string | null;
  }>;

  return messages.map((msg, index) => ({
    id: msg.id,
    type: 'message' as const,
    score: 1 / (index + 1),
    source: 'graph' as const,
    highlight: msg.subject || msg.body_text.substring(0, 100),
    data: {
      id: msg.id,
      subject: msg.subject,
      bodyText: msg.body_text,
      timestamp: new Date(msg.timestamp),
      senderEntityId: msg.sender_entity_id,
      senderName: msg.sender_name,
    },
  }));
}
