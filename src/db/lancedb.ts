// LanceDB Integration for Persistent Vector Storage
// Strategy Reference: Part 10, Part 14

import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuid } from 'uuid';

// LanceDB types (from vectordb package)
// Note: Install with `npm install vectordb`
interface LanceDBConnection {
  openTable(name: string): Promise<LanceDBTable>;
  createTable(name: string, data: VectorRecord[]): Promise<LanceDBTable>;
  tableNames(): Promise<string[]>;
}

interface LanceDBTable {
  add(data: VectorRecord[]): Promise<void>;
  search(query: number[]): LanceDBQuery;
  delete(filter: string): Promise<void>;
  countRows(): Promise<number>;
}

interface LanceDBQuery {
  limit(n: number): LanceDBQuery;
  filter(expr: string): LanceDBQuery;
  execute(): Promise<QueryResult[]>;
}

interface VectorRecord {
  id: string;
  vector: number[];
  sourceId: string;
  sourceType: string;
  text?: string;
  metadata?: string;  // JSON string
  createdAt: string;
}

interface QueryResult {
  id: string;
  sourceId: string;
  sourceType: string;
  text?: string;
  metadata?: string;
  _distance: number;
}

// Singleton connection
let db: LanceDBConnection | null = null;
let table: LanceDBTable | null = null;
let dbPath: string = '';
const TABLE_NAME = 'embeddings';

// Fallback in-memory store when LanceDB is not available
const fallbackStore: Map<string, VectorRecord> = new Map();
let useFallback = false;

/**
 * Initialize LanceDB connection
 */
export async function initLanceDb(vectorDbPath: string): Promise<void> {
  dbPath = vectorDbPath;

  // Ensure directory exists
  const dir = path.dirname(vectorDbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    // Dynamic require to handle missing package gracefully
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const lancedb: any = require('vectordb');
    db = await lancedb.connect(vectorDbPath) as unknown as LanceDBConnection;

    // Check if table exists
    const tables = await db!.tableNames();
    if (tables.includes(TABLE_NAME)) {
      table = await db!.openTable(TABLE_NAME);
      console.log(`✅ LanceDB: Opened existing table '${TABLE_NAME}'`);
    } else {
      // Create table with initial dummy record (required by LanceDB)
      const dummyRecord: VectorRecord = {
        id: '__init__',
        vector: new Array(768).fill(0),  // Default 768 dimensions for nomic-embed-text
        sourceId: '__init__',
        sourceType: '__init__',
        createdAt: new Date().toISOString(),
      };
      table = await db!.createTable(TABLE_NAME, [dummyRecord]);
      // Remove dummy record
      await table.delete("id = '__init__'");
      console.log(`✅ LanceDB: Created new table '${TABLE_NAME}'`);
    }

    useFallback = false;
  } catch (error) {
    console.warn('⚠️  LanceDB not available (vectordb not installed)');
    console.warn('   Using in-memory fallback for vector search');
    console.warn('   Install with: npm install vectordb');
    console.warn('   Tests will continue without vector search features.\n');
    useFallback = true;
    db = null;
    table = null;
  }
}

/**
 * Store an embedding vector
 */
