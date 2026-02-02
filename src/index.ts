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
  // SEARCH
  // ============================================================

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    this.ensureInitialized();

    const limit = options?.limit ?? 10;

    // TODO: Implement hybrid search in search/fusion.ts
    // For now, just do FTS
    const db = getDb();
    const stmt = db.prepare(`
      SELECT m.*,
             bm25(messages_fts) as score
      FROM messages_fts
      JOIN messages m ON messages_fts.rowid = m.rowid
      WHERE messages_fts MATCH ?
      ORDER BY score
      LIMIT ?
    `);

    const results = stmt.all(query, limit) as Array<Record<string, unknown>>;

    return results.map((row, index) => ({
      id: row['id'] as string,
      type: 'message' as const,
      score: 1 / (index + 1), // Simple rank-based score for now
      source: 'fts' as const,
      data: row as unknown as import('./types').StoredMessage,
    }));
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

  async generateMirrorPrompt(recipientEntityId: string, mirrorLevel: number = 0.7): Promise<string> {
    this.ensureInitialized();

    const userStyle = await this.getUserStyle();
    const recipientStyle = await this.getRecipientStyle(recipientEntityId);

    // TODO: Implement in personality/mirror.ts
    // For now, return a basic prompt
    const formality = recipientStyle?.formality ?? userStyle.formality;
    const warmth = recipientStyle?.warmth ?? 0.5;

    let prompt = 'You are drafting a message. ';

    if (formality > 0.7) {
      prompt += 'Use a formal, professional tone. ';
    } else if (formality < 0.3) {
      prompt += 'Use a casual, friendly tone. ';
    }

    if (warmth > 0.7) {
      prompt += 'Be warm and personable. ';
    }

    if (userStyle.greetingPatterns.length > 0) {
      prompt += `Consider using greetings like: ${userStyle.greetingPatterns.slice(0, 3).join(', ')}. `;
    }

    if (userStyle.signoffPatterns.length > 0) {
      prompt += `Consider sign-offs like: ${userStyle.signoffPatterns.slice(0, 3).join(', ')}. `;
    }

    return prompt;
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
