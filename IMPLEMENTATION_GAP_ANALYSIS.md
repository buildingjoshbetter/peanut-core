# Peanut-Core Implementation Gap Analysis

> **Purpose**: Comprehensive audit of peanut-core against PEANUT_IMPLEMENTATION_STRATEGY.md
> **Generated**: 2026-02-02
> **Status**: ✅ **POST-CONSENSUS VALIDATED** (3-model consensus: Gemini 2.5 Pro, GPT-5.2, Claude Sonnet)
> **Confidence**: 8.3/10

---

## Executive Summary

Peanut-core has implemented approximately **40%** of the PEANUT_IMPLEMENTATION_STRATEGY.md vision. The core foundation (entity resolution, search, basic personality) is solid, but major systems are completely missing:

| Category | Implementation % | Status |
|----------|-----------------|--------|
| Core Data Model | 75% | ✅ Solid |
| Entity Resolution | 95% | ✅ Complete |
| Hybrid Search (RRF) | 70% | ⚠️ Vector store is mock |
| Personality Mirror | 80% | ✅ Mostly complete |
| Engagement Optimization | 60% | ⚠️ Missing v2 tables |
| Behavioral Intelligence | 0% | ❌ Not started |
| Cognitive Modeling | 0% | ❌ Not started |
| Context Compartmentalization | 0% | ❌ Not started |
| Screen Memory | 0% | ❌ Not started |
| Commitment/Goal Tracking | 0% | ❌ Not started |
| Proactive Intelligence | 0% | ❌ Not started |

---

## PART 0: DEPENDENCY & CONFIGURATION GAPS

### 0.1 Missing Dependencies

**`package.json` Analysis**:
```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "uuid": "^9.0.0"
  }
}
```

**Strategy Requirements** (Part 14):
```
LANGUAGE: Rust (core services), TypeScript (Tauri frontend)
ML / EMBEDDING: nomic-embed-text, Ollama, Apple Vision, Prophet, TSFresh
STORAGE: SQLite, LanceDB (vector embeddings)
```

**Missing Dependencies** (must be added to package.json):
| Dependency | Purpose | Priority |
|------------|---------|----------|
| `vectordb` (LanceDB) | Persistent vector storage | HIGH |
| `sentiment` | Sentiment analysis for engagement/vent mode | HIGH |
| `natural` or similar | NLP utilities for pattern extraction | MEDIUM |
| `ioredis` (optional) | Cache for hot paths | LOW |

### 0.2 No Migration System

**Current State** (`db/connection.ts:8-193`):
- Schema is embedded as a string constant in the connection file
- No migration versioning or rollback capability
- `schema_version` table exists but is just a marker, not used for migrations

**Strategy Requirement** (Part 12):
- Proper database migrations for schema evolution

**Required Fix**:
- [ ] Create `src/db/migrations/` directory
- [ ] Implement migration runner with up/down support
- [ ] Extract embedded schema to `001_initial.sql`
- [ ] Add new migrations for strategy compliance

### 0.3 Missing PII Scrubbing

**Strategy Requirement** (Part 3):
```
INGESTION PIPELINE
├── PII Scrubber (Rust)
├── Entity Extract (LLM)
├── Entity Resolve (Rust+LLM)
```

**Current Implementation**: NONE

The ingestion pipeline has no PII scrubbing step. Raw email addresses, phone numbers, and potentially sensitive content are stored directly.

**Required Fix**:
- [ ] `src/ingestion/pii.ts` - PII detection and scrubbing
- [ ] Configurable scrubbing rules (what to mask vs. what to keep)
- [ ] Reversible tokens for authorized reconstruction

---

## PART 1: CRITICAL INFRASTRUCTURE GAPS

### 1.1 Vector Store (PRIORITY: HIGH)

**Strategy Requirement** (Part 10, Part 14):
```
STORAGE
├── SQLite (assertions, graph, FTS5, events)
├── LanceDB (vector embeddings)
└── File system (screen captures, documents)
```

**Current Implementation** (`search/embeddings.ts:7-9`):
```typescript
// In-memory vector store for simplicity
// In production, use LanceDB or similar
const vectorStore: Map<string, {...}> = new Map();
```

**Gap**: Vectors are stored in-memory and lost on restart. This breaks:
- Persistent semantic search
- Cross-session memory
- Scalability beyond ~10K documents

**Required Fix**:
1. Install LanceDB: `npm install vectordb`
2. Create `src/db/lancedb.ts` with:
   - `initLanceDb(path: string)`
   - `storeEmbedding(id, embedding, metadata)`
   - `searchVectors(queryEmbedding, limit, filters)`
   - `deleteEmbedding(id)`
3. Migrate `embeddings.ts` to use LanceDB
4. Add `vectorDbPath` to `PeanutConfig` (already present but unused)
5. Store embedding dimensions in config (default 768 for nomic-embed-text)

**Files to Create/Modify**:
- [ ] `src/db/lancedb.ts` (NEW)
- [ ] `src/search/embeddings.ts` (MODIFY)
- [ ] `src/index.ts` (MODIFY - add LanceDB init)

---

### 1.2 Event Log System (PRIORITY: HIGH)

**Strategy Requirement** (Part 4):
```sql
CREATE TABLE events_raw (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,           -- APP_FOCUS_CHANGED, MESSAGE_SENT, DOC_OPENED
  timestamp DATETIME NOT NULL,
  payload JSON NOT NULL,
  app_id TEXT,
  window_title TEXT,
  url TEXT,
  entities JSON,
  context_type TEXT,
  activity_category TEXT,
  processed BOOLEAN DEFAULT FALSE,
  assertion_ids JSON
);
```

**Current Implementation** (`schema.sql:131-144`):
```sql
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    payload JSON NOT NULL,
    context_type TEXT,
    processed BOOLEAN DEFAULT FALSE
);
```

**Gap**: Missing fields:
- `app_id` - Which app generated the event
- `window_title` - Active window context
- `url` - Browser URL if applicable
- `entities` - JSON array of entity references
- `activity_category` - communication, browsing, coding, etc.
- `assertion_ids` - Derived assertions from this event

**Required Fix**:
1. Add migration to alter `events` table
2. Create event type enum/constants
3. Build event ingestion pipeline
4. Add entity linking for events

**Files to Create/Modify**:
- [ ] `src/db/migrations/002_events_extended.sql` (NEW)
- [ ] `src/events/types.ts` (NEW)
- [ ] `src/events/ingestion.ts` (NEW)
- [ ] `src/events/index.ts` (NEW)

---

## PART 2: MISSING MAJOR SYSTEMS

### 2.1 Behavioral Intelligence Layer (PRIORITY: HIGH)