export async function storeEmbedding(
  sourceId: string,
  sourceType: string,
  embedding: number[],
  options?: {
    text?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const id = uuid();
  const record: VectorRecord = {
    id,
    vector: embedding,
    sourceId,
    sourceType,
    text: options?.text,
    metadata: options?.metadata ? JSON.stringify(options.metadata) : undefined,
    createdAt: new Date().toISOString(),
  };

  if (useFallback || !table) {
    fallbackStore.set(id, record);
  } else {
    await table.add([record]);
  }

  return id;
}

/**
 * Search for similar vectors
 */
export async function searchVectors(
  queryEmbedding: number[],
  limit: number = 20,
  filters?: {
    sourceType?: string;
    sourceIds?: string[];
  }
): Promise<Array<{
  id: string;
  sourceId: string;
  sourceType: string;
  score: number;
  text?: string;
  metadata?: Record<string, unknown>;
}>> {
  if (useFallback || !table) {
    return searchVectorsFallback(queryEmbedding, limit, filters);
  }

  try {
    let query = table.search(queryEmbedding).limit(limit);

    // Apply filters
    if (filters?.sourceType) {
      query = query.filter(`sourceType = '${filters.sourceType}'`);
    }

    const results = await query.execute();

    return results.map(r => ({
      id: r.id,
      sourceId: r.sourceId,
      sourceType: r.sourceType,
      score: 1 / (1 + r._distance),  // Convert distance to similarity score
      text: r.text,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  } catch (error) {
    console.error('LanceDB search failed:', error);
    return searchVectorsFallback(queryEmbedding, limit, filters);
  }
}

/**
 * Fallback in-memory search using cosine similarity
 */
function searchVectorsFallback(
  queryEmbedding: number[],
  limit: number,
  filters?: {
    sourceType?: string;
    sourceIds?: string[];
  }
): Array<{
  id: string;
  sourceId: string;
  sourceType: string;
  score: number;
  text?: string;
  metadata?: Record<string, unknown>;
}> {
  const results: Array<{
    id: string;
    sourceId: string;
    sourceType: string;
    score: number;
    text?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  for (const record of fallbackStore.values()) {
    // Apply filters
    if (filters?.sourceType && record.sourceType !== filters.sourceType) continue;
    if (filters?.sourceIds && !filters.sourceIds.includes(record.sourceId)) continue;

    const score = cosineSimilarity(queryEmbedding, record.vector);
    results.push({
      id: record.id,
      sourceId: record.sourceId,
      sourceType: record.sourceType,
      score,
      text: record.text,
      metadata: record.metadata ? JSON.parse(record.metadata) : undefined,
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Delete an embedding by ID
 */
export async function deleteEmbedding(id: string): Promise<void> {
  if (useFallback || !table) {
    fallbackStore.delete(id);
  } else {
    await table.delete(`id = '${id}'`);
  }
}

/**
 * Delete embeddings by source ID
 */
export async function deleteEmbeddingsBySource(sourceId: string): Promise<void> {
  if (useFallback || !table) {
    for (const [id, record] of fallbackStore) {
      if (record.sourceId === sourceId) {
        fallbackStore.delete(id);
      }
    }
  } else {
    await table.delete(`sourceId = '${sourceId}'`);
  }
}

/**
 * Get embedding by ID
 */
export async function getEmbedding(id: string): Promise<VectorRecord | null> {
  if (useFallback || !table) {
    return fallbackStore.get(id) || null;
  }

  try {
    // LanceDB doesn't have direct get by ID, use search with filter
    const results = await table.search(new Array(768).fill(0))
      .filter(`id = '${id}'`)
      .limit(1)
      .execute();

    if (results.length === 0) return null;

    const r = results[0]!;
    return {
      id: r.id,
      vector: [],  // Not returned by search
      sourceId: r.sourceId,
      sourceType: r.sourceType,
      text: r.text,
      metadata: r.metadata,
      createdAt: '',
    };
  } catch {
    return null;
  }
}

/**
 * Get vector store statistics
 */
export async function getVectorStoreStats(): Promise<{
  count: number;
  byType: Record<string, number>;
  usingFallback: boolean;
}> {
  if (useFallback || !table) {
    const byType: Record<string, number> = {};
    for (const record of fallbackStore.values()) {
      byType[record.sourceType] = (byType[record.sourceType] || 0) + 1;
    }
    return {
      count: fallbackStore.size,
      byType,
      usingFallback: true,
    };
  }

  try {
    const count = await table.countRows();
    // Note: Getting by-type counts would require a full scan
    // For now, just return total count
    return {
      count,
      byType: {},
      usingFallback: false,
    };
  } catch {
    return {
      count: 0,
      byType: {},
      usingFallback: useFallback,
    };
  }
}

/**
 * Check if LanceDB is initialized
 */
export function isInitialized(): boolean {
  return db !== null || useFallback;
}

/**
 * Check if using fallback mode
 */
export function isUsingFallback(): boolean {
  return useFallback;
}

/**
 * Clear all embeddings (for testing)
 */
export async function clearAllEmbeddings(): Promise<void> {
  if (useFallback || !table) {
    fallbackStore.clear();
  } else {
    // Recreate table
    if (db) {
      const dummyRecord: VectorRecord = {
        id: '__init__',
        vector: new Array(768).fill(0),
        sourceId: '__init__',
        sourceType: '__init__',
        createdAt: new Date().toISOString(),
      };
      table = await db.createTable(TABLE_NAME, [dummyRecord]);
      await table.delete("id = '__init__'");
    }
  }
}

/**
 * Close LanceDB connection
 */
export async function closeLanceDb(): Promise<void> {
  // LanceDB connections don't require explicit close
  db = null;
  table = null;
  fallbackStore.clear();
}
