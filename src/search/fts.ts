// Full-text search using SQLite FTS5

import { getDb } from '../db/connection';
import type { SearchResult, SearchOptions } from './types';

/**
 * Search messages using FTS5
 */
export function ftsSearchMessages(
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const db = getDb();
  const limit = options.limit ?? 20;

  // Build WHERE clause for filters
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.sourceTypes?.length) {
    conditions.push(`m.source_type IN (${options.sourceTypes.map(() => '?').join(',')})`);
    params.push(...options.sourceTypes);
  }

  if (options.dateFrom) {
    conditions.push('m.timestamp >= ?');
    params.push(options.dateFrom.toISOString());
  }

  if (options.dateTo) {
    conditions.push('m.timestamp <= ?');
    params.push(options.dateTo.toISOString());
  }

  if (options.entityIds?.length) {
    conditions.push(`(
      m.sender_entity_id IN (${options.entityIds.map(() => '?').join(',')})
      OR EXISTS (
        SELECT 1 FROM json_each(m.recipient_entity_ids)
        WHERE json_each.value IN (${options.entityIds.map(() => '?').join(',')})
      )
    )`);
    params.push(...options.entityIds, ...options.entityIds);
  }

  const whereClause = conditions.length > 0
    ? `AND ${conditions.join(' AND ')}`
    : '';

  // FTS5 query with BM25 ranking
  const sql = `
    SELECT
      m.id,
      m.source_type,
      m.subject,
      m.body_text,
      m.timestamp,
      m.sender_entity_id,
      bm25(messages_fts, 1.0, 0.75) as score,
      snippet(messages_fts, 1, '<mark>', '</mark>', '...', 32) as highlight
    FROM messages_fts
    JOIN messages m ON messages_fts.rowid = m.rowid
    WHERE messages_fts MATCH ?
    ${whereClause}
    ORDER BY score
    LIMIT ?
  `;

  try {
    const results = db.prepare(sql).all(query, ...params, limit) as Array<{
      id: string;
      source_type: string;
      subject: string | null;
      body_text: string;
      timestamp: string;
      sender_entity_id: string | null;
      score: number;
      highlight: string;
    }>;

    return results.map((row, index) => ({
      id: row.id,
      type: 'message' as const,
      score: 1 / (index + 1),  // Normalize BM25 to rank-based score
      source: 'fts' as const,
      highlight: row.highlight,
      data: {
        id: row.id,
        sourceType: row.source_type,
        subject: row.subject,
        bodyText: row.body_text,
        timestamp: new Date(row.timestamp),
        senderEntityId: row.sender_entity_id,
      },
    }));
  } catch (error) {
    // FTS query syntax might be invalid
    console.error('FTS search failed:', error);
    return [];
  }
}

/**
 * Search entities by name or attributes
 */
export function ftsSearchEntities(
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const db = getDb();
  const limit = options.limit ?? 20;

  const results = db.prepare(`
    SELECT DISTINCT
      e.id,
      e.canonical_name,
      e.entity_type,
      GROUP_CONCAT(ea.attribute_type || ': ' || ea.attribute_value, ', ') as attributes
    FROM entities e
    LEFT JOIN entity_attributes ea ON e.id = ea.entity_id
    WHERE e.canonical_name LIKE ?
       OR ea.attribute_value LIKE ?
    GROUP BY e.id
    ORDER BY
      CASE WHEN e.canonical_name LIKE ? THEN 0 ELSE 1 END,
      e.canonical_name
    LIMIT ?
  `).all(`%${query}%`, `%${query}%`, `${query}%`, limit) as Array<{
    id: string;
    canonical_name: string;
    entity_type: string;
    attributes: string | null;
  }>;

  return results.map((row, index) => ({
    id: row.id,
    type: 'entity' as const,
    score: 1 / (index + 1),
    source: 'fts' as const,
    highlight: row.attributes || undefined,
    data: {
      id: row.id,
      canonicalName: row.canonical_name,
      entityType: row.entity_type,
      attributes: row.attributes,
    },
  }));
}

/**
 * Search assertions
 */
export function ftsSearchAssertions(
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const db = getDb();
  const limit = options.limit ?? 20;

  const results = db.prepare(`
    SELECT
      a.id,
      a.predicate,
      a.object_text,
      a.confidence,
      a.source_type,
      se.canonical_name as subject_name,
      oe.canonical_name as object_name
    FROM assertions a
    LEFT JOIN entities se ON a.subject_entity_id = se.id
    LEFT JOIN entities oe ON a.object_entity_id = oe.id
    WHERE a.object_text LIKE ?
       OR se.canonical_name LIKE ?
       OR oe.canonical_name LIKE ?
       OR a.predicate LIKE ?
    ORDER BY a.confidence DESC
    LIMIT ?
  `).all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit) as Array<{
    id: string;
    predicate: string;
    object_text: string | null;
    confidence: number;
    source_type: string;
    subject_name: string | null;
    object_name: string | null;
  }>;

  return results.map((row, index) => ({
    id: row.id,
    type: 'assertion' as const,
    score: row.confidence * (1 / (index + 1)),
    source: 'fts' as const,
    highlight: `${row.subject_name || '?'} ${row.predicate} ${row.object_name || row.object_text || '?'}`,
    data: {
      id: row.id,
      predicate: row.predicate,
      objectText: row.object_text,
      confidence: row.confidence,
      subjectName: row.subject_name,
      objectName: row.object_name,
    },
  }));
}