**Strategy Requirement** (Part 5):
- Pattern detection with Prophet/TSFresh
- Daily rhythms tracking
- Prediction engine
- Habit strength scoring

**Current Implementation**: NONE

**Required Tables**:

```sql
-- behavioral_patterns: Detected habits and routines
CREATE TABLE IF NOT EXISTS behavioral_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,         -- habit, rhythm, routine, trigger_response
    description TEXT,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    time_signature JSON,                -- Time-series features
    occurrence_times JSON,              -- When pattern fires
    habit_strength REAL DEFAULT 0.0,    -- 0-1 consistency score
    observation_count INTEGER DEFAULT 0,
    last_observed DATETIME,
    next_predicted DATETIME,
    confidence REAL DEFAULT 0.5
);

-- daily_rhythms: Hour-by-hour activity distributions
CREATE TABLE IF NOT EXISTS daily_rhythms (
    user_id TEXT NOT NULL DEFAULT 'default',
    day_of_week INTEGER NOT NULL,       -- 0=Monday, 6=Sunday
    hour INTEGER NOT NULL,              -- 0-23
    activity_distribution JSON,         -- {coding: 0.4, email: 0.3}
    focus_score_avg REAL,
    energy_level_avg REAL,
    response_time_avg INTEGER,          -- Seconds
    message_volume INTEGER,
    typical_context TEXT,               -- work, personal, mixed
    PRIMARY KEY (user_id, day_of_week, hour)
);

-- predictions: Proactive intelligence
CREATE TABLE IF NOT EXISTS predictions (
    id TEXT PRIMARY KEY,
    prediction_type TEXT NOT NULL,      -- next_action, need_surfaced, context_switch
    target TEXT NOT NULL,               -- What we predict
    confidence REAL,
    predicted_time DATETIME,
    based_on_patterns JSON,
    context_signals JSON,
    was_correct BOOLEAN,
    actual_time DATETIME,
    user_feedback TEXT
);
```

**Required Code**:
- [ ] `src/behavioral/types.ts` - Type definitions
- [ ] `src/behavioral/patterns.ts` - Pattern detection
- [ ] `src/behavioral/rhythms.ts` - Daily rhythm analysis
- [ ] `src/behavioral/predictions.ts` - Prediction engine
- [ ] `src/behavioral/index.ts` - Exports

**Algorithm Requirements**:
1. **Habit Detection**: Analyze event log for recurring patterns
   - Time-of-day triggers (e.g., "checks email after laptop wake")
   - Sequence patterns (e.g., "coffee → email → standup")
   - Frequency analysis with confidence intervals

2. **Rhythm Tracking**: Build hour-by-day activity matrix
   - Aggregate events by (day_of_week, hour)
   - Calculate activity distributions
   - Infer energy levels from response times

3. **Prediction Engine**: Surface context before asked
   - Pre-meeting context (5 min before calendar event)
   - Anticipated needs based on patterns
   - Deadline reminders from commitment tracking

---

### 2.2 Cognitive Modeling (PRIORITY: MEDIUM)

**Strategy Requirement** (Part 7):
- Decision pattern analysis
- Value inference
- Worldview modeling

**Current Implementation**: NONE

**Required Tables**:

```sql
-- decision_records: How user makes decisions
CREATE TABLE IF NOT EXISTS decision_records (
    id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    decision_type TEXT,                 -- purchase, scheduling, priority, response
    description TEXT,
    options_considered JSON,
    factors_weighed JSON,
    choice_made TEXT,
    reasoning_trace TEXT,
    pattern_match JSON,
    consistency_with_values REAL
);

-- cognitive_patterns: Decision styles
CREATE TABLE IF NOT EXISTS cognitive_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,         -- decision_style, priority_framework, risk_tolerance
    description TEXT,
    based_on_decisions JSON,
    confidence REAL,
    pattern_parameters JSON             -- {risk_tolerance: 0.3, ...}
);

-- user_values: Inferred values and priorities
CREATE TABLE IF NOT EXISTS user_values (
    id TEXT PRIMARY KEY,
    value_domain TEXT NOT NULL,         -- work, relationships, money, time, health
    value_statement TEXT,               -- "Prioritizes family over work"
    supporting_evidence JSON,
    contradiction_count INTEGER DEFAULT 0,
    confidence REAL,
    stability REAL                      -- How consistent over time
);
```

**Required Code**:
- [ ] `src/cognitive/types.ts`
- [ ] `src/cognitive/decisions.ts` - Decision tracking
- [ ] `src/cognitive/patterns.ts` - Pattern inference
- [ ] `src/cognitive/values.ts` - Value extraction
- [ ] `src/cognitive/index.ts`

---

### 2.3 Context Compartmentalization (PRIORITY: HIGH)

**Strategy Requirement** (Part 8):
- Hard boundaries between work/personal
- Visibility policies per context
- Persona switching

**Current Implementation**: NONE

**Required Tables**:

```sql
-- context_boundaries: Define work/personal/etc contexts
CREATE TABLE IF NOT EXISTS context_boundaries (
    id TEXT PRIMARY KEY,
    context_name TEXT NOT NULL UNIQUE,  -- 'work', 'personal', 'family', 'health'
    visibility_policy JSON,             -- Which contexts can see this data
    classification_signals JSON,        -- How to identify this context
    formality_floor REAL,               -- Minimum formality
    professionalism_required BOOLEAN DEFAULT FALSE,
    humor_allowed BOOLEAN DEFAULT TRUE
);

-- entity_context_membership: Entity → context mapping
CREATE TABLE IF NOT EXISTS entity_context_membership (
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    context_id TEXT NOT NULL REFERENCES context_boundaries(id) ON DELETE CASCADE,
    confidence REAL DEFAULT 1.0,
    PRIMARY KEY (entity_id, context_id)
);

-- assertion_visibility: Per-assertion visibility scope
CREATE TABLE IF NOT EXISTS assertion_visibility (
    assertion_id TEXT PRIMARY KEY REFERENCES assertions(id) ON DELETE CASCADE,
    context_id TEXT NOT NULL REFERENCES context_boundaries(id),
    visibility_scope TEXT DEFAULT 'context_only'  -- 'private', 'context_only', 'global'
);

-- active_context: Current session context
CREATE TABLE IF NOT EXISTS active_context (
    session_id TEXT PRIMARY KEY,
    current_context TEXT,
    detected_at DATETIME,
    signals JSON,
    confidence REAL,
    active_persona TEXT,
    style_adjustments JSON
);
```

