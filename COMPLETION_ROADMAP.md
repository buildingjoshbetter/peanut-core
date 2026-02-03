# Peanut-Core: Completion Roadmap

> **Purpose**: Actionable roadmap to close the gap between current implementation and the full Peanut-1 vision
> **Generated**: 2026-02-02
> **Updated**: 2026-02-02 (Skippy integration clarification)
> **Based On**: External review of IMPLEMENTATION_REVIEW.md vs PEANUT_IMPLEMENTATION_STRATEGY.md

---

## Architecture Context: Skippy Integration

**Critical**: Peanut-core is the **memory/intelligence engine** for Skippy. It does NOT independently sync data sources.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           SKIPPY                                     │
│  (Tauri Desktop App - handles OAuth, sync, OCR, native features)    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│   │  Gmail   │  │ iMessage │  │ Calendar │  │  Screen  │           │
│   │  Sync    │  │  Reader  │  │  Sync    │  │  Capture │           │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│        │             │             │             │                   │
│        └─────────────┴─────────────┴─────────────┘                   │
│                            │                                         │
│                            ▼                                         │
│        ┌─────────────────────────────────────────┐                  │
│        │         PEANUT-CORE INGEST API          │                  │
│        │                                          │                  │
│        │  ingestEmail()    ingestMessage()       │                  │
│        │  ingestCalendarEvent()  ingestScreen()  │                  │
│        │  ingestEvent()    ingestContact()       │                  │
│        └─────────────────────────────────────────┘                  │
│                            │                                         │
│                            ▼                                         │
│        ┌─────────────────────────────────────────┐                  │
│        │           PEANUT-CORE ENGINE            │                  │
│        │                                          │                  │
│        │  • Entity Resolution                    │                  │
│        │  • Assertion Store                      │                  │
│        │  • Behavioral Intelligence              │                  │
│        │  • Personality Mirror                   │                  │
│        │  • Hybrid Search                        │                  │
│        │  • Proactive Intelligence               │                  │
│        └─────────────────────────────────────────┘                  │
│                            │                                         │
│                            ▼                                         │
│        ┌─────────────────────────────────────────┐                  │
│        │         PEANUT-CORE QUERY API           │                  │
│        │                                          │                  │
│        │  search()  getEntity()  getContext()    │                  │
│        │  generateMirrorPrompt()  getPredictions │                  │
│        └─────────────────────────────────────────┘                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### What Skippy Provides (NOT peanut-core's responsibility):
- Gmail OAuth + sync
- iMessage database reading
- Google Calendar OAuth + sync
- Screen capture + OCR (native)
- Contact sync
- Native notifications

### What Peanut-Core Provides:
- Unified ingest API for all data types
- Entity resolution and graph building
- Assertion extraction and storage
- Behavioral pattern detection
- Personality mirroring
- Hybrid search (FTS + Vector + Graph)
- Proactive intelligence
- Context assembly for LLM

---

## Executive Summary

Peanut-core has a **solid v1 foundation** (~60-65% of strategy). The code quality is good, algorithms are real (not placeholders), and the database schema is comprehensive. However, several critical pillars that differentiate Peanut-1 from a basic memory system are missing or incomplete.

### Current State

| What's Working | What's Missing |
|----------------|----------------|
| ✅ Hybrid search (FTS + Vector + Graph with RRF) | ❌ Clean ingest API for Skippy integration |
| ✅ Entity resolution (4-stage) | ❌ Event processing pipeline |
| ✅ Personality mirroring per-recipient | ❌ Onboarding/bootstrap orchestration |
| ✅ Engagement optimization + vent mode | ❌ Proactive intelligence loop |
| ✅ Behavioral pattern algorithms | ❌ Bi-temporal query support |
| ✅ Comprehensive schema (25+ tables) | ❌ Screen capture ingest handler |
| ✅ Context compartmentalization | ❌ Real-time event processing |
| ✅ PII scrubbing | ❌ Meeting prep generation |

---

## Phase 1: Skippy Integration API (Critical Foundation)

**Why First**: Skippy needs a clean API to feed data into peanut-core. Without this, there's no data flowing.

### 1.1 Unified Ingest API

Create `src/ingest/api.ts` - the primary interface Skippy uses:

```typescript
// ============================================================
// EMAIL INGEST (called by Skippy's Gmail sync)
// ============================================================

export interface EmailIngestPayload {
  sourceId: string;           // Gmail message ID
  threadId: string;
  subject: string | null;
  bodyText: string;
  bodyHtml?: string;
  timestamp: Date;
  from: {
    email: string;
    name?: string;
  };
  to: Array<{
    email: string;
    name?: string;
  }>;
  cc?: Array<{ email: string; name?: string }>;
  isFromUser: boolean;
  labels?: string[];          // Gmail labels
}

export function ingestEmail(payload: EmailIngestPayload): IngestResult;
export function ingestEmailBatch(payloads: EmailIngestPayload[]): BatchIngestResult;

// ============================================================
// MESSAGE INGEST (called by Skippy's iMessage reader)
// ============================================================

export interface MessageIngestPayload {
  sourceId: string;           // iMessage ROWID
  threadId: string;           // Chat ID
  text: string;
  timestamp: Date;
  senderPhone?: string;
  senderEmail?: string;
  isFromUser: boolean;
  participants: Array<{
    phone?: string;
    email?: string;
    name?: string;
  }>;
  attachments?: Array<{
    type: string;
    path: string;
  }>;
}

export function ingestMessage(payload: MessageIngestPayload): IngestResult;
export function ingestMessageBatch(payloads: MessageIngestPayload[]): BatchIngestResult;

// ============================================================
// CALENDAR INGEST (called by Skippy's Calendar sync)
// ============================================================

export interface CalendarEventPayload {
  sourceId: string;           // Google Calendar event ID
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees: Array<{
    email: string;
    name?: string;
    responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  }>;
  isRecurring: boolean;
  meetingLink?: string;
}

export function ingestCalendarEvent(payload: CalendarEventPayload): IngestResult;
export function ingestCalendarBatch(payloads: CalendarEventPayload[]): BatchIngestResult;

// ============================================================
// SCREEN CAPTURE INGEST (called by Skippy's screen capture)
// ============================================================

export interface ScreenCapturePayload {
  timestamp: Date;
  app: string;                // Bundle ID: com.apple.Safari
  windowTitle: string;
  url?: string;               // If browser
  ocrText: string;            // Already OCR'd by Skippy
  screenshotPath?: string;    // Path to stored screenshot
  frameOffset?: number;       // If part of video chunk
}

export function ingestScreenCapture(payload: ScreenCapturePayload): IngestResult;
export function ingestScreenBatch(payloads: ScreenCapturePayload[]): BatchIngestResult;

// ============================================================
// CONTACT INGEST (called by Skippy's contact sync)
// ============================================================

export interface ContactPayload {
  sourceId: string;           // Contacts framework ID
  firstName?: string;
  lastName?: string;
  emails: string[];
  phones: string[];
  company?: string;
  title?: string;
  notes?: string;
}

export function ingestContact(payload: ContactPayload): IngestResult;
export function ingestContactBatch(payloads: ContactPayload[]): BatchIngestResult;

// ============================================================
// GENERIC EVENT INGEST (for behavioral signals)
// ============================================================

export type EventType =
  | 'APP_FOCUS_CHANGED'
  | 'TAB_SWITCHED'
  | 'IDLE_STARTED'
  | 'IDLE_ENDED'
  | 'DEVICE_WAKE'
  | 'DEVICE_SLEEP'
  | 'MEETING_STARTED'
  | 'MEETING_ENDED';

export interface EventPayload {
  eventType: EventType;
  timestamp: Date;
  appId?: string;
  windowTitle?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export function ingestEvent(payload: EventPayload): IngestResult;
export function ingestEventBatch(payloads: EventPayload[]): BatchIngestResult;

// ============================================================
// RESULT TYPES
// ============================================================

export interface IngestResult {
  success: boolean;
  id: string;                 // Internal peanut-core ID
  entitiesCreated: number;
  entitiesLinked: number;
  assertionsCreated: number;
  eventsCreated: number;
  error?: string;
}

export interface BatchIngestResult {
  success: boolean;
  totalProcessed: number;
  totalFailed: number;
  results: IngestResult[];
}
```

### 1.2 Ingest Processing Pipeline

Create `src/ingest/pipeline.ts`:

```typescript
/**
 * Internal pipeline that processes ingested data:
 * 1. PII scrubbing (if configured)
 * 2. Entity extraction and resolution
 * 3. Assertion extraction
 * 4. Event creation
 * 5. Vector embedding (async)
 */
export function processEmailIngest(payload: EmailIngestPayload): IngestResult;
export function processMessageIngest(payload: MessageIngestPayload): IngestResult;
export function processCalendarIngest(payload: CalendarEventPayload): IngestResult;
export function processScreenIngest(payload: ScreenCapturePayload): IngestResult;
export function processContactIngest(payload: ContactPayload): IngestResult;
export function processEventIngest(payload: EventPayload): IngestResult;
```

### 1.3 Event Processing Worker

Create `src/events/processor.ts`:

```typescript
/**
 * Background worker that processes the event stream:
 * 1. Pulls unprocessed events
 * 2. Updates behavioral patterns
 * 3. Updates daily rhythms
 * 4. Generates predictions
 * 5. Checks for proactive triggers
 */
export function processEventBatch(batchSize?: number): ProcessingResult;
export function startEventProcessor(intervalMs?: number): void;
export function stopEventProcessor(): void;
```

