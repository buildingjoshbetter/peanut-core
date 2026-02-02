// Peanut-1: Local-first AI memory system
// Main entry point and public API

import { initDb, closeDb, getDb } from './db/connection';
import {
  ingestNormalizedMessages,
  ingestGmailMessages,
  ingestIMessages,
} from './ingestion/pipeline';
import {
  processUnprocessedMessages,
  extractBasicPatterns,
  extractFromMessage,
} from './extraction/extractor';
import {
  resolveEntity,
  mergeEntities,
  findPotentialDuplicates,
} from './entity/resolver';
import { nameSimilarity } from './entity/matcher';
import { hybridSearch, simpleSearch } from './search/fusion';
import { graphSearch, findMessagesBetween, getConnectedEntities } from './search/graph';
import { embedUnprocessedMessages, getVectorStoreStats } from './search/embeddings';
import {
  analyzeUserStyle,
  analyzeRecipientStyle,
  inferRelationshipType,
} from './personality/extractor';
import {
  generateMirrorPrompt,
  calculateRapportScore,
  analyzeAllRecipients,
  getAllRecipientStyles,
} from './personality/mirror';
import type { EmbeddingConfig, SearchResult as SearchResultType } from './search/types';
import type { ResolveCandidate } from './entity/resolver';
import type { LLMConfig } from './extraction/llm';
import type { ExtractionResult } from './extraction/types';
import type { GmailMessage, IMessageMessage, BatchIngestResult } from './ingestion/types';
import type {
  PeanutConfig,
  NormalizedMessage,
  IngestResult,
  SearchResult,
  SearchOptions,
  Entity,
  EntityWithAttributes,
  GraphNode,
  StyleProfile,
  RecipientStyleProfile,
} from './types';

export * from './types';
export * from './ingestion/types';
// Note: extraction/types not re-exported to avoid conflicts with types.ts

export class PeanutCore {
  private config: PeanutConfig;
  private initialized: boolean = false;

  constructor(config: PeanutConfig) {
    this.config = config;
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    initDb(this.config.dbPath);
    this.initialized = true;

    console.log(`[Peanut] Initialized with database at ${this.config.dbPath}`);
  }