**Required Code**:
- [ ] `src/context/types.ts`
- [ ] `src/context/boundaries.ts` - Define and manage contexts
- [ ] `src/context/detection.ts` - Detect active context from signals
- [ ] `src/context/visibility.ts` - Apply visibility rules to queries
- [ ] `src/context/index.ts`

**Critical Behavior**:
1. When searching, filter results by current context visibility
2. When drafting, apply context-appropriate style floor
3. Never leak work info to personal context or vice versa

---

### 2.4 Screen Memory (PRIORITY: MEDIUM)

**Strategy Requirement** (Part 9):
- Screenshot every 2 seconds
- OCR with Apple Vision
- Semantic search on screen content

**Current Implementation**: NONE

**Required Tables**:

```sql
-- screen_captures: Screenshot metadata and extracted content
CREATE TABLE IF NOT EXISTS screen_captures (
    id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    app TEXT,                           -- com.apple.Safari
    window_title TEXT,
    url TEXT,
    screenshot_path TEXT,               -- Path to compressed image/video
    frame_offset INTEGER,
    ocr_text TEXT,
    embedding_id TEXT,
    entities JSON,
    activity_type TEXT,                 -- browsing, document, chat, code
    context_type TEXT,
    ocr_complete BOOLEAN DEFAULT FALSE,
    embedding_complete BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_screen_timestamp ON screen_captures(timestamp);
CREATE INDEX IF NOT EXISTS idx_screen_app ON screen_captures(app);
CREATE INDEX IF NOT EXISTS idx_screen_context ON screen_captures(context_type);
```

**Required Code** (Note: Strategy says Rust, but TypeScript is acceptable):
- [ ] `src/screen/types.ts`
- [ ] `src/screen/capture.ts` - Screenshot capture service
- [ ] `src/screen/ocr.ts` - OCR using Apple Vision framework
- [ ] `src/screen/search.ts` - Screen content search
- [ ] `src/screen/index.ts`

**Technical Approach**:
1. Use macOS CGWindowListCreateImage for capture
2. Use Vision framework via Swift bridge or node-ffi
3. Compress with H.265 for storage efficiency
4. Privacy exclusions for sensitive apps (banking, health)

---

### 2.5 Commitment & Goal Tracking (PRIORITY: HIGH)

**Strategy Requirement** (Part 11):
- Track promises made to/by user
- Deadline awareness
- Goal hierarchy

**Current Implementation**: NONE

**Required Tables**:

```sql
-- commitments: Promises and deadlines
CREATE TABLE IF NOT EXISTS commitments (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,                 -- promise, ask, decision, deadline
    description TEXT NOT NULL,
    owner_entity_id TEXT REFERENCES entities(id),
    counterparty_entity_id TEXT REFERENCES entities(id),
    due_date DATETIME,
    status TEXT DEFAULT 'open',         -- open, completed, broken, cancelled
    source_type TEXT,
    source_id TEXT,
    source_timestamp DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    reminder_sent BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_commitments_due ON commitments(due_date);
CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status);

-- goals: User objectives
CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    goal_type TEXT,                     -- short_term, long_term, project
    status TEXT DEFAULT 'active',
    parent_goal_id TEXT REFERENCES goals(id),
    related_entities JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    target_date DATETIME,
    completed_at DATETIME
);
```

**Required Code**:
- [ ] `src/commitments/types.ts`
- [ ] `src/commitments/tracker.ts` - Extract and track commitments
- [ ] `src/commitments/reminders.ts` - Deadline warnings
- [ ] `src/goals/tracker.ts` - Goal management
- [ ] `src/commitments/index.ts`

**Extraction Logic**:
- Detect commitment language: "I'll", "I will", "I promise", "by Friday"
- Link to entities (who promised what to whom)
- Parse temporal expressions for due dates

---

## PART 3: INCOMPLETE IMPLEMENTATIONS

### 3.1 Personality Model Dimensions

**Strategy Requirement** (Part 6, Part 16):
```sql
-- user_style_dimensions (LIWC-inspired)
formality, verbosity, emoji_density, question_frequency,
exclamation_frequency, positivity_bias, emotional_expressiveness,
humor_frequency, directness, detail_orientation
```

**Current Implementation** (`schema.sql:148-159`):
```sql
formality, verbosity, emoji_density, avg_message_length,
greeting_patterns, signoff_patterns, signature_phrases
```

**Gap**: Missing dimensions:
- `question_frequency`
- `exclamation_frequency`
- `positivity_bias`
- `emotional_expressiveness`
- `humor_frequency`
- `directness`
- `detail_orientation`

**Required Fix**:
- [ ] Add migration for missing columns in `user_style`
- [ ] Update `personality/extractor.ts` to calculate all dimensions
- [ ] Update `types.ts` `StyleProfile` interface

---

### 3.2 Relationship Types

**Strategy Requirement** (Part 6):
```
relationship_type TEXT  -- friend, family, mentor, colleague, boss, client
```

**Current Implementation** (`types.ts:158`):
```typescript
export type RelationshipType = 'friend' | 'family' | 'colleague' | 'boss' | 'client' | 'acquaintance';
```

**Current Inference** (`personality/extractor.ts:426-429`):
```typescript
if (personalRatio > 0.2) return 'family';
if (workRatio > 0.3) return 'colleague';
if (stats.total > 50) return 'friend';
return 'acquaintance';
```

**Gap**: Missing types and weak inference:
- Missing `mentor` relationship type
- Inference is too simplistic
- Should use sentiment, formality variance, topic diversity

**Required Fix**:
- [ ] Add `mentor` to `RelationshipType`
- [ ] Enhance `inferRelationshipType()` with:
  - Sentiment analysis of messages
  - Formality variance (high variance = close relationship)
  - Topic diversity analysis
  - Response time patterns
  - Message length patterns

---

### 3.3 Engagement Baselines

**Strategy Requirement** (Part 16):
```sql
CREATE TABLE engagement_baselines (
    id TEXT PRIMARY KEY,
    context_type TEXT NOT NULL,  -- 'work_email', 'friend_chat', 'quick_task'
    avg_response_length REAL,
    avg_thread_length REAL,
    avg_sentiment REAL,
    avg_edit_ratio REAL,
    sample_count INTEGER,
    last_updated DATETIME
);
```

**Current Implementation**: NONE

**Gap**: Engagement scores are absolute, not context-normalized. A 3-message work email thread is great; a 3-message deep discussion is poor.

**Required Fix**:
- [ ] Add `engagement_baselines` table
- [ ] Build baseline calculation from historical data
- [ ] Normalize engagement scores by context type in `calculateEngagementScore()`

---

### 3.4 Ethical Bounds

