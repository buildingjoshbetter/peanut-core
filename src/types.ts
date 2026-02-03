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

// Note: EngagementSignal and related types are in ./engagement/tracker.ts

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
  embeddingDimensions?: number;  // Default 768 for nomic-embed-text
  llmEndpoint?: string;
  userEmail?: string;  // To identify user's own messages
  userPhone?: string;
}

// ============================================================
// BI-TEMPORAL ASSERTION TYPES (Strategy Part 11)
// ============================================================

export interface BiTemporalAssertion extends Assertion {
  validFrom?: Date;       // When the fact became true
  validUntil?: Date;      // When the fact stopped being true (null = still true)
  contextId?: string;     // Context boundary this belongs to
  visibilityScope?: 'private' | 'context_only' | 'global';
}

// ============================================================
// CONTEXT TYPES (Strategy Part 8)
// ============================================================

export interface ContextBoundary {
  id: string;
  contextName: string;    // 'work', 'personal', 'family', 'health'
  visibilityPolicy?: Record<string, boolean>;  // Which other contexts can see
  classificationSignals?: Record<string, string[]>;  // How to identify
  formalityFloor: number;
  professionalismRequired: boolean;
  humorAllowed: boolean;
}

export interface ActiveContext {
  sessionId: string;
  currentContext: string;
  detectedAt: Date;
  signals: Record<string, unknown>;
  confidence: number;
  activePersona?: string;
  styleAdjustments?: Record<string, number>;
}

// ============================================================
// COMMITMENT TYPES (Strategy Part 11)
// ============================================================

export type CommitmentType = 'promise' | 'ask' | 'decision' | 'deadline';
export type CommitmentStatus = 'open' | 'completed' | 'broken' | 'cancelled';

export interface Commitment {
  id: string;
  type: CommitmentType;
  description: string;
  ownerEntityId?: string;
  counterpartyEntityId?: string;
  dueDate?: Date;
  status: CommitmentStatus;
  sourceType?: string;
  sourceId?: string;
  sourceTimestamp?: Date;
  createdAt: Date;
  completedAt?: Date;
  reminderSent: boolean;
}

// ============================================================
// GOAL TYPES (Strategy Part 11)
// ============================================================

export type GoalType = 'short_term' | 'long_term' | 'project';
export type GoalStatus = 'active' | 'completed' | 'abandoned';

export interface Goal {
  id: string;
  description: string;
  goalType?: GoalType;
  status: GoalStatus;
  parentGoalId?: string;
  relatedEntities?: string[];
  createdAt: Date;
  targetDate?: Date;
  completedAt?: Date;
}

// ============================================================
// BEHAVIORAL INTELLIGENCE TYPES (Strategy Part 5)
// ============================================================

export type PatternType = 'habit' | 'rhythm' | 'routine' | 'trigger_response';

export interface BehavioralPattern {
  id: string;
  patternType: PatternType;
  description?: string;
  detectedAt: Date;
  timeSignature?: Record<string, unknown>;  // Prophet/TSFresh features
  occurrenceTimes?: string[];  // ISO timestamps
  habitStrength: number;       // 0-1 consistency score
  observationCount: number;
  lastObserved?: Date;
  nextPredicted?: Date;
  confidence: number;
}

export interface DailyRhythm {
  userId: string;
  dayOfWeek: number;  // 0=Monday, 6=Sunday
  hour: number;       // 0-23
  activityDistribution: Record<string, number>;  // {coding: 0.4, email: 0.3}
  focusScoreAvg?: number;
  energyLevelAvg?: number;
  responseTimeAvg?: number;  // Seconds
  messageVolume?: number;
  typicalContext?: string;
}

export type PredictionType = 'next_action' | 'need_surfaced' | 'context_switch';

export interface Prediction {
  id: string;
  predictionType: PredictionType;
  target: string;
  confidence: number;
  predictedTime?: Date;
  basedOnPatterns?: string[];  // Pattern IDs
  contextSignals?: Record<string, unknown>;
  wasCorrect?: boolean;
  actualTime?: Date;
  userFeedback?: string;
  createdAt: Date;
}

// ============================================================
// COGNITIVE MODELING TYPES (Strategy Part 7)
// ============================================================

export type DecisionType = 'purchase' | 'scheduling' | 'priority' | 'response';

export interface DecisionRecord {
  id: string;
  timestamp: Date;
  decisionType?: DecisionType;
  description?: string;
  optionsConsidered?: string[];
  factorsWeighed?: Record<string, number>;
  choiceMade?: string;
  reasoningTrace?: string;
  patternMatch?: string[];  // Similar past decisions
  consistencyWithValues?: number;
}

