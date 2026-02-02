// Search types

export interface SearchResult {
  id: string;
  type: 'message' | 'assertion' | 'entity';
  score: number;
  source: 'vector' | 'fts' | 'graph' | 'fused';
  highlight?: string;  // Relevant snippet
  data: unknown;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  sourceTypes?: Array<'gmail' | 'imessage' | 'slack'>;
  dateFrom?: Date;
  dateTo?: Date;
  entityIds?: string[];  // Filter to messages involving these entities
  searchTypes?: Array<'message' | 'assertion' | 'entity'>;
}

export interface EmbeddingConfig {
  endpoint: string;     // e.g., "http://localhost:11434/api/embeddings"
  model: string;        // e.g., "nomic-embed-text"
}

export interface VectorSearchResult {
  id: string;
  score: number;  // Cosine similarity
  embedding?: number[];
}