**Strategy Requirement** (Part 16):
```sql
CREATE TABLE ethical_bounds (
    dimension TEXT PRIMARY KEY,
    min_value REAL NOT NULL,
    max_value REAL NOT NULL,
    description TEXT
);

INSERT INTO ethical_bounds VALUES
    ('manipulation_score', 0, 0.3, 'Prevent dark patterns'),
    ('sycophancy_score', 0, 0.4, 'Maintain honesty'),
    ('pressure_tactics', 0, 0.1, 'No urgency manipulation'),
    ('emotional_exploitation', 0, 0.2, 'No vulnerability targeting');
```

**Current Implementation**: NONE

**Gap**: No guardrails against personality adaptation drifting toward manipulation.

**Required Fix**:
- [ ] Add `ethical_bounds` table with seed data
- [ ] Add ethical bounds checking in `applyAdaptation()`
- [ ] Add red flag detection for manipulation patterns

---

### 3.5 Dynamic Prompt Context

**Strategy Requirement** (Part 6):
```sql
CREATE TABLE dynamic_prompt_context (
    session_id TEXT PRIMARY KEY,
    current_recipient_id TEXT,
    current_channel TEXT,
    current_context_type TEXT,
    style_prompt TEXT,
    detected_user_mood TEXT,
    time_of_day_adjustment TEXT,
    formality_floor REAL,
    professionalism_required BOOLEAN,
    last_user_feedback TEXT,
    rapport_score_history JSON
);
```

**Current Implementation**: Prompt generation is stateless in `mirror.ts`

**Gap**: No session state for:
- Current user mood detection
- Time-of-day adjustments
- Feedback history
- Rapport score tracking per session

**Required Fix**:
- [ ] Add `dynamic_prompt_context` table
- [ ] Create session management in `personality/session.ts`
- [ ] Integrate mood detection into prompt generation
- [ ] Track rapport scores per session

---

## PART 4: INGESTION GAPS

### 4.1 Missing Data Sources

**Strategy Requirement** (Part 3):
```
DATA SOURCES
├── Emails (Gmail) ✅
├── iMessage (Local) ✅
├── Calendar (Google) ❌
├── Files (Drive) ❌
├── Slack (API) ❌
├── Screen Capture ❌
```

**Current Implementation**:
- Gmail: ✅ Implemented
- iMessage: ✅ Implemented
- Calendar: ❌ Missing
- Files: ❌ Missing
- Slack: ❌ Missing
- Screen: ❌ Missing

**Required Code**:
- [ ] `src/ingestion/calendar.ts` - Google Calendar API
- [ ] `src/ingestion/slack.ts` - Slack API
- [ ] `src/ingestion/files.ts` - File system scanning

---

## PART 5: API COMPLETENESS

### 5.1 Missing PeanutCore Methods

Based on strategy requirements, the following methods should exist but don't:

```typescript
// Behavioral Intelligence
async detectPatterns(): Promise<BehavioralPattern[]>
async getDailyRhythms(): Promise<DailyRhythm[]>
async getPredictions(): Promise<Prediction[]>
async recordPredictionOutcome(id: string, wasCorrect: boolean): Promise<void>

// Cognitive Modeling
async recordDecision(decision: Decision): Promise<string>
async inferCognitivePatterns(): Promise<CognitivePattern[]>
async getUserValues(): Promise<UserValue[]>

// Context Compartmentalization
async setActiveContext(context: string): Promise<void>
async getActiveContext(): Promise<string>
async searchWithContext(query: string, context: string): Promise<SearchResult[]>

// Commitments
async trackCommitment(commitment: Commitment): Promise<string>
async getOpenCommitments(): Promise<Commitment[]>
async getUpcomingDeadlines(days: number): Promise<Commitment[]>

// Screen Memory
async searchScreens(query: string, options?: ScreenSearchOptions): Promise<ScreenCapture[]>
async getRecentScreens(limit: number): Promise<ScreenCapture[]>

// Proactive Intelligence
async getProactiveSuggestions(): Promise<Suggestion[]>
async surfaceContext(trigger: string): Promise<ContextBundle>
```

---

## PART 6: IMPLEMENTATION PRIORITY ORDER

Based on dependencies and impact:

### Phase 1: Infrastructure (Week 1)
1. **LanceDB Integration** - All vector search depends on this
2. **Extended Events Table** - Behavioral analysis depends on this
3. **Engagement Baselines** - Proper engagement scoring depends on this

### Phase 2: Core Intelligence (Weeks 2-3)
4. **Context Compartmentalization** - Security/privacy critical
5. **Commitment Tracking** - High user value
6. **Behavioral Patterns** - Foundation for predictions

### Phase 3: Advanced Features (Weeks 3-4)
7. **Predictions Engine** - Proactive intelligence
8. **Cognitive Modeling** - Understanding user
9. **Extended Personality Dimensions** - Better mirroring

### Phase 4: Data Sources (Week 4+)
10. **Screen Memory** - Complex, lower priority
11. **Calendar Integration** - Useful for predictions
12. **Slack Integration** - Additional data source

---

## PART 7: DATABASE MIGRATION SCRIPT

Complete migration to bring schema up to strategy spec:

```sql
-- Migration 002: PEANUT_IMPLEMENTATION_STRATEGY.md compliance
-- Run after initial schema.sql

-- 1. Extend events table
ALTER TABLE events ADD COLUMN app_id TEXT;
ALTER TABLE events ADD COLUMN window_title TEXT;
ALTER TABLE events ADD COLUMN url TEXT;
ALTER TABLE events ADD COLUMN entities JSON;
ALTER TABLE events ADD COLUMN activity_category TEXT;
ALTER TABLE events ADD COLUMN assertion_ids JSON;

-- 2. Extend user_style table
ALTER TABLE user_style ADD COLUMN question_frequency REAL DEFAULT 0.5;
ALTER TABLE user_style ADD COLUMN exclamation_frequency REAL DEFAULT 0.3;
ALTER TABLE user_style ADD COLUMN positivity_bias REAL DEFAULT 0.5;
ALTER TABLE user_style ADD COLUMN emotional_expressiveness REAL DEFAULT 0.5;
ALTER TABLE user_style ADD COLUMN humor_frequency REAL DEFAULT 0.3;
ALTER TABLE user_style ADD COLUMN directness REAL DEFAULT 0.5;
ALTER TABLE user_style ADD COLUMN detail_orientation REAL DEFAULT 0.5;

-- 3. Behavioral Intelligence tables
CREATE TABLE IF NOT EXISTS behavioral_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    description TEXT,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    time_signature JSON,
    occurrence_times JSON,
    habit_strength REAL DEFAULT 0.0,
    observation_count INTEGER DEFAULT 0,
    last_observed DATETIME,
    next_predicted DATETIME,
    confidence REAL DEFAULT 0.5
);

CREATE TABLE IF NOT EXISTS daily_rhythms (
    user_id TEXT NOT NULL DEFAULT 'default',
    day_of_week INTEGER NOT NULL,
    hour INTEGER NOT NULL,
    activity_distribution JSON,
    focus_score_avg REAL,
    energy_level_avg REAL,
    response_time_avg INTEGER,
    message_volume INTEGER,
    typical_context TEXT,
    PRIMARY KEY (user_id, day_of_week, hour)
);

CREATE TABLE IF NOT EXISTS predictions (
    id TEXT PRIMARY KEY,
    prediction_type TEXT NOT NULL,
    target TEXT NOT NULL,
    confidence REAL,
    predicted_time DATETIME,
    based_on_patterns JSON,
    context_signals JSON,
    was_correct BOOLEAN,
    actual_time DATETIME,
    user_feedback TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Cognitive Modeling tables
CREATE TABLE IF NOT EXISTS decision_records (
    id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    decision_type TEXT,
    description TEXT,
    options_considered JSON,
    factors_weighed JSON,
    choice_made TEXT,
    reasoning_trace TEXT,
    pattern_match JSON,
    consistency_with_values REAL
);

CREATE TABLE IF NOT EXISTS cognitive_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    description TEXT,
    based_on_decisions JSON,
    confidence REAL,
    pattern_parameters JSON
);

CREATE TABLE IF NOT EXISTS user_values (
    id TEXT PRIMARY KEY,
    value_domain TEXT NOT NULL,
    value_statement TEXT,
    supporting_evidence JSON,
    contradiction_count INTEGER DEFAULT 0,
    confidence REAL,
    stability REAL
);

-- 5. Context Compartmentalization tables
CREATE TABLE IF NOT EXISTS context_boundaries (
    id TEXT PRIMARY KEY,
    context_name TEXT NOT NULL UNIQUE,
    visibility_policy JSON,
    classification_signals JSON,
    formality_floor REAL,
    professionalism_required BOOLEAN DEFAULT FALSE,
    humor_allowed BOOLEAN DEFAULT TRUE
);

-- Seed default contexts
INSERT OR IGNORE INTO context_boundaries (id, context_name, formality_floor, professionalism_required)
VALUES
    ('ctx_work', 'work', 0.6, TRUE),
    ('ctx_personal', 'personal', 0.2, FALSE),
    ('ctx_family', 'family', 0.1, FALSE);

CREATE TABLE IF NOT EXISTS entity_context_membership (
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    context_id TEXT NOT NULL REFERENCES context_boundaries(id) ON DELETE CASCADE,
    confidence REAL DEFAULT 1.0,
    PRIMARY KEY (entity_id, context_id)
);

CREATE TABLE IF NOT EXISTS assertion_visibility (
    assertion_id TEXT PRIMARY KEY REFERENCES assertions(id) ON DELETE CASCADE,
    context_id TEXT NOT NULL REFERENCES context_boundaries(id),
    visibility_scope TEXT DEFAULT 'context_only'
);

CREATE TABLE IF NOT EXISTS active_context (
    session_id TEXT PRIMARY KEY,
    current_context TEXT,
    detected_at DATETIME,
    signals JSON,
    confidence REAL,
    active_persona TEXT,
    style_adjustments JSON
);

-- 6. Commitment & Goal tables
CREATE TABLE IF NOT EXISTS commitments (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    owner_entity_id TEXT REFERENCES entities(id),
    counterparty_entity_id TEXT REFERENCES entities(id),
    due_date DATETIME,
    status TEXT DEFAULT 'open',
    source_type TEXT,
    source_id TEXT,
    source_timestamp DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    reminder_sent BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_commitments_due ON commitments(due_date);
CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status);

CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    goal_type TEXT,
    status TEXT DEFAULT 'active',
    parent_goal_id TEXT REFERENCES goals(id),
    related_entities JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    target_date DATETIME,
    completed_at DATETIME
);

-- 7. Screen Memory table
CREATE TABLE IF NOT EXISTS screen_captures (
    id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    app TEXT,
    window_title TEXT,
    url TEXT,
    screenshot_path TEXT,
    frame_offset INTEGER,
    ocr_text TEXT,
    embedding_id TEXT,
    entities JSON,
    activity_type TEXT,
    context_type TEXT,
    ocr_complete BOOLEAN DEFAULT FALSE,
    embedding_complete BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_screen_timestamp ON screen_captures(timestamp);
CREATE INDEX IF NOT EXISTS idx_screen_app ON screen_captures(app);

-- 8. Engagement Baselines table
CREATE TABLE IF NOT EXISTS engagement_baselines (
    id TEXT PRIMARY KEY,
    context_type TEXT NOT NULL UNIQUE,
    avg_response_length REAL,
    avg_thread_length REAL,
    avg_sentiment REAL,
    avg_edit_ratio REAL,
    sample_count INTEGER DEFAULT 0,
    last_updated DATETIME
);

-- 9. Ethical Bounds table
CREATE TABLE IF NOT EXISTS ethical_bounds (
    dimension TEXT PRIMARY KEY,
    min_value REAL NOT NULL,
    max_value REAL NOT NULL,
    description TEXT
);

INSERT OR IGNORE INTO ethical_bounds VALUES
    ('manipulation_score', 0, 0.3, 'Prevent dark patterns'),
    ('sycophancy_score', 0, 0.4, 'Maintain honesty'),
    ('pressure_tactics', 0, 0.1, 'No urgency manipulation'),
    ('emotional_exploitation', 0, 0.2, 'No vulnerability targeting');

-- 10. Dynamic Prompt Context table
CREATE TABLE IF NOT EXISTS dynamic_prompt_context (
    session_id TEXT PRIMARY KEY,
    current_recipient_id TEXT,
    current_channel TEXT,
    current_context_type TEXT,
    style_prompt TEXT,
    detected_user_mood TEXT,
    time_of_day_adjustment TEXT,
    formality_floor REAL,
    professionalism_required BOOLEAN,
    last_user_feedback TEXT,
    rapport_score_history JSON
);

-- Update schema version
UPDATE schema_version SET version = 2, applied_at = CURRENT_TIMESTAMP;
```

---

## PART 8: FILES TO CREATE