**Tasks**:
- [ ] Create unified ingest API with all payload types
- [ ] Implement email ingest → entity resolution → assertions → events
- [ ] Implement message ingest → entity resolution → assertions → events
- [ ] Implement calendar ingest → commitments → events
- [ ] Implement screen capture ingest → OCR indexing → events
- [ ] Implement contact ingest → entity creation/merge
- [ ] Implement generic event ingest
- [ ] Create batch processing with transaction support
- [ ] Add event processing worker
- [ ] Add comprehensive tests for each ingest type

**Acceptance Criteria**:
- `ingestEmail()` creates entities, assertions, and events
- `ingestMessage()` updates recipient_styles
- `ingestCalendarEvent()` creates commitments
- `ingestScreenCapture()` makes OCR text searchable
- Batch operations are atomic (all-or-nothing)
- Event processor detects patterns from ingested events

---

## Phase 2: Onboarding & Analysis Pipeline

**Why Second**: The "holy grail" first impression requires analyzing existing data BEFORE the first interaction. Skippy handles the data sync; peanut-core handles the analysis.

### 2.1 Onboarding Analysis API

Create `src/onboarding/analysis.ts` - called by Skippy after initial sync:

```typescript
/**
 * Skippy orchestrates onboarding:
 * 1. Skippy syncs contacts → calls ingestContactBatch()
 * 2. Skippy syncs emails → calls ingestEmailBatch()
 * 3. Skippy syncs messages → calls ingestMessageBatch()
 * 4. Skippy syncs calendar → calls ingestCalendarBatch()
 * 5. Skippy calls runOnboardingAnalysis() ← THIS IS PEANUT-CORE
 * 
 * This function runs the analysis AFTER data is ingested.
 */
export interface OnboardingConfig {
  runStyleAnalysis: boolean;      // Build user_style, recipient_styles
  runPatternDetection: boolean;   // Build behavioral_patterns
  runRhythmAnalysis: boolean;     // Build daily_rhythms
  runValueExtraction: boolean;    // Build user_values
  topRecipientsLimit?: number;    // Default: 50
}

export interface OnboardingProgress {
  phase: 'style_analysis' | 'pattern_detection' | 'rhythm_analysis' | 'value_extraction' | 'complete';
  percentComplete: number;
  currentTask: string;
}

export type OnboardingProgressCallback = (progress: OnboardingProgress) => void;

export interface OnboardingResult {
  success: boolean;
  duration_ms: number;
  stats: {
    recipientStylesCreated: number;
    patternsDetected: number;
    rhythmSlotsPopulated: number;
    valuesExtracted: number;
  };
  userStyleReady: boolean;  // Can we personalize responses now?
}

/**
 * Run post-ingest analysis to build intelligence models.
 * Call this AFTER Skippy has finished initial data sync.
 */
export async function runOnboardingAnalysis(
  config: OnboardingConfig,
  onProgress?: OnboardingProgressCallback
): Promise<OnboardingResult>;

/**
 * Check if onboarding analysis is complete.
 * Skippy can poll this to know when first interaction is ready.
 */
export function isOnboardingComplete(): boolean;

/**
 * Get current onboarding status.
 */
export function getOnboardingStatus(): {
  analysisComplete: boolean;
  userStyleReady: boolean;
  recipientCount: number;
  patternCount: number;
};
```

### 2.2 Style Analysis Pipeline

Create `src/onboarding/styleAnalysis.ts`:

```typescript
/**
 * Analyzes user's sent messages to build personality model.
 * Must run AFTER email/message ingest.
 */
export function analyzeAllSentMessages(): StyleAnalysisResult;

/**
 * Builds recipient_styles for top N contacts by interaction volume.
 */
export function analyzeTopRecipients(limit?: number): number;

/**
 * Extracts signature phrases, greetings, sign-offs from corpus.
 */
export function extractStylePatterns(): StylePatterns;

/**
 * Get readiness status for personality mirroring.
 */
export function getStyleReadiness(): {
  ready: boolean;
  confidence: number;
  sampleSize: number;
  missingData?: string[];
};
```

### 2.3 Initial Pattern Detection

Create `src/onboarding/patternDetection.ts`:

```typescript
/**
 * Runs pattern detection on historical events.
 * Must run AFTER event creation during ingest.
 */
export function detectInitialPatterns(): {
  habitsFound: number;
  rhythmsFound: number;
  sequencesFound: number;
};

/**
 * Builds daily_rhythms matrix from historical data.
 */
export function buildRhythmMatrix(): void;

/**
 * Get readiness status for behavioral predictions.
 */
export function getPatternReadiness(): {
  ready: boolean;
  patternCount: number;
  confidenceAvg: number;
  daysOfData: number;
};
```

### 2.4 Skippy Integration Example

