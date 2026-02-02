// Reciprocal Rank Fusion - combine results from multiple search methods

import { getDb } from '../db/connection';
import { ftsSearchMessages, ftsSearchEntities, ftsSearchAssertions } from './fts';
import { graphSearch, parseQuery } from './graph';
import { searchVectors, generateEmbedding } from './embeddings';
import type { SearchResult, SearchOptions, EmbeddingConfig } from './types';

/**
 * Reciprocal Rank Fusion (RRF) algorithm
 * Combines ranked lists from multiple sources into a single ranking
 *
 * RRF score = Σ 1/(k + rank_i) for each source i
 * k is typically 60 (helps prevent top results from dominating)
 */
export function reciprocalRankFusion(
  resultSets: SearchResult[][],
  k: number = 60
): SearchResult[] {
  const scoreMap = new Map<string, { score: number; result: SearchResult }>();

  for (const results of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank]!;
      const rrf = 1 / (k + rank + 1);

      const key = `${result.type}:${result.id}`;
      const existing = scoreMap.get(key);

      if (existing) {
        existing.score += rrf;
        // Keep the result with the best highlight
        if (result.highlight && !existing.result.highlight) {
          existing.result = { ...result, source: 'fused' };
        }
      } else {
        scoreMap.set(key, {
          score: rrf,
          result: { ...result, source: 'fused' },
        });
      }
    }
  }

  // Sort by combined score
  const fused = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(entry => ({
      ...entry.result,
      score: entry.score,
    }));

  return fused;
}

/**
 * Hybrid search combining FTS, Vector, and Graph search
 */
export async function hybridSearch(
  query: string,
  options: SearchOptions = {},
  embeddingConfig?: EmbeddingConfig
): Promise<SearchResult[]> {
  const limit = options.limit ?? 20;
  const internalLimit = limit * 3;  // Fetch more for fusion

  // Determine what types to search
  const searchTypes = options.searchTypes ?? ['message', 'entity', 'assertion'];

  // Run searches in parallel
  const searchPromises: Promise<SearchResult[]>[] = [];

  // 1. FTS Search
  if (searchTypes.includes('message')) {
    searchPromises.push(
      Promise.resolve(ftsSearchMessages(query, { ...options, limit: internalLimit }))
    );
  }

  if (searchTypes.includes('entity')) {
    searchPromises.push(
      Promise.resolve(ftsSearchEntities(query, { ...options, limit: internalLimit }))
    );
  }

  if (searchTypes.includes('assertion')) {
    searchPromises.push(
      Promise.resolve(ftsSearchAssertions(query, { ...options, limit: internalLimit }))
    );
  }

  // 2. Graph Search (if query has relationship patterns)
  const parsed = parseQuery(query);
  if (parsed.entities.length > 0 || parsed.relations.length > 0) {
    searchPromises.push(
      Promise.resolve(graphSearch(query, { ...options, limit: internalLimit }))
    );
  }

  // 3. Vector Search (if embedding config provided)
  if (embeddingConfig && searchTypes.includes('message')) {
    searchPromises.push(
      vectorSearchMessages(query, embeddingConfig, internalLimit)
    );
  }

  // Wait for all searches
  const resultSets = await Promise.all(searchPromises);

  // Fuse results
  const fused = reciprocalRankFusion(resultSets);

  return fused.slice(0, limit);
}

/**
 * Vector search for messages
 */
async function vectorSearchMessages(
  query: string,
  embeddingConfig: EmbeddingConfig,
  limit: number
): Promise<SearchResult[]> {
  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query, embeddingConfig);

    // Search vectors
    const vectorResults = searchVectors(queryEmbedding, limit, 'message');

    // Fetch message details
    const db = getDb();
    const results: SearchResult[] = [];

    for (const vr of vectorResults) {
      const msg = db.prepare(`
        SELECT id, subject, body_text, timestamp, sender_entity_id
        FROM messages WHERE id = ?
      `).get(vr.sourceId) as {
        id: string;
        subject: string | null;
        body_text: string;
        timestamp: string;
        sender_entity_id: string | null;
      } | undefined;

      if (msg) {
        results.push({
          id: msg.id,
          type: 'message',
          score: vr.score,
          source: 'vector',
          highlight: msg.subject || msg.body_text.substring(0, 100),
          data: {
            id: msg.id,
            subject: msg.subject,
            bodyText: msg.body_text,
            timestamp: new Date(msg.timestamp),
            senderEntityId: msg.sender_entity_id,
          },
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Vector search failed:', error);
    return [];
  }
}

/**
 * Simple search without vector (for when no embedding config)
 */
export function simpleSearch(
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const limit = options.limit ?? 20;
  const internalLimit = limit * 2;

  const searchTypes = options.searchTypes ?? ['message', 'entity', 'assertion'];
  const resultSets: SearchResult[][] = [];

  // FTS searches
  if (searchTypes.includes('message')) {
    resultSets.push(ftsSearchMessages(query, { ...options, limit: internalLimit }));
  }

  if (searchTypes.includes('entity')) {
    resultSets.push(ftsSearchEntities(query, { ...options, limit: internalLimit }));
  }

  if (searchTypes.includes('assertion')) {
    resultSets.push(ftsSearchAssertions(query, { ...options, limit: internalLimit }));
  }

  // Graph search
  const parsed = parseQuery(query);
  if (parsed.entities.length > 0) {
    resultSets.push(graphSearch(query, { ...options, limit: internalLimit }));
  }

  // Fuse and return
  return reciprocalRankFusion(resultSets).slice(0, limit);
}