### New Directories:
```
src/
├── behavioral/          # Behavioral Intelligence
│   ├── types.ts
│   ├── patterns.ts
│   ├── rhythms.ts
│   ├── predictions.ts
│   └── index.ts
├── cognitive/           # Cognitive Modeling
│   ├── types.ts
│   ├── decisions.ts
│   ├── patterns.ts
│   ├── values.ts
│   └── index.ts
├── context/             # Context Compartmentalization
│   ├── types.ts
│   ├── boundaries.ts
│   ├── detection.ts
│   ├── visibility.ts
│   └── index.ts
├── commitments/         # Commitment Tracking
│   ├── types.ts
│   ├── tracker.ts
│   ├── reminders.ts
│   └── index.ts
├── goals/               # Goal Tracking
│   ├── types.ts
│   ├── tracker.ts
│   └── index.ts
├── screen/              # Screen Memory
│   ├── types.ts
│   ├── capture.ts
│   ├── ocr.ts
│   ├── search.ts
│   └── index.ts
├── events/              # Extended Events
│   ├── types.ts
│   ├── ingestion.ts
│   └── index.ts
└── db/
    ├── lancedb.ts       # LanceDB integration
    └── migrations/
        └── 002_strategy_compliance.sql
```

### Estimated Lines of Code to Add: ~3,500

---

## PART 9: VALIDATION CHECKLIST

Before considering implementation complete, validate against these criteria from the strategy:

### Retrieval Metrics (Part 13)
- [ ] "Who is Haley?" returns complete context in <100ms
- [ ] "Find that agreement" returns relevant captures with links
- [ ] "What do I owe Sarah?" returns all open commitments with sources

### Prediction Metrics (Part 13)
- [ ] Pre-meeting context surfaces 5 min before, without being asked
- [ ] Intent anticipation >70% accuracy
- [ ] Deadline warnings before due dates

### Rapport Metrics (Part 13)
- [ ] First interaction feels natural
- [ ] Drafts require <20% editing on average
- [ ] Jake email sounds different from Mom email
- [ ] Stressed mode detected and adjusted for

---

## PART 10: CODE-LEVEL ISSUES & BUGS

### 10.1 Assertions Table Missing Bi-Temporal Fields

**Strategy Requirement** (Part 11):
```sql
CREATE TABLE assertions (
  ...
  valid_from DATETIME,
  valid_until DATETIME,
  learned_at DATETIME NOT NULL,
  ...
);
```

**Current Implementation** (`db/connection.ts:37-49`):
```sql
CREATE TABLE IF NOT EXISTS assertions (
    ...
    source_timestamp DATETIME,
    extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ...
);
```

**Gap**: Missing `valid_from` and `valid_until` for temporal queries like "What did I know about X last month?"

### 10.2 No Sentiment Analysis Implementation

**Strategy Requirement** (Part 16):
- Vent mode detection requires `sentiment < -0.5`
- Engagement tracking requires `response_sentiment`

**Current Implementation** (`engagement/adaptation.ts:126-130`):
```typescript
if (options.checkVentMode && signal.userResponseSentiment !== undefined) {
  const ventCheck = detectVentMode(
    signal.userResponseSentiment,  // WHERE DOES THIS COME FROM?
    ...
  );
}
```

**Gap**: The code assumes `userResponseSentiment` is provided externally, but there's no sentiment analysis implementation. The caller must provide pre-computed sentiment, but there's no utility to compute it.

**Required Fix**:
- [ ] Add `src/nlp/sentiment.ts` with sentiment analysis
- [ ] Integrate sentiment calculation into engagement tracking
- [ ] Consider using `sentiment` npm package or Ollama for local inference

### 10.3 Commitment Extraction Missing from LLM Prompts

**Strategy Requirement** (Part 11):
- Extract commitments: promises, asks, decisions, deadlines
- Track "I'll", "I will", "I promise", "by Friday"

**Current Extraction Prompts** (`extraction/types.ts`):
- `ENTITY_EXTRACTION_PROMPT` - extracts people, orgs, places ✓
- `FACT_EXTRACTION_PROMPT` - extracts relationships ✓
- `RELATIONSHIP_EXTRACTION_PROMPT` - extracts relationship types ✓
- **NO COMMITMENT_EXTRACTION_PROMPT** ❌

**Required Fix**:
```typescript
export const COMMITMENT_EXTRACTION_PROMPT = `Extract commitments from this message:
- Promises: "I'll...", "I will...", "I promise..."
- Asks: "Can you...", "Would you...", "Please..."
- Deadlines: "by Friday", "before the meeting", "ASAP"

For each commitment:
- type: "promise", "ask", "deadline"
- owner: Who made/owns the commitment
- counterparty: Who it's to/from
- description: What the commitment is
- due_date: If mentioned (ISO format or null)
- confidence: 0.0 to 1.0

{
  "commitments": [...]
}

Message:
`;
```

### 10.4 Graph Edge Types Incomplete

**Strategy Requirement** (Part 6, Part 10):
```
Relationship types: works_with, reports_to, family, friend, colleague,
                    knows, client, mentor, spouse
```

**Current Implementation** (`search/graph.ts:129-151`):
```typescript
const RELATION_TO_EDGE: Record<string, string[]> = {
  'boss': ['reports_to'],
  'manager': ['reports_to'],
  // ... limited set
};
```

**Gap**: Missing mappings for:
- `mentor` → `mentors` / `mentored_by`
- `client` → `client_of`
- More fine-grained family relationships

### 10.5 Nickname Map Incomplete

**Current Implementation** (`entity/matcher.ts:101-182`):
- Good coverage of English nicknames
- Missing international name variants
- Missing modern/contemporary nicknames

**Examples Missing**:
```typescript
// Add to NICKNAME_MAP
'maximilian': ['max', 'maxi'],
'alexander': ['alex', 'al', 'lex', 'sasha', 'xander'],  // Sasha is Russian variant
'catherine': ['cat', 'cathy', 'kate', 'katie', 'kat', 'kitty', 'kasia'],  // Kasia is Polish
```

### 10.6 Style Profile Missing Dimensions

**Strategy Requirement** (Part 16, user_style_dimensions):
```sql
formality, verbosity, emoji_density, question_frequency,
exclamation_frequency, positivity_bias, emotional_expressiveness,
humor_frequency, directness, detail_orientation
```

**Current Type Definition** (`types.ts:146-156`):
```typescript
export interface StyleProfile {
  formality: number;
  verbosity: number;
  emojiDensity: number;
  avgMessageLength: number;
  greetingPatterns: string[];
  signoffPatterns: string[];
  signaturePhrases: string[];
  interactionCount: number;
  updatedAt: Date;
}
```

**Missing Dimensions**:
- `questionFrequency`
- `exclamationFrequency`
- `positivityBias`
- `emotionalExpressiveness`
- `humorFrequency`
- `directness`
- `detailOrientation`

### 10.7 Embedding Config Not Used in PeanutConfig