```typescript
// In Skippy's onboarding flow:

async function onboardUser() {
  // Phase 1: Skippy syncs data
  updateProgress('Syncing contacts...');
  const contacts = await syncGoogleContacts();
  await peanutCore.ingestContactBatch(contacts);

  updateProgress('Syncing emails...');
  const emails = await syncGmail({ maxDays: 365 });
  await peanutCore.ingestEmailBatch(emails);

  updateProgress('Syncing messages...');
  const messages = await readiMessages({ maxDays: 365 });
  await peanutCore.ingestMessageBatch(messages);

  updateProgress('Syncing calendar...');
  const events = await syncGoogleCalendar({ maxDays: 90 });
  await peanutCore.ingestCalendarBatch(events);

  // Phase 2: Peanut-core analyzes data
  updateProgress('Analyzing your communication style...');
  const result = await peanutCore.runOnboardingAnalysis({
    runStyleAnalysis: true,
    runPatternDetection: true,
    runRhythmAnalysis: true,
    runValueExtraction: true,
  }, (progress) => {
    updateProgress(progress.currentTask);
  });

  if (result.userStyleReady) {
    showMessage("I've learned your style! Let's chat.");
  }
}
```

**Tasks**:
- [ ] Create onboarding analysis API
- [ ] Implement style analysis pipeline (analyze sent messages)
- [ ] Implement signature phrase extraction
- [ ] Implement recipient style analysis
- [ ] Create initial pattern detection
- [ ] Build rhythm matrix from historical events
- [ ] Add readiness checks for each model
- [ ] Add progress callbacks for Skippy UI
- [ ] Add tests for analysis pipeline

**Acceptance Criteria**:
- `runOnboardingAnalysis()` completes in <2 minutes for 1 year of data
- `user_style` table populated with real values (not defaults)
- `recipient_styles` has entries for top 50 contacts
- `isOnboardingComplete()` returns true after analysis
- `getStyleReadiness().ready` is true with sufficient data

---

## Phase 3: Proactive Intelligence Loop

**Why Third**: The system should surface information before being asked, not just respond to queries.

### 3.1 Proactive Trigger Service

Create `src/proactive/triggers.ts`:

```typescript
export interface ProactiveTrigger {
  type: 'meeting_prep' | 'deadline_warning' | 'follow_up' | 'pattern_based';
  triggerTime: Date;
  payload: unknown;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Scans for proactive triggers and schedules them.
 * Runs continuously in background.
 */
export function startProactiveService(config: ProactiveConfig): void;
export function stopProactiveService(): void;

/**
 * Get pending triggers for the next N minutes.
 */
export function getPendingTriggers(minutesAhead?: number): ProactiveTrigger[];

/**
 * Mark trigger as surfaced (prevents re-triggering).
 */
export function markTriggerSurfaced(triggerId: string): void;

/**
 * Record user response to proactive suggestion.
 * Used for learning what to surface.
 */
export function recordTriggerFeedback(
  triggerId: string,
  feedback: 'accepted' | 'dismissed' | 'ignored'
): void;
```

### 3.2 Meeting Prep Generator

Create `src/proactive/meetingPrep.ts`:

```typescript
export interface MeetingContext {
  eventId: string;
  title: string;
  startTime: Date;
  attendees: Array<{
    entityId: string;
    name: string;
    relationship: string;
  }>;
  relevantHistory: Array<{
    type: 'email' | 'message' | 'meeting';
    summary: string;
    date: Date;
  }>;
  openCommitments: Commitment[];
  suggestedTopics: string[];
}

/**
 * Generates meeting prep context for upcoming meeting.
 * Scheduled to run 5 minutes before meeting.
 */
export function generateMeetingPrep(calendarEventId: string): MeetingContext;
```

### 3.3 Deadline Warning System

Create `src/proactive/deadlines.ts`:

```typescript
/**
 * Scans commitments for upcoming deadlines.
 * Triggers warnings at configurable intervals.
 */
export function getUpcomingDeadlines(
  daysAhead?: number,
  includeReminded?: boolean
): Commitment[];

/**
 * Mark commitment as reminded to prevent spam.
 */
export function markCommitmentReminded(commitmentId: string): void;
```

**Tasks**:
- [ ] Create proactive trigger service with background loop
- [ ] Implement meeting prep generator
- [ ] Implement deadline warning system
- [ ] Add follow-up suggestion logic
- [ ] Add pattern-based suggestions
- [ ] Create feedback recording for learning
- [ ] Wire to notification system (Tauri)
- [ ] Add tests for proactive triggers

**Acceptance Criteria**:
- Meeting prep surfaces 5 minutes before calendar events
- Deadline warnings trigger 24h and 1h before due date
- User feedback affects future suggestion frequency

---

## Phase 4: Bi-Temporal Query Support

**Why Fourth**: Enables "what did I know about X last month?" queries that differentiate Peanut-1.

### 4.1 Temporal Query Functions

Add to `src/assertions/temporal.ts`:

```typescript
/**
 * Get assertions as they were known at a specific point in time.
 * Uses valid_from/valid_until for what was true.
 * Uses extracted_at for when we learned it.
 */
export function getAssertionsAsOf(
  subjectEntityId: string,
  asOfDate: Date,
  options?: {
    knownAsOf?: Date;  // When we learned it (default: asOfDate)
    predicate?: string;
  }
): Assertion[];

/**
 * Get entity state at a specific point in time.
 */
export function getEntityStateAsOf(
  entityId: string,
  asOfDate: Date
): EntitySnapshot;

/**
 * Get relationship history between two entities.
 */
export function getRelationshipHistory(
  entity1Id: string,
  entity2Id: string,
  startDate?: Date,
  endDate?: Date
): RelationshipTimeline;

/**
 * Diff entity state between two points in time.
 */
export function diffEntityState(
  entityId: string,
  date1: Date,
  date2: Date
): EntityStateDiff;
```

### 4.2 Update Assertion Ingestion

Modify `src/assertions/index.ts` to always capture temporal data:

```typescript
export function createAssertion(input: AssertionInput): string {
  // Always set valid_from to source_timestamp or now
  const validFrom = input.sourceTimestamp || new Date();
  
  // extracted_at is always now (when we learned it)
  const extractedAt = new Date();
  
  // valid_until is null until superseded
  const validUntil = null;
  
  // ... insert with temporal fields
}

/**
 * Supersede an assertion with new information.
 * Sets valid_until on old assertion, creates new one.
 */
export function supersedeAssertion(
  oldAssertionId: string,
  newAssertion: AssertionInput
): string;
```

**Tasks**:
- [ ] Add `getAssertionsAsOf()` with bi-temporal logic
- [ ] Add `getEntityStateAsOf()` for snapshot queries
- [ ] Add `getRelationshipHistory()` for timeline views
- [ ] Add `diffEntityState()` for change detection
- [ ] Update assertion creation to always set temporal fields
- [ ] Add `supersedeAssertion()` for fact updates
- [ ] Add indexes for temporal queries
- [ ] Add tests for time-travel queries

**Acceptance Criteria**:
- Query "Who was Jake's manager in January?" returns correct answer
- Entity diffs show what changed between two dates
- Superseded assertions preserve history

---

## Phase 5: Screen Memory Integration

**Why Fifth**: Enables "Ctrl+F for your life". Skippy handles capture + OCR; peanut-core handles indexing + search.

### 5.1 Architecture (Skippy Integration)

```
┌─────────────────────────────────────────────────────────────────┐
│                         SKIPPY                                   │
│                                                                  │
│   ┌─────────────────┐    ┌─────────────────┐                    │
│   │  Screen Capture │    │  OCR Pipeline   │                    │
│   │  (Rust/Native)  │───▶│ (Apple Vision)  │                    │
│   └─────────────────┘    └────────┬────────┘                    │
│                                   │                              │
│                                   ▼                              │
│                    ┌──────────────────────────┐                 │
│                    │  ingestScreenCapture()   │                 │
│                    │  (peanut-core API)       │                 │
│                    └──────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

**Skippy's responsibility**:
- Screen capture at configurable interval
- H.265/HEVC compression
- Privacy exclusions (apps, URLs)
- OCR using Apple Vision Framework
- Storage management (retention, cleanup)

**Peanut-core's responsibility**:
- Receive OCR'd captures via `ingestScreenCapture()`
- Extract entities from OCR text
- Index text for FTS search
- Create vector embeddings for semantic search
- Link to activity/event context
- Answer "find that document" queries

### 5.2 Screen Ingest Processing

Enhance `src/ingest/pipeline.ts`:

```typescript
export function processScreenIngest(payload: ScreenCapturePayload): IngestResult {
  // 1. Store screen capture metadata
  const captureId = storeScreenCapture(payload);

  // 2. Extract entities from OCR text
  const entities = extractEntitiesFromText(payload.ocrText);
  linkEntitiesToCapture(captureId, entities);

  // 3. Index OCR text for FTS
  indexScreenText(captureId, payload.ocrText);

  // 4. Create vector embedding (async)
  queueEmbeddingJob(captureId, payload.ocrText);

  // 5. Create activity event
  createEvent({
    eventType: 'SCREEN_CAPTURED',
    timestamp: payload.timestamp,
    appId: payload.app,
    windowTitle: payload.windowTitle,
    url: payload.url,
  });

  // 6. Detect context (work/personal)
  const context = detectContextFromScreen(payload);
  updateCaptureContext(captureId, context);

  return { success: true, id: captureId, ... };
}
```

### 5.3 Screen Search API

Enhance `src/search/screen.ts`:

```typescript
export interface ScreenSearchOptions {
  query: string;
  startDate?: Date;
  endDate?: Date;
  apps?: string[];           // Filter by app
  contextType?: 'work' | 'personal';
  limit?: number;
}

export interface ScreenSearchResult {
  captureId: string;
  timestamp: Date;
  app: string;
  windowTitle: string;
  url?: string;
  screenshotPath?: string;
  matchedText: string;       // Highlighted OCR match
  score: number;
}

