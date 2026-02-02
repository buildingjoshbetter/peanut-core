// Embedding generation and storage

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection';
import type { EmbeddingConfig } from './types';

// In-memory vector store for simplicity
// In production, use LanceDB or similar
const vectorStore: Map<string, { id: string; embedding: number[]; sourceId: string; sourceType: string }> = new Map();

/**
 * Generate embedding using Ollama API
 */
export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig
): Promise<number[]> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status}`);
  }

  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Store embedding in memory store
 */
export function storeEmbedding(
  sourceId: string,
  sourceType: string,
  embedding: number[]
): string {
  const id = uuidv4();
  vectorStore.set(id, { id, embedding, sourceId, sourceType });
  return id;
}

/**
 * Search for similar vectors
 */
export function searchVectors(
  queryEmbedding: number[],
  limit: number = 20,
  sourceType?: string
): Array<{ id: string; sourceId: string; score: number }> {
  const results: Array<{ id: string; sourceId: string; score: number }> = [];

  for (const [id, entry] of vectorStore) {
    if (sourceType && entry.sourceType !== sourceType) continue;

    const score = cosineSimilarity(queryEmbedding, entry.embedding);
    results.push({ id, sourceId: entry.sourceId, score });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Embed all unembedded messages
 */
export async function embedUnprocessedMessages(
  config: EmbeddingConfig,
  batchSize: number = 50
): Promise<{ processed: number; errors: number }> {
  const db = getDb();

  // Get messages without embeddings (using embedding_id field in assertions as proxy)
  // For now, just get messages not in our vector store
  const existingSourceIds = new Set(
    Array.from(vectorStore.values()).map(v => v.sourceId)
  );

  const messages = db.prepare(`
    SELECT id, body_text, subject FROM messages
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(batchSize) as Array<{ id: string; body_text: string; subject: string | null }>;

  let processed = 0;
  let errors = 0;

  for (const msg of messages) {
    if (existingSourceIds.has(msg.id)) continue;

    try {
      const text = [msg.subject, msg.body_text].filter(Boolean).join('\n');
      if (text.length < 10) continue;  // Skip very short messages

      const embedding = await generateEmbedding(text, config);
      storeEmbedding(msg.id, 'message', embedding);
      processed++;
    } catch (error) {
      console.error(`Failed to embed message ${msg.id}:`, error);
      errors++;
    }
  }

  return { processed, errors };
}

/**
 * Get vector store stats
 */
export function getVectorStoreStats(): { count: number; byType: Record<string, number> } {
  const byType: Record<string, number> = {};

  for (const entry of vectorStore.values()) {
    byType[entry.sourceType] = (byType[entry.sourceType] || 0) + 1;
  }

  return { count: vectorStore.size, byType };
}

/**
 * Clear vector store (for testing)
 */
export function clearVectorStore(): void {
  vectorStore.clear();
}