**Current PeanutConfig** (`types.ts:208-215`):
```typescript
export interface PeanutConfig {
  dbPath: string;
  vectorDbPath?: string;      // DEFINED BUT NEVER USED
  embeddingModel?: string;    // DEFINED BUT NEVER USED
  llmEndpoint?: string;
  userEmail?: string;
  userPhone?: string;
}
```

**Gap**: `vectorDbPath` and `embeddingModel` are defined but never used. The actual embedding config is passed per-call, not from config.

### 10.8 RelationshipType Enum Mismatch

**Strategy** (Part 6):
```
relationship_type TEXT  -- friend, family, mentor, colleague, boss, client
```

**Current Definition** (`types.ts:158`):
```typescript
export type RelationshipType = 'friend' | 'family' | 'colleague' | 'boss' | 'client' | 'acquaintance';
```

**Gap**: Has `acquaintance` (not in strategy), missing `mentor`.

### 10.9 Inference Logic Too Simplistic

**Current Implementation** (`personality/extractor.ts:426-429`):
```typescript
if (personalRatio > 0.2) return 'family';
if (workRatio > 0.3) return 'colleague';
if (stats.total > 50) return 'friend';
return 'acquaintance';
```

**Issues**:
- Binary thresholds are too rigid
- No consideration of: formality variance, sentiment, topic diversity, response time patterns
- Relationship type should consider multiple signals with weighted scoring

### 10.10 FTS Query Sanitization Limitations

**Current Implementation** (`search/fts.ts:10-33`):
```typescript
function sanitizeFtsQuery(query: string): string {
  let sanitized = query
    .replace(/['"():\-\^*]/g, ' ')
    // ...
}
```

**Issue**: Wraps each word in quotes for exact matching, which prevents:
- Phrase matching
- Proximity queries
- Boolean operators (intentionally?)

Consider adding a `mode` parameter for advanced users.

---

## PART 11: TESTING GAPS

### 11.1 Test Coverage Analysis

**Current Tests** (from Glob):
```
src/engagement/engagement.test.ts
src/fixtures/fixtures.test.ts
```

**Missing Test Coverage**:
- [ ] Entity resolution pipeline tests
- [ ] RRF fusion algorithm tests
- [ ] FTS5 search edge cases
- [ ] Graph traversal tests
- [ ] Personality extraction accuracy tests
- [ ] Ingestion pipeline tests (Gmail, iMessage)
- [ ] LLM extraction mocking tests

### 11.2 No Integration Tests

**Required**:
- Full ingestion → extraction → search pipeline test
- Entity merge/dedup test with realistic data
- Engagement adaptation over time test

---

## PART 12: PERFORMANCE CONSIDERATIONS

### 12.1 In-Memory Vector Store Scalability

**Current** (`embeddings.ts:9`):
```typescript
const vectorStore: Map<string, {...}> = new Map();
```

**Issues**:
- No limit on size
- Linear search (O(n)) for similarity
- Lost on process restart
- Memory pressure with large datasets

**Required**: LanceDB integration with:
- IVF index for approximate nearest neighbor
- Disk-backed storage
- Incremental updates

### 12.2 No Caching Layer

**Strategy Implication**: <100ms response time for "Who is Haley?"

**Current**: Every query hits SQLite directly

**Required Optimizations**:
- [ ] Hot entity cache (LRU)
- [ ] Pre-computed entity summaries
- [ ] Query result caching

### 12.3 No Batch Processing Optimization

**Current Extraction** (`extraction/extractor.ts:192-269`):
- Processes messages one at a time
- Three separate LLM calls per message (entity, fact, relationship)

**Optimization**:
- Combine extraction prompts into single call
- Batch multiple messages per LLM call
- Parallel processing with rate limiting

---

## PART 13: CONSENSUS VALIDATION FINDINGS

> **Validated by**: Gemini 2.5 Pro (9/10), GPT-5.2 (8/10), Claude Sonnet (8/10)
> **Average Confidence**: 8.3/10
> **Date**: 2026-02-02

### 13.1 Additional Gaps Identified by Consensus

The following gaps were identified during 3-model consensus validation and were NOT in the original analysis:

#### 13.1.1 Belief Revision System (CRITICAL)

**Strategy Reference**: Part 12, lines 1015-1020

```
BELIEF REVISION
├── Contradiction detection
├── Confidence updates
├── Human-in-the-loop resolution
└── Time-travel debugging
```

**Current Implementation**: NONE

This is critical for temporal correctness and the "zero hallucination" mandate. Without belief revision, the system cannot:
- Detect when new information contradicts existing assertions
- Update confidence scores based on new evidence
- Allow users to resolve ambiguous/conflicting facts
- Support "What did I know about X last month?" queries

**Required Code**:
- [ ] `src/belief/types.ts` - Contradiction, Resolution types
- [ ] `src/belief/detector.ts` - Contradiction detection
- [ ] `src/belief/resolver.ts` - Resolution with human-in-the-loop
- [ ] `src/belief/index.ts` - Exports

#### 13.1.2 Change Point Detection (PersonalityChangeDetector)

**Strategy Reference**: Part 16, lines 1353-1390

The strategy specifies a CUSUM-based change point detection algorithm to detect when a user's personality genuinely shifts (new job, relationship change, crisis, growth).

**Current Implementation**: NONE

```python
# Required algorithm from strategy
class PersonalityChangeDetector:
    def __init__(self, threshold: float = 3.0, drift_window: int = 20):
        self.cusum_pos = 0
        self.cusum_neg = 0

    def update(self, style_vector) -> bool:
        # CUSUM update for drift detection
        pass
```

**Required Code**:
- [ ] `src/engagement/changepoint.ts` - CUSUM implementation
- [ ] Integration with personality adaptation pipeline

#### 13.1.3 Missing Tables (Part 16 Schema)

**Strategy Reference**: Part 16, lines 1395-1474

The following tables are explicitly defined in the strategy but missing from gap analysis migration script:

| Table | Purpose | Lines |
|-------|---------|-------|
| `rapport_metrics_v2` | Extended engagement tracking with context normalization | 1395-1422 |
| `personality_evolution` | Audit log for personality adaptation (why/how AI changed) | 1425-1444 |
| `user_style_dimensions` | Separate table (NOT ALTER on user_style) with LIWC dimensions | 1446-1474 |