/**
 * Search screen captures by text.
 * Uses FTS + vector search with RRF fusion.
 */
export function searchScreenCaptures(options: ScreenSearchOptions): ScreenSearchResult[];

/**
 * Get screen captures related to an entity.
 * "Show me everything I looked at about TechCorp"
 */
export function getScreensForEntity(entityId: string, options?: ScreenSearchOptions): ScreenSearchResult[];

/**
 * Get screen captures from a time range.
 * "What was I looking at yesterday afternoon?"
 */
export function getScreensInTimeRange(startDate: Date, endDate: Date, limit?: number): ScreenSearchResult[];
```

### 5.4 Context Assembly Integration

Ensure screen context is included in `assembleContext()`:

```typescript
// In src/synthesis/context.ts

export function assembleContext(recipientId: string, options?: AssemblyOptions): AssembledContext {
  // ... existing context assembly ...

  // Add recent relevant screens
  if (options?.includeScreenContext) {
    const relevantScreens = getScreensForEntity(recipientId, {
      limit: 5,
      startDate: subDays(new Date(), 7),
    });
    
    context.recentScreens = relevantScreens.map(s => ({
      timestamp: s.timestamp,
      app: s.app,
      windowTitle: s.windowTitle,
      summary: s.matchedText.substring(0, 200),
    }));
  }

  return context;
}
```

**Tasks**:
- [ ] Enhance screen capture ingest pipeline
- [ ] Add entity extraction from OCR text
- [ ] Add FTS indexing for screen captures
- [ ] Add vector embedding for semantic search
- [ ] Create screen search API
- [ ] Add entity-based screen retrieval
- [ ] Add time-range screen retrieval
- [ ] Integrate screen context into context assembly
- [ ] Add tests for screen search flow

**Acceptance Criteria**:
- `ingestScreenCapture()` processes OCR text and creates searchable index
- `searchScreenCaptures("agreement")` returns relevant captures
- `getScreensForEntity(jakeId)` returns screens mentioning Jake
- Screen context appears in `assembleContext()` when relevant

---

## Phase 6: Advanced Pattern Detection

**Why Sixth**: Improves prediction accuracy but system works without it.

### 6.1 Prophet Integration (Optional)

If prediction accuracy needs improvement:

```typescript
// src/behavioral/prophet.ts

/**
 * Use Prophet for time-series forecasting of habits.
 * Requires Python sidecar.
 */
export async function forecastHabitOccurrence(
  patternId: string,
  horizonDays: number
): Promise<ProphetForecast>;
```

### 6.2 TSFresh Feature Extraction (Optional)

```typescript
// src/behavioral/features.ts

/**
 * Extract time-series features using TSFresh.
 * Requires Python sidecar.
 */
export async function extractTimeSeriesFeatures(
  events: EventData[]
): Promise<TSFreshFeatures>;
```

**Recommendation**: Defer Prophet/TSFresh to v2. Current heuristic algorithms are sufficient for v1. Evaluate accuracy after real user data.

---

## Phase 7: Performance Optimization

### 7.1 Rust Migration Candidates

| Component | Current | Priority | Rationale |
|-----------|---------|----------|-----------|
| Entity Resolution | TypeScript | Medium | Hot path, called frequently |
| PII Scrubbing | TypeScript | High | Security-critical |
| Event Ingestion | TypeScript | Low | Batch processing, not latency-sensitive |
| Pattern Detection | TypeScript | Low | Runs async, not user-blocking |

**Recommendation**: Migrate PII scrubbing to Rust in v1.1 if processing >10k messages.

### 7.2 Query Optimization

Add indexes identified during review:

```sql
-- Temporal query optimization
CREATE INDEX IF NOT EXISTS idx_assertions_valid_from ON assertions(valid_from);
CREATE INDEX IF NOT EXISTS idx_assertions_valid_until ON assertions(valid_until);
CREATE INDEX IF NOT EXISTS idx_assertions_extracted_at ON assertions(extracted_at);

-- Pattern query optimization
CREATE INDEX IF NOT EXISTS idx_patterns_next_predicted ON behavioral_patterns(next_predicted);
CREATE INDEX IF NOT EXISTS idx_rhythms_hour_day ON daily_rhythms(hour, day_of_week);
```

---

## Implementation Order Summary

```
PHASE 1: Skippy Integration API  [CRITICAL - Unblocks everything]
├── Week 1: Unified ingest API (email, message, calendar, contact, event)
├── Week 2: Ingest processing pipeline (entity resolution, assertions, events)
└── Week 3: Screen capture ingest, batch operations, testing

PHASE 2: Onboarding Analysis     [HIGH - First impression magic]
├── Week 4: Onboarding analysis orchestrator
├── Week 5: Style analysis pipeline
└── Week 6: Pattern detection, rhythm matrix, testing