  async close(): Promise<void> {
    closeDb();
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PeanutCore not initialized. Call initialize() first.');
    }
  }

  // ============================================================
  // INGESTION
  // ============================================================

  async ingestMessages(messages: NormalizedMessage[]): Promise<IngestResult> {
    this.ensureInitialized();
    return ingestNormalizedMessages(messages);
  }

  async ingestGmail(messages: GmailMessage[]): Promise<BatchIngestResult> {
    this.ensureInitialized();
    return ingestGmailMessages(messages, this.config.userEmail);
  }

  async ingestIMessages(messages: IMessageMessage[]): Promise<BatchIngestResult> {
    this.ensureInitialized();
    return ingestIMessages(messages, this.config.userPhone, this.config.userEmail);
  }

  // ============================================================
  // EXTRACTION
  // ============================================================

  /**
   * Process unprocessed messages through LLM extraction pipeline
   * Extracts entities, facts, and relationships
   */
  async runExtraction(llmConfig: LLMConfig, batchSize: number = 10): Promise<{
    processed: number;
    assertionsCreated: number;
    relationshipsCreated: number;
    errors: number;
  }> {
    this.ensureInitialized();
    return processUnprocessedMessages(llmConfig, batchSize);
  }

  /**
   * Extract entities, facts, and relationships from a single text
   */
  async extractFromText(
    text: string,
    sender: string,
    recipients: string[],
    llmConfig: LLMConfig
  ): Promise<ExtractionResult> {
    this.ensureInitialized();
    return extractFromMessage(text, sender, recipients, llmConfig);
  }

  /**
   * Extract basic patterns without LLM (emails, phones, URLs, mentions)
   */
  extractPatterns(text: string): {
    emails: string[];
    phones: string[];
    urls: string[];
    mentions: string[];
  } {
    return extractBasicPatterns(text);
  }

  // ============================================================
  // ENTITY RESOLUTION
  // ============================================================

  /**
   * Resolve an entity using 4-stage pipeline:
   * 1. Exact match (email/phone)
   * 2. Fuzzy name match
   * 3. Graph proximity
   * 4. LLM tie-breaker
   */
  async resolveEntity(
    candidate: ResolveCandidate,
    options?: {
      contextEntityIds?: string[];
      contextText?: string;
      llmConfig?: LLMConfig;
    }
  ): Promise<{ entityId: string; created: boolean; matchType: string }> {
    this.ensureInitialized();
    return resolveEntity(candidate, options);
  }

  /**
   * Merge two entities (combine attributes and update references)
   */
  mergeEntities(keepId: string, mergeId: string): void {
    this.ensureInitialized();
    mergeEntities(keepId, mergeId);
  }

  /**
   * Find potential duplicate entities based on name similarity
   */
  findDuplicates(threshold: number = 0.8): Array<{
    entity1: { id: string; name: string };
    entity2: { id: string; name: string };
    score: number;
  }> {
    this.ensureInitialized();
    return findPotentialDuplicates(threshold);
  }

  /**
   * Calculate name similarity between two names
   */
  nameSimilarity(name1: string, name2: string): number {
    return nameSimilarity(name1, name2);
  }

  // ============================================================
  // SEARCH
  // ============================================================

  /**
   * Hybrid search combining FTS, vector, and graph search
   * Uses Reciprocal Rank Fusion to combine results
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResultType[]> {
    this.ensureInitialized();
    // Use simple search by default (no embeddings required)
    return simpleSearch(query, options);
  }

  /**
   * Hybrid search with vector embeddings (requires embedding config)
   */
  async searchWithEmbeddings(
    query: string,
    embeddingConfig: EmbeddingConfig,
    options?: SearchOptions
  ): Promise<SearchResultType[]> {
    this.ensureInitialized();
    return hybridSearch(query, options, embeddingConfig);
  }

  /**
   * Graph-based search for relationship queries
   * e.g., "Jake's boss", "Sarah's colleagues"
   */
  searchGraph(query: string, options?: SearchOptions): SearchResultType[] {
    this.ensureInitialized();
    return graphSearch(query, options);
  }

  /**
   * Find messages between two entities
   */
  getMessagesBetween(entityId1: string, entityId2: string, limit?: number): SearchResultType[] {
    this.ensureInitialized();
    return findMessagesBetween(entityId1, entityId2, limit);
  }

  /**
   * Get entities connected to a given entity
   */
  getConnectedEntities(
    entityId: string,
    edgeTypes?: string[],
    depth?: number
  ): Array<{ id: string; name: string; edgeType: string; distance: number }> {
    this.ensureInitialized();
    return getConnectedEntities(entityId, edgeTypes, depth);
  }

  /**
   * Embed unprocessed messages for vector search
   */
  async embedMessages(embeddingConfig: EmbeddingConfig, batchSize?: number): Promise<{
    processed: number;
    errors: number;
  }> {
    this.ensureInitialized();
    return embedUnprocessedMessages(embeddingConfig, batchSize);
  }

  /**
   * Get vector store statistics
   */
  getVectorStats(): { count: number; byType: Record<string, number> } {
    return getVectorStoreStats();
  }

  // ============================================================
  // ENTITY
  // ============================================================

  async getEntity(id: string): Promise<EntityWithAttributes | null> {
    this.ensureInitialized();

    const db = getDb();

    const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!entity) return null;

    const attributes = db.prepare('SELECT * FROM entity_attributes WHERE entity_id = ?').all(id) as Array<Record<string, unknown>>;

    return {
      id: entity['id'] as string,
      canonicalName: entity['canonical_name'] as string,
      entityType: entity['entity_type'] as import('./types').EntityType,
      createdAt: new Date(entity['created_at'] as string),
      updatedAt: new Date(entity['updated_at'] as string),
      mergeHistory: JSON.parse(entity['merge_history'] as string || '[]'),
      attributes: attributes.map(a => ({
        id: a['id'] as string,
        entityId: a['entity_id'] as string,
        attributeType: a['attribute_type'] as string,
        attributeValue: a['attribute_value'] as string,
        confidence: a['confidence'] as number,
        sourceAssertionId: a['source_assertion_id'] as string | undefined,
        createdAt: new Date(a['created_at'] as string),
      })),
    };
  }

  async findEntities(query: string): Promise<Entity[]> {
    this.ensureInitialized();

    const db = getDb();

    // Search by name or attributes
    const stmt = db.prepare(`
      SELECT DISTINCT e.* FROM entities e
      LEFT JOIN entity_attributes ea ON e.id = ea.entity_id
      WHERE e.canonical_name LIKE ?
         OR ea.attribute_value LIKE ?
      LIMIT 20
    `);

    const results = stmt.all(`%${query}%`, `%${query}%`) as Array<Record<string, unknown>>;

    return results.map(row => ({
      id: row['id'] as string,
      canonicalName: row['canonical_name'] as string,
      entityType: row['entity_type'] as import('./types').EntityType,
      createdAt: new Date(row['created_at'] as string),
      updatedAt: new Date(row['updated_at'] as string),
      mergeHistory: JSON.parse(row['merge_history'] as string || '[]'),
    }));
  }

  async getEntityGraph(id: string, depth: number = 1): Promise<GraphNode | null> {
    this.ensureInitialized();

    const entity = await this.getEntity(id);
    if (!entity) return null;

    const db = getDb();

    // Get edges from this entity
    const edges = db.prepare(`
      SELECT ge.*, e.*
      FROM graph_edges ge
      JOIN entities e ON ge.to_entity_id = e.id
      WHERE ge.from_entity_id = ?
      UNION
      SELECT ge.*, e.*
      FROM graph_edges ge
      JOIN entities e ON ge.from_entity_id = e.id
      WHERE ge.to_entity_id = ?
    `).all(id, id) as Array<Record<string, unknown>>;

    return {
      entity,
      edges: edges.map(row => ({
        edge: {
          id: row['id'] as string,
          fromEntityId: row['from_entity_id'] as string,
          toEntityId: row['to_entity_id'] as string,
          edgeType: row['edge_type'] as string,
          strength: row['strength'] as number,
          evidenceCount: row['evidence_count'] as number,
          lastEvidenceAt: row['last_evidence_at'] ? new Date(row['last_evidence_at'] as string) : undefined,
          createdAt: new Date(row['created_at'] as string),
        },
        connectedEntity: {
          id: row['id'] as string,
          canonicalName: row['canonical_name'] as string,
          entityType: row['entity_type'] as import('./types').EntityType,
          createdAt: new Date(row['created_at'] as string),
          updatedAt: new Date(row['updated_at'] as string),
          mergeHistory: [],
        },
      })),
    };
  }

  // ============================================================
  // PERSONALITY
  // ============================================================

  /**
   * Analyze user's messages to build/update style profile
   */
  analyzeUserStyle(): StyleProfile {
    this.ensureInitialized();
    return analyzeUserStyle();
  }

  /**
   * Get cached user style profile
   */
  async getUserStyle(): Promise<StyleProfile> {
    this.ensureInitialized();

    const db = getDb();
    const row = db.prepare('SELECT * FROM user_style WHERE id = ?').get('default') as Record<string, unknown>;

    return {
      formality: row['formality'] as number,
      verbosity: row['verbosity'] as number,
      emojiDensity: row['emoji_density'] as number,
      avgMessageLength: row['avg_message_length'] as number,
      greetingPatterns: JSON.parse(row['greeting_patterns'] as string || '[]'),
      signoffPatterns: JSON.parse(row['signoff_patterns'] as string || '[]'),
      signaturePhrases: JSON.parse(row['signature_phrases'] as string || '[]'),
      interactionCount: row['interaction_count'] as number,
      updatedAt: new Date(row['updated_at'] as string),
    };
  }

  /**
   * Analyze messages to a specific recipient
   */
  analyzeRecipientStyle(recipientEntityId: string): RecipientStyleProfile | null {
    this.ensureInitialized();
    return analyzeRecipientStyle(recipientEntityId);
  }

  /**
   * Get cached recipient style profile
   */
  async getRecipientStyle(entityId: string): Promise<RecipientStyleProfile | null> {
    this.ensureInitialized();

    const db = getDb();
    const row = db.prepare('SELECT * FROM recipient_styles WHERE recipient_entity_id = ?').get(entityId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      recipientEntityId: row['recipient_entity_id'] as string,
      relationshipType: row['relationship_type'] as import('./types').RelationshipType | undefined,
      formality: row['formality'] as number,
      warmth: row['warmth'] as number,
      emojiUsage: row['emoji_usage'] as number,
      avgResponseTimeHours: row['avg_response_time_hours'] as number | undefined,
      exampleMessages: JSON.parse(row['example_messages'] as string || '[]'),
      messageCount: row['message_count'] as number,
      updatedAt: new Date(row['updated_at'] as string),
    };
  }

  /**
   * Get all recipient style profiles
   */
  getAllRecipientStyles(): RecipientStyleProfile[] {
    this.ensureInitialized();
    return getAllRecipientStyles();
  }

  /**
   * Analyze all recipients and build style profiles
   */
  analyzeAllRecipients(): number {
    this.ensureInitialized();
    return analyzeAllRecipients();
  }

  /**
   * Infer relationship type from communication patterns
   */
  inferRelationshipType(recipientEntityId: string): import('./types').RelationshipType | null {
    this.ensureInitialized();
    return inferRelationshipType(recipientEntityId);
  }

  /**
   * Generate a system prompt for AI drafting that mirrors user's style
   */
  generateMirrorPrompt(recipientEntityId?: string, mirrorLevel: number = 0.7): string {
    this.ensureInitialized();
    return generateMirrorPrompt(recipientEntityId, mirrorLevel);
  }

  /**
   * Calculate rapport score for an AI draft
   */
  async calculateRapportScore(aiDraft: string, recipientEntityId?: string): Promise<number> {
    this.ensureInitialized();
    const userStyle = await this.getUserStyle();
    const recipientStyle = recipientEntityId
      ? await this.getRecipientStyle(recipientEntityId)
      : undefined;
    return calculateRapportScore(aiDraft, userStyle, recipientStyle ?? undefined);
  }

  // ============================================================
  // ENGAGEMENT (internal tracking)
  // ============================================================

  async recordDraftSent(draftId: string, aiLength: number, recipientEntityId?: string): Promise<void> {
    this.ensureInitialized();

    const db = getDb();
    const { v4: uuidv4 } = await import('uuid');

    db.prepare(`
      INSERT INTO engagement_events (id, interaction_type, timestamp, ai_draft_length, recipient_entity_id)
      VALUES (?, 'draft_sent', datetime('now'), ?, ?)
    `).run(uuidv4(), aiLength, recipientEntityId ?? null);
  }

  async recordDraftEdited(draftId: string, userFinalLength: number): Promise<void> {
    this.ensureInitialized();

    // TODO: Find matching draft_sent event and calculate edit_ratio
    // For now, just log the edit
    const db = getDb();
    const { v4: uuidv4 } = await import('uuid');

    db.prepare(`
      INSERT INTO engagement_events (id, interaction_type, timestamp, user_final_length)
      VALUES (?, 'draft_edited', datetime('now'), ?)
    `).run(uuidv4(), userFinalLength);
  }

  async recordUserResponse(threadId: string, sentiment: number): Promise<void> {
    this.ensureInitialized();

    const db = getDb();
    const { v4: uuidv4 } = await import('uuid');

    db.prepare(`
      INSERT INTO engagement_events (id, interaction_type, timestamp, user_response_sentiment)
      VALUES (?, 'response_received', datetime('now'), ?)
    `).run(uuidv4(), sentiment);
  }

  // ============================================================
  // STATS
  // ============================================================

  async getStats(): Promise<{
    entityCount: number;
    messageCount: number;
    assertionCount: number;
    edgeCount: number;
  }> {
    this.ensureInitialized();

    const db = getDb();

    const entityCount = (db.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number }).count;
    const messageCount = (db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count;
    const assertionCount = (db.prepare('SELECT COUNT(*) as count FROM assertions').get() as { count: number }).count;
    const edgeCount = (db.prepare('SELECT COUNT(*) as count FROM graph_edges').get() as { count: number }).count;

    return { entityCount, messageCount, assertionCount, edgeCount };
  }
}

// Default export for convenience
export default PeanutCore;