**Required SQL**:
```sql
-- rapport_metrics_v2: Extended engagement tracking
CREATE TABLE IF NOT EXISTS rapport_metrics_v2 (
    interaction_id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    context_type TEXT,
    edit_ratio REAL,
    response_sentiment REAL,
    response_length_ratio REAL,
    thread_length INTEGER,
    topic_depth_score REAL,
    raw_engagement_score REAL,
    normalized_engagement_score REAL,
    vent_mode_active BOOLEAN DEFAULT FALSE,
    learning_applied BOOLEAN DEFAULT FALSE,
    personality_snapshot JSON,
    FOREIGN KEY (context_type) REFERENCES engagement_baselines(context_type)
);

-- personality_evolution: Audit trail for adaptation
CREATE TABLE IF NOT EXISTS personality_evolution (
    id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    dimension TEXT NOT NULL,
    old_value REAL,
    new_value REAL,
    delta REAL,
    trigger_interaction_id TEXT,
    engagement_score REAL,
    learning_rate_used REAL,
    was_change_point BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (trigger_interaction_id) REFERENCES rapport_metrics_v2(interaction_id)
);

-- user_style_dimensions: LIWC-inspired style model
CREATE TABLE IF NOT EXISTS user_style_dimensions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    formality REAL DEFAULT 0.5,
    verbosity REAL DEFAULT 0.5,
    emoji_density REAL DEFAULT 0.0,
    question_frequency REAL DEFAULT 0.5,
    exclamation_frequency REAL DEFAULT 0.3,
    positivity_bias REAL DEFAULT 0.5,
    emotional_expressiveness REAL DEFAULT 0.5,
    humor_frequency REAL DEFAULT 0.3,
    directness REAL DEFAULT 0.5,
    detail_orientation REAL DEFAULT 0.5,
    confidence_score REAL DEFAULT 0.0,
    interaction_count INTEGER DEFAULT 0,
    last_updated DATETIME
);
```

#### 13.1.4 Assertions Table: Missing Context Fields

**Strategy Reference**: Part 11, lines 809-812

The assertions table is missing context boundary fields:

```sql
-- Add to assertions table
ALTER TABLE assertions ADD COLUMN context_id TEXT;
ALTER TABLE assertions ADD COLUMN visibility_scope TEXT DEFAULT 'global';

-- Also add bi-temporal fields (identified earlier but missing from migration)
ALTER TABLE assertions ADD COLUMN valid_from DATETIME;
ALTER TABLE assertions ADD COLUMN valid_until DATETIME;
```

#### 13.1.5 Response Synthesis Layer

**Strategy Reference**: Part 3, lines 225-231

The architecture diagram specifies a RESPONSE SYNTHESIS subsystem:

```
RESPONSE SYNTHESIS
├── Context assembly
├── Citation generation
├── Style matching
├── Commitment checking
├── Proactive surfacing
├── Learning signal
├── Personality mirroring
├── Rapport optimization
└── Mood adaptation
```

**Current Implementation**: Partial (style matching exists, others missing)

**Required Code**:
- [ ] `src/synthesis/types.ts` - Response types
- [ ] `src/synthesis/context.ts` - Context assembly
- [ ] `src/synthesis/citations.ts` - Citation generation
- [ ] `src/synthesis/proactive.ts` - Proactive surfacing logic
- [ ] `src/synthesis/index.ts` - Main synthesis orchestrator

#### 13.1.6 Graph Infrastructure

**Strategy Reference**: Part 12, lines 921-926

```
GRAPH VIEWS (SQLite)
├── Nodes table (entities)
├── Edges table (relationships)
├── Community clusters
└── Temporal views
```

**Current Implementation**: Basic edges only, no community clustering or temporal views

**Required Code**:
- [ ] `src/graph/communities.ts` - Community detection algorithm
- [ ] `src/graph/temporal.ts` - Temporal graph views
- [ ] Add community_id column to entities/nodes

#### 13.1.7 Entity Resolution Quarantine Queue

**Strategy Reference**: Part 12, lines 894-897

```
ENTITY RESOLUTION SERVICE
├── 4-stage pipeline: Exact → Fuzzy → Graph → LLM
├── Quarantine queue for low-confidence
└── Alias tracking
```

**Current Implementation**: 4-stage pipeline exists, quarantine queue missing

**Required**:
- [ ] `quarantine_entities` table for low-confidence resolutions
- [ ] UI for human review of quarantined entities

### 13.2 Priority Corrections

Based on consensus, the following priority adjustments are needed:

| Item | Original Priority | Corrected Priority | Reason |
|------|------------------|-------------------|--------|
| Bi-temporal assertions | Code-level issue | **Phase 1** | Foundational for time-travel queries |
| Belief Revision | Not listed | **Phase 1** | Critical for trust and temporal correctness |
| Screen Memory | Phase 4+ | **Phase 4** (not deprioritized) | Strategy places before Behavioral Intelligence |
| Change Point Detection | Not listed | **Phase 3** | Required for continuous learning |

### 13.3 Completion Estimate Corrections

| Category | Original | Corrected | Notes |
|----------|----------|-----------|-------|
| Engagement Optimization | 90% | **60%** | Missing v2 tables, baselines, ethical bounds |
| Overall | 40% | **35%** | Additional missing systems discovered |

### 13.4 False Positives / Recommendations

The following items from the original analysis are **recommendations**, not strategy mandates:

1. **Package.json dependencies** (natural, ioredis) - Strategy allows Rust/Python for some capabilities
2. **Migration system with up/down** - Best practice, not explicitly required by strategy
3. **TypeScript for screen capture** - Acceptable deviation from strategy's Rust preference

---

## Appendix: Strategy Section References

| Gap | Strategy Part | Lines |
|-----|---------------|-------|
| LanceDB | Part 14 | 1076-1092 |
| Event Log | Part 4 | 246-306 |
| Behavioral Patterns | Part 5 | 314-391 |
| Cognitive Modeling | Part 7 | 554-608 |
| Context Compartmentalization | Part 8 | 619-668 |
| Screen Memory | Part 9 | 676-746 |
| Commitments | Part 11 | 831-855 |
| Goals | Part 11 | 844-855 |
| Engagement Baselines | Part 16 | 1306-1343 |
| Ethical Bounds | Part 16 | 1478-1515 |
| Dynamic Prompt Context | Part 6 | 486-510 |
| **Belief Revision** *(consensus)* | Part 12 | 1015-1020 |
| **Change Point Detection** *(consensus)* | Part 16 | 1353-1390 |
| **rapport_metrics_v2** *(consensus)* | Part 16 | 1395-1422 |
| **personality_evolution** *(consensus)* | Part 16 | 1425-1444 |
| **user_style_dimensions** *(consensus)* | Part 16 | 1446-1474 |
| **Assertions context fields** *(consensus)* | Part 11 | 809-812 |
| **Response Synthesis** *(consensus)* | Part 3 | 225-231 |
| **Graph views/clusters** *(consensus)* | Part 12 | 921-926 |
| **Entity quarantine queue** *(consensus)* | Part 12 | 894-897 |