PHASE 3: Proactive Intelligence  [HIGH - Differentiator]
├── Week 7: Trigger service, meeting prep
└── Week 8: Deadline warnings, feedback loop

PHASE 4: Bi-Temporal Queries     [MEDIUM - Advanced feature]
├── Week 9: Temporal query functions
└── Week 10: Assertion supersession, testing

PHASE 5: Screen Memory Search    [MEDIUM - Skippy provides data]
├── Week 11: Screen search API
└── Week 12: Entity-based retrieval, context integration

PHASE 6: Advanced Patterns       [LOW - v2 scope]
└── Defer to v2

PHASE 7: Performance             [ONGOING]
└── Profile and optimize as needed
```

### Skippy Development Dependencies

| Peanut-Core Phase | Skippy Must Have |
|-------------------|------------------|
| Phase 1 | Gmail sync, iMessage reader, Calendar sync, Contact sync |
| Phase 2 | Initial data sync complete |
| Phase 3 | Calendar sync with event start/end times |
| Phase 5 | Screen capture + OCR pipeline |

---

## Testing Strategy

### Unit Tests Required

| Module | Test File | Coverage Target |
|--------|-----------|-----------------|
| Event Ingestion | `events/ingestion.test.ts` | 90% |
| Event Processing | `events/processor.test.ts` | 85% |
| Bootstrap | `onboarding/bootstrap.test.ts` | 80% |
| Style Analysis | `onboarding/styleAnalysis.test.ts` | 85% |
| Proactive Triggers | `proactive/triggers.test.ts` | 90% |
| Temporal Queries | `assertions/temporal.test.ts` | 95% |

### Integration Tests Required

| Flow | Test File | What It Tests |
|------|-----------|---------------|
| Gmail → Events → Patterns | `integration/gmail-flow.test.ts` | Full email ingestion pipeline |
| Bootstrap → First Query | `integration/bootstrap-query.test.ts` | Style available after bootstrap |
| Calendar → Meeting Prep | `integration/meeting-prep.test.ts` | Proactive surfacing |

### Fixtures Needed

Extend `src/fixtures/`:
- `events.ts` - Sample events of each type
- `timeline.ts` - Multi-day event sequences for pattern detection
- `calendar.ts` - Sample calendar events

---

## Success Metrics

### Phase 1 Complete When:
- [ ] 1000 emails sync produces 1000+ events in `events` table
- [ ] `behavioral_patterns` table has >5 detected patterns
- [ ] Pattern confidence scores are non-zero

### Phase 2 Complete When:
- [ ] Bootstrap command completes in <10 minutes for 1 year history
- [ ] `user_style.formality` is not default 0.5
- [ ] `recipient_styles` has entries for 10+ contacts
- [ ] First "draft email to X" uses recipient-specific style

### Phase 3 Complete When:
- [ ] Meeting prep surfaces 5 minutes before event
- [ ] Deadline warnings trigger correctly
- [ ] User feedback affects future suggestions

### Phase 4 Complete When:
- [ ] "Who was X's manager last month?" returns correct answer
- [ ] Entity diffs show meaningful changes
- [ ] No data loss on assertion supersession

### Phase 5 Complete When:
- [ ] Screenshots captured at 2-second intervals
- [ ] OCR text searchable within 1 minute of capture
- [ ] "Find that agreement" returns relevant screenshots

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Skippy sends data faster than peanut-core can process | Backlog, memory pressure | Add queue with backpressure, batch processing |
| Onboarding analysis takes too long | Poor first experience | Add progress callbacks, allow partial analysis |
| Proactive suggestions annoying | User disables feature | Start conservative, require opt-in |
| Screen OCR quality varies | Poor search results | Confidence scoring, fallback to FTS |
| LLM costs for extraction | Budget overrun | Use local models (Ollama), batch processing |
| Skippy/peanut-core API version mismatch | Runtime errors | Semantic versioning, compatibility checks |
| Large email history overwhelms initial sync | Timeout, OOM | Chunked batch processing, progress streaming |
| Entity resolution creates duplicates | Confusing UX | Quarantine queue for low-confidence merges |

---

## Open Questions

1. **LLM Provider**: Is Ollama sufficient for entity extraction, or do we need cloud LLM for accuracy?
2. **Storage Limits**: What's the target storage budget per user? (Affects screen capture retention in Skippy)
3. **Sync Frequency**: How often does Skippy call peanut-core ingest APIs? Real-time vs. batch?
4. **Multi-Device**: Should peanut-core databases sync across devices, or is it single-device?
5. **Error Handling**: How should peanut-core communicate sync errors back to Skippy?
6. **Rate Limiting**: Should ingest APIs have rate limits to prevent Skippy from overwhelming processing?

---

## Appendix: File Structure After Completion

```
src/
├── ingest/                    # NEW - Primary Skippy interface
│   ├── index.ts              
│   ├── api.ts                # Unified ingest API
│   ├── pipeline.ts           # Processing pipeline
│   └── types.ts              # Payload types
├── events/
│   ├── index.ts
│   ├── processor.ts          # NEW - Background event processing
│   └── types.ts              # NEW
├── onboarding/
│   ├── index.ts              # NEW
│   ├── analysis.ts           # NEW - Post-ingest analysis
│   ├── styleAnalysis.ts      # NEW
│   └── patternDetection.ts   # NEW
├── proactive/
│   ├── index.ts              # NEW
│   ├── triggers.ts           # NEW
│   ├── meetingPrep.ts        # NEW
│   └── deadlines.ts          # NEW
├── assertions/
│   ├── index.ts              # MODIFIED
│   └── temporal.ts           # NEW
├── search/
│   ├── index.ts
│   ├── screen.ts             # NEW - Screen search API
│   └── ... (existing)
└── ... (existing modules)
```

### Skippy Integration Points

| Skippy Component | Peanut-Core API | Data Flow |
|------------------|-----------------|-----------|
| Gmail Sync | `ingestEmail()`, `ingestEmailBatch()` | Skippy → Peanut |
| iMessage Reader | `ingestMessage()`, `ingestMessageBatch()` | Skippy → Peanut |
| Calendar Sync | `ingestCalendarEvent()`, `ingestCalendarBatch()` | Skippy → Peanut |
| Contact Sync | `ingestContact()`, `ingestContactBatch()` | Skippy → Peanut |
| Screen Capture | `ingestScreenCapture()`, `ingestScreenBatch()` | Skippy → Peanut |
| Focus Tracking | `ingestEvent()` | Skippy → Peanut |
| Onboarding UI | `runOnboardingAnalysis()`, `getOnboardingStatus()` | Skippy ↔ Peanut |
| Chat Interface | `search()`, `assembleContext()`, `generateMirrorPrompt()` | Skippy ← Peanut |
| Notifications | `getProactiveSuggestions()`, `getPendingTriggers()` | Skippy ← Peanut |

---

## Appendix: Example Skippy Integration Code

```typescript
// skippy/src/services/peanutIntegration.ts

