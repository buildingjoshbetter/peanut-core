// Peanut-1 Core Types

// ============================================================
// ENTITY TYPES
// ============================================================

export type EntityType = 'person' | 'org' | 'place' | 'thing';

export interface Entity {
  id: string;
  canonicalName: string;
  entityType: EntityType;
  createdAt: Date;
  updatedAt: Date;
  mergeHistory: string[];
}

export interface EntityAttribute {
  id: string;
  entityId: string;
  attributeType: string;  // 'email', 'phone', 'title', 'alias', 'company'
  attributeValue: string;
  confidence: number;
  sourceAssertionId?: string;
  createdAt: Date;
}

export interface EntityWithAttributes extends Entity {
  attributes: EntityAttribute[];
}

// ============================================================
// ASSERTION TYPES
// ============================================================

export interface Assertion {
  id: string;
  subjectEntityId?: string;
  predicate: string;
  objectText?: string;
  objectEntityId?: string;
  confidence: number;
  sourceType: string;
  sourceId: string;
  sourceTimestamp?: Date;
  extractedAt: Date;
  embeddingId?: string;
}

// ============================================================
// GRAPH TYPES
// ============================================================

export interface GraphEdge {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  edgeType: string;
  strength: number;
  evidenceCount: number;
  lastEvidenceAt?: Date;
  createdAt: Date;
}

export interface GraphNode {
  entity: Entity;
  edges: Array<{
    edge: GraphEdge;
    connectedEntity: Entity;
  }>;
}

// ============================================================
// MESSAGE TYPES
// ============================================================

export type SourceType = 'gmail' | 'imessage' | 'slack';

export interface NormalizedMessage {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  threadId?: string;

  sender: {
    email?: string;
    phone?: string;
    name?: string;
  };

  recipients: Array<{
    email?: string;
    phone?: string;
    name?: string;
    type: 'to' | 'cc' | 'bcc';
  }>;

  subject?: string;
  bodyText: string;
  bodyHtml?: string;

  timestamp: Date;
  isFromUser: boolean;
}

export interface StoredMessage {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  threadId?: string;
  senderEntityId?: string;
  recipientEntityIds: string[];
  subject?: string;
  bodyText: string;
  bodyHtml?: string;
  timestamp: Date;
  isFromUser: boolean;
  processed: boolean;
  createdAt: Date;
}

// ============================================================
// SEARCH TYPES
// ============================================================

export interface SearchResult {
  id: string;
  type: 'message' | 'assertion' | 'entity';
  score: number;
  source: 'vector' | 'fts' | 'graph';
  data: StoredMessage | Assertion | Entity;
}

export interface SearchOptions {
  limit?: number;
  sourceTypes?: SourceType[];
  dateFrom?: Date;
  dateTo?: Date;
  entityIds?: string[];
}

// ============================================================
// PERSONALITY TYPES
// ============================================================

export interface StyleProfile {
  formality: number;        // 0-1: casual to formal
  verbosity: number;        // 0-1: terse to elaborate
  emojiDensity: number;     // emojis per 100 chars
  avgMessageLength: number;
  greetingPatterns: string[];
  signoffPatterns: string[];
  signaturePhrases: string[];
  interactionCount: number;
  updatedAt: Date;
}

export type RelationshipType = 'friend' | 'family' | 'colleague' | 'boss' | 'client' | 'acquaintance';

export interface RecipientStyleProfile {
  recipientEntityId: string;
  relationshipType?: RelationshipType;
  formality: number;
  warmth: number;
  emojiUsage: number;
  avgResponseTimeHours?: number;
  exampleMessages: string[];
  messageCount: number;
  updatedAt: Date;
}

// ============================================================
// ENGAGEMENT TYPES
// ============================================================

export interface EngagementSignal {
  id: string;
  interactionType: 'draft_sent' | 'draft_edited' | 'thread_continued' | 'response_received';
  timestamp: Date;

  // What happened
  aiDraftLength?: number;
  userFinalLength?: number;
  editRatio?: number;
  threadLength?: number;

  // Sentiment
  userResponseSentiment?: number;

  // Context
  contextType?: 'work' | 'personal';
  recipientEntityId?: string;

  // Learning
  learningApplied: boolean;
  personalityDelta?: Record<string, number>;
}

// ============================================================
// EXTRACTION TYPES
// ============================================================

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  attributes: Record<string, string>;  // email, phone, title, etc.
  confidence: number;
}

export interface ExtractedFact {
  subject: string;      // Entity name or reference
  predicate: string;    // 'works_at', 'is_married_to', 'lives_in', etc.
  object: string;       // Entity name or literal value
  confidence: number;
}

// ============================================================
// INGESTION TYPES
// ============================================================

export interface IngestResult {
  messagesIngested: number;
  entitiesCreated: number;
  entitiesMerged: number;
  assertionsCreated: number;
  errors: Array<{ sourceId: string; error: string }>;
}

// ============================================================
// CONFIG TYPES
// ============================================================

export interface PeanutConfig {
  dbPath: string;
  vectorDbPath?: string;
  embeddingModel?: string;
  llmEndpoint?: string;
  userEmail?: string;  // To identify user's own messages
  userPhone?: string;
}