export interface CognitivePattern {
  id: string;
  patternType: string;  // decision_style, priority_framework, risk_tolerance
  description?: string;
  basedOnDecisions?: string[];
  confidence: number;
  patternParameters?: Record<string, number>;  // {risk_tolerance: 0.3, ...}
}

export interface UserValue {
  id: string;
  valueDomain: string;  // work, relationships, money, time, health
  valueStatement?: string;  // "Prioritizes family over work"
  supportingEvidence?: string[];
  contradictionCount: number;
  confidence: number;
  stability: number;  // How consistent over time
}

// ============================================================
// BELIEF REVISION TYPES (Strategy Part 12)
// ============================================================

export type ContradictionType = 'direct' | 'temporal' | 'confidence';
export type ResolutionStatus = 'pending' | 'resolved' | 'escalated';
export type ResolutionMethod = 'auto' | 'user' | 'llm';

export interface BeliefContradiction {
  id: string;
  assertionId1: string;
  assertionId2: string;
  detectedAt: Date;
  contradictionType?: ContradictionType;
  severity: number;  // 0-1
  resolutionStatus: ResolutionStatus;
  resolvedAt?: Date;
  resolutionMethod?: ResolutionMethod;
  winningAssertionId?: string;
}

export interface BeliefRevisionEvent {
  id: string;
  assertionId: string;
  timestamp: Date;
  oldConfidence: number;
  newConfidence: number;
  reason: 'new_evidence' | 'contradiction' | 'user_correction' | 'decay';
  evidenceSourceId?: string;
  userInitiated: boolean;
}

// ============================================================
// EXTENDED STYLE TYPES (Strategy Part 16)
// ============================================================

export interface ExtendedStyleDimensions {
  id: string;
  userId: string;

  // Linguistic dimensions
  formality: number;
  verbosity: number;
  emojiDensity: number;
  questionFrequency: number;
  exclamationFrequency: number;

  // Emotional dimensions
  positivityBias: number;
  emotionalExpressiveness: number;
  humorFrequency: number;

  // Interaction dimensions
  directness: number;
  detailOrientation: number;

  // Meta
  confidenceScore: number;
  interactionCount: number;
  lastUpdated?: Date;
}

export type RelationshipTypeExtended = 'friend' | 'family' | 'mentor' | 'colleague' | 'boss' | 'client' | 'acquaintance';

// ============================================================
// ENGAGEMENT V2 TYPES (Strategy Part 16)
// ============================================================

export interface EngagementBaseline {
  id: string;
  contextType: string;
  avgResponseLength: number;
  avgThreadLength: number;
  avgSentiment: number;
  avgEditRatio: number;
  sampleCount: number;
  lastUpdated?: Date;
}

export interface RapportMetricsV2 {
  interactionId: string;
  timestamp: Date;
  contextType?: string;

  // Tier 1 signals
  editRatio?: number;
  responseSentiment?: number;
  responseLengthRatio?: number;

  // Tier 2 signals
  threadLength?: number;
  topicDepthScore?: number;

  // Computed
  rawEngagementScore?: number;
  normalizedEngagementScore?: number;

  // State
  ventModeActive: boolean;
  learningApplied: boolean;

  // Audit
  personalitySnapshot?: Record<string, number>;
}

export interface PersonalityEvolution {
  id: string;
  timestamp: Date;
  dimension: string;
  oldValue: number;
  newValue: number;
  delta: number;
  triggerInteractionId?: string;
  engagementScore?: number;
  learningRateUsed?: number;
  wasChangePoint: boolean;
}

// ============================================================
// ETHICAL BOUNDS (Strategy Part 16)
// ============================================================

export interface EthicalBound {
  dimension: string;
  minValue: number;
  maxValue: number;
  description?: string;
}

// ============================================================
// SCREEN MEMORY TYPES (Strategy Part 9)
// ============================================================

export interface ScreenCapture {
  id: string;
  timestamp: Date;
  app?: string;
  windowTitle?: string;
  url?: string;
  screenshotPath?: string;
  frameOffset?: number;
  ocrText?: string;
  embeddingId?: string;
  entities?: string[];
  activityType?: 'browsing' | 'document' | 'chat' | 'code';
  contextType?: string;
  ocrComplete: boolean;
  embeddingComplete: boolean;
}

// ============================================================
// QUARANTINE TYPES (Strategy Part 12)
// ============================================================

export interface QuarantinedEntity {
  id: string;
  potentialEntityId1: string;
  potentialEntityId2: string;
  similarityScore: number;
  quarantineReason: 'low_confidence' | 'ambiguous' | 'conflicting_attributes';
  sourceMessageId?: string;
  createdAt: Date;
  reviewed: boolean;
  reviewDecision?: 'merge' | 'keep_separate' | 'needs_more_info';
  reviewedAt?: Date;
}