import * as peanut from 'peanut-core';

// Initialize peanut-core database
export async function initializePeanutCore(dbPath: string) {
  await peanut.db.initDatabase(dbPath);
}

// Called by Gmail sync service
export async function onGmailSync(emails: GmailMessage[]) {
  const payloads = emails.map(e => ({
    sourceId: e.id,
    threadId: e.threadId,
    subject: e.subject,
    bodyText: e.plainText,
    timestamp: new Date(e.internalDate),
    from: e.from,
    to: e.to,
    isFromUser: e.labelIds.includes('SENT'),
  }));
  
  return peanut.ingest.ingestEmailBatch(payloads);
}

// Called by iMessage reader
export async function onMessagesRead(messages: iMessageData[]) {
  const payloads = messages.map(m => ({
    sourceId: String(m.ROWID),
    threadId: m.chat_id,
    text: m.text,
    timestamp: new Date(m.date),
    senderPhone: m.sender_phone,
    isFromUser: m.is_from_me,
    participants: m.participants,
  }));
  
  return peanut.ingest.ingestMessageBatch(payloads);
}

// Called by screen capture service
export async function onScreenCaptured(capture: CaptureData) {
  return peanut.ingest.ingestScreenCapture({
    timestamp: capture.timestamp,
    app: capture.bundleId,
    windowTitle: capture.windowTitle,
    url: capture.url,
    ocrText: capture.ocrResult.text,
    screenshotPath: capture.storagePath,
  });
}

// Called after initial onboarding sync
export async function runPostSyncAnalysis(onProgress: (p: string) => void) {
  return peanut.onboarding.runOnboardingAnalysis({
    runStyleAnalysis: true,
    runPatternDetection: true,
    runRhythmAnalysis: true,
    runValueExtraction: true,
  }, (progress) => {
    onProgress(progress.currentTask);
  });
}

// Called by chat interface
export async function getContextForDraft(recipientEmail: string) {
  const entity = peanut.entities.resolveByEmail(recipientEmail);
  if (!entity) return null;
  
  return peanut.synthesis.assembleContext(entity.id, {
    includeScreenContext: true,
    includeCommitments: true,
  });
}

// Called by chat interface for draft generation
export function getStylePromptForRecipient(recipientEntityId: string) {
  return peanut.personality.generateMirrorPrompt(recipientEntityId);
}

// Called periodically by notification service
export function checkProactiveTriggers() {
  return peanut.proactive.getPendingTriggers(15); // Next 15 minutes
}
```

---

*This roadmap prioritizes shipping a differentiated product. Phases 1-3 are essential for the "digital consciousness" vision. Phases 4-5 are valuable but can follow. Phases 6-7 are refinements. The architecture assumes Skippy handles all data acquisition (OAuth, native APIs, OCR) and peanut-core handles all intelligence (entity resolution, pattern detection, personality mirroring, search).*
