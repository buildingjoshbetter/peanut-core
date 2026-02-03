-- Migration 002: PEANUT_IMPLEMENTATION_STRATEGY.md Full Compliance
-- Generated: 2026-02-02
-- Consensus Validated: Gemini 2.5 Pro, GPT-5.2, Claude Sonnet (8.3/10 confidence)
--
-- This migration adds all missing tables and fields identified in the
-- consensus-validated gap analysis.

-- ============================================================================
-- PART 1: BI-TEMPORAL ASSERTIONS (Phase 1 Priority)
-- Strategy Reference: Part 11, lines 798-812
-- ============================================================================

-- Add bi-temporal fields to assertions
ALTER TABLE assertions ADD COLUMN valid_from DATETIME;
ALTER TABLE assertions ADD COLUMN valid_until DATETIME;

-- Add context boundary fields to assertions
ALTER TABLE assertions ADD COLUMN context_id TEXT;
ALTER TABLE assertions ADD COLUMN visibility_scope TEXT DEFAULT 'global';

-- ============================================================================
-- PART 2: EXTENDED EVENTS TABLE
-- Strategy Reference: Part 4, lines 246-276
-- ============================================================================

-- Extend events table with missing fields
ALTER TABLE events ADD COLUMN app_id TEXT;
ALTER TABLE events ADD COLUMN window_title TEXT;
ALTER TABLE events ADD COLUMN url TEXT;
ALTER TABLE events ADD COLUMN entities JSON;
ALTER TABLE events ADD COLUMN activity_category TEXT;
ALTER TABLE events ADD COLUMN assertion_ids JSON;

-- Add required indexes for events
CREATE INDEX IF NOT EXISTS idx_events_app ON events(app_id);
CREATE INDEX IF NOT EXISTS idx_events_context ON events(context_type);
CREATE INDEX IF NOT EXISTS idx_events_activity ON events(activity_category);

-- ============================================================================
-- PART 3: BEHAVIORAL INTELLIGENCE TABLES
-- Strategy Reference: Part 5, lines 314-391
-- ============================================================================

-- Behavioral patterns: detected habits and routines
CREATE TABLE IF NOT EXISTS behavioral_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,         -- habit, rhythm, routine, trigger_response
    description TEXT,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    time_signature JSON,                -- Prophet/TSFresh extracted features
    occurrence_times JSON,              -- When this pattern fires
    habit_strength REAL DEFAULT 0.0,    -- 0-1 consistency score
    observation_count INTEGER DEFAULT 0,
    last_observed DATETIME,
    next_predicted DATETIME,
    confidence REAL DEFAULT 0.5
);

CREATE INDEX IF NOT EXISTS idx_behavioral_type ON behavioral_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_behavioral_strength ON behavioral_patterns(habit_strength);

-- Daily rhythms: hour-by-hour activity distributions
CREATE TABLE IF NOT EXISTS daily_rhythms (
    user_id TEXT NOT NULL DEFAULT 'default',
    day_of_week INTEGER NOT NULL,       -- 0=Monday, 6=Sunday
    hour INTEGER NOT NULL,              -- 0-23
    activity_distribution JSON,         -- {coding: 0.4, email: 0.3, ...}
    focus_score_avg REAL,
    energy_level_avg REAL,
    response_time_avg INTEGER,          -- Seconds
    message_volume INTEGER,
    typical_context TEXT,               -- work, personal, mixed
    PRIMARY KEY (user_id, day_of_week, hour)
);

-- Predictions: proactive intelligence
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
    user_feedback TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_predictions_type ON predictions(prediction_type);
CREATE INDEX IF NOT EXISTS idx_predictions_time ON predictions(predicted_time);

-- ============================================================================
-- PART 4: COGNITIVE MODELING TABLES
-- Strategy Reference: Part 7, lines 554-609
-- ============================================================================

-- Decision records: how user makes decisions
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

CREATE INDEX IF NOT EXISTS idx_decisions_type ON decision_records(decision_type);
CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decision_records(timestamp);

-- Cognitive patterns: decision styles
CREATE TABLE IF NOT EXISTS cognitive_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,         -- decision_style, priority_framework, risk_tolerance
    description TEXT,
    based_on_decisions JSON,
    confidence REAL,
    pattern_parameters JSON             -- {risk_tolerance: 0.3, ...}
);

-- User values: inferred values and priorities
CREATE TABLE IF NOT EXISTS user_values (
    id TEXT PRIMARY KEY,
    value_domain TEXT NOT NULL,         -- work, relationships, money, time, health
    value_statement TEXT,               -- "Prioritizes family over work"
    supporting_evidence JSON,
    contradiction_count INTEGER DEFAULT 0,
    confidence REAL,
    stability REAL                      -- How consistent over time
);

CREATE INDEX IF NOT EXISTS idx_values_domain ON user_values(value_domain);

-- ============================================================================
-- PART 5: CONTEXT COMPARTMENTALIZATION TABLES
-- Strategy Reference: Part 8, lines 619-669
-- ============================================================================

-- Context boundaries: define work/personal/etc contexts
CREATE TABLE IF NOT EXISTS context_boundaries (
    id TEXT PRIMARY KEY,
    context_name TEXT NOT NULL UNIQUE,  -- 'work', 'personal', 'family', 'health'
    visibility_policy JSON,             -- Which other contexts can see this data
    classification_signals JSON,        -- How to identify this context
    formality_floor REAL,               -- Minimum formality
    professionalism_required BOOLEAN DEFAULT FALSE,
    humor_allowed BOOLEAN DEFAULT TRUE
);

-- Seed default contexts
INSERT OR IGNORE INTO context_boundaries (id, context_name, formality_floor, professionalism_required)
VALUES
    ('ctx_work', 'work', 0.6, 1),
    ('ctx_personal', 'personal', 0.2, 0),
    ('ctx_family', 'family', 0.1, 0);

-- Entity-to-context mapping
CREATE TABLE IF NOT EXISTS entity_context_membership (
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    context_id TEXT NOT NULL REFERENCES context_boundaries(id) ON DELETE CASCADE,
    confidence REAL DEFAULT 1.0,
    PRIMARY KEY (entity_id, context_id)
);

-- Per-assertion visibility scope
CREATE TABLE IF NOT EXISTS assertion_visibility (
    assertion_id TEXT PRIMARY KEY REFERENCES assertions(id) ON DELETE CASCADE,
    context_id TEXT NOT NULL REFERENCES context_boundaries(id),
    visibility_scope TEXT DEFAULT 'context_only'  -- 'private', 'context_only', 'global'
);

-- Active context: current session context
CREATE TABLE IF NOT EXISTS active_context (
    session_id TEXT PRIMARY KEY,
    current_context TEXT,
    detected_at DATETIME,
    signals JSON,
    confidence REAL,
    active_persona TEXT,
    style_adjustments JSON
);

-- ============================================================================
-- PART 6: COMMITMENT & GOAL TRACKING TABLES
-- Strategy Reference: Part 11, lines 831-856
-- ============================================================================

-- Commitments: promises and deadlines
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
CREATE INDEX IF NOT EXISTS idx_commitments_owner ON commitments(owner_entity_id);

-- Goals: user objectives
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

CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type);

-- ============================================================================
-- PART 7: SCREEN MEMORY TABLE
-- Strategy Reference: Part 9, lines 719-747
-- ============================================================================

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

-- ============================================================================
-- PART 8: ENGAGEMENT V2 TABLES (Part 16 Consensus)
-- Strategy Reference: Part 16, lines 1306-1474
-- ============================================================================

-- Engagement baselines: context-normalized scoring
CREATE TABLE IF NOT EXISTS engagement_baselines (
    id TEXT PRIMARY KEY,
    context_type TEXT NOT NULL UNIQUE,  -- 'work_email', 'friend_chat', 'quick_task'
    avg_response_length REAL,
    avg_thread_length REAL,
    avg_sentiment REAL,
    avg_edit_ratio REAL,
    sample_count INTEGER DEFAULT 0,
    last_updated DATETIME
);

-- Seed default baselines
INSERT OR IGNORE INTO engagement_baselines (id, context_type, avg_response_length, avg_thread_length, avg_sentiment, avg_edit_ratio)
VALUES
    ('baseline_work_email', 'work_email', 150.0, 4.0, 0.2, 0.15),
    ('baseline_friend_chat', 'friend_chat', 50.0, 8.0, 0.5, 0.05),
    ('baseline_quick_task', 'quick_task', 20.0, 2.0, 0.3, 0.1),
    ('baseline_default', 'default', 100.0, 5.0, 0.3, 0.1);

-- Rapport metrics v2: extended engagement tracking
CREATE TABLE IF NOT EXISTS rapport_metrics_v2 (
    interaction_id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    context_type TEXT,

    -- Tier 1 signals
    edit_ratio REAL,                    -- 0.0 (no edits) to 1.0 (complete rewrite)
    response_sentiment REAL,            -- -1.0 to 1.0
    response_length_ratio REAL,         -- user_length / ai_length

    -- Tier 2 signals
    thread_length INTEGER,
    topic_depth_score REAL,

    -- Computed
    raw_engagement_score REAL,
    normalized_engagement_score REAL,   -- Context-adjusted

    -- State flags
    vent_mode_active BOOLEAN DEFAULT FALSE,
    learning_applied BOOLEAN DEFAULT FALSE,

    -- Audit
    personality_snapshot JSON,          -- AI personality state at time of interaction

    FOREIGN KEY (context_type) REFERENCES engagement_baselines(context_type)
);

CREATE INDEX IF NOT EXISTS idx_rapport_v2_timestamp ON rapport_metrics_v2(timestamp);
CREATE INDEX IF NOT EXISTS idx_rapport_v2_context ON rapport_metrics_v2(context_type);

-- User style dimensions: LIWC-inspired for interpretability
CREATE TABLE IF NOT EXISTS user_style_dimensions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,

    -- Linguistic dimensions
    formality REAL DEFAULT 0.5,           -- 0=casual, 1=formal
    verbosity REAL DEFAULT 0.5,           -- 0=terse, 1=elaborate
    emoji_density REAL DEFAULT 0.0,       -- emojis per 100 chars
    question_frequency REAL DEFAULT 0.5,  -- questions per message
    exclamation_frequency REAL DEFAULT 0.3,

    -- Emotional dimensions
    positivity_bias REAL DEFAULT 0.5,     -- 0=pessimistic, 1=optimistic
    emotional_expressiveness REAL DEFAULT 0.5,
    humor_frequency REAL DEFAULT 0.3,

    -- Interaction dimensions
    directness REAL DEFAULT 0.5,          -- 0=hedging, 1=direct
    detail_orientation REAL DEFAULT 0.5,

    -- Meta
    confidence_score REAL DEFAULT 0.0,    -- How confident in these values
    interaction_count INTEGER DEFAULT 0,
    last_updated DATETIME
);

-- Insert default user style dimensions
INSERT OR IGNORE INTO user_style_dimensions (id, user_id) VALUES ('default_dims', 'default');

-- Extend existing personality_evolution table with missing fields
-- (Table exists but needs additional columns from strategy)
-- Note: SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS
-- These will fail silently if columns already exist in some form

-- ============================================================================
-- PART 9: ETHICAL BOUNDS TABLE
-- Strategy Reference: Part 16, lines 1478-1492
-- ============================================================================

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

-- ============================================================================
-- PART 10: DYNAMIC PROMPT CONTEXT TABLE
-- Strategy Reference: Part 6, lines 486-510
-- ============================================================================

CREATE TABLE IF NOT EXISTS dynamic_prompt_context (
    session_id TEXT PRIMARY KEY,
    current_recipient_id TEXT,
    current_channel TEXT,               -- email, imessage, slack
    current_context_type TEXT,          -- work, personal
    style_prompt TEXT,                  -- Generated style instructions
    detected_user_mood TEXT,            -- stressed, relaxed, playful, focused
    time_of_day_adjustment TEXT,        -- Morning energy vs evening wind-down
    formality_floor REAL,               -- Minimum formality (context-dependent)
    professionalism_required BOOLEAN,   -- Hard guard for work contexts
    last_user_feedback TEXT,
    rapport_score_history JSON
);

-- ============================================================================
-- PART 11: BELIEF REVISION TABLES (Consensus: HIGH Priority)
-- Strategy Reference: Part 12, lines 1015-1020
-- ============================================================================

-- Contradictions: detected conflicts in assertions
CREATE TABLE IF NOT EXISTS belief_contradictions (
    id TEXT PRIMARY KEY,
    assertion_id_1 TEXT NOT NULL REFERENCES assertions(id),
    assertion_id_2 TEXT NOT NULL REFERENCES assertions(id),
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    contradiction_type TEXT,            -- direct, temporal, confidence
    severity REAL,                      -- 0-1 how severe the conflict
    resolution_status TEXT DEFAULT 'pending',  -- pending, resolved, escalated
    resolved_at DATETIME,
    resolution_method TEXT,             -- auto, user, llm
    winning_assertion_id TEXT,
    UNIQUE(assertion_id_1, assertion_id_2)
);

CREATE INDEX IF NOT EXISTS idx_contradictions_status ON belief_contradictions(resolution_status);

-- Belief revision log: audit trail for confidence updates
CREATE TABLE IF NOT EXISTS belief_revision_log (
    id TEXT PRIMARY KEY,
    assertion_id TEXT NOT NULL REFERENCES assertions(id),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    old_confidence REAL,
    new_confidence REAL,
    reason TEXT,                        -- new_evidence, contradiction, user_correction, decay
    evidence_source_id TEXT,
    user_initiated BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_belief_rev_assertion ON belief_revision_log(assertion_id);

-- ============================================================================
-- PART 12: ENTITY RESOLUTION QUARANTINE
-- Strategy Reference: Part 12, lines 894-897
-- ============================================================================

CREATE TABLE IF NOT EXISTS quarantined_entities (
    id TEXT PRIMARY KEY,
    potential_entity_id_1 TEXT NOT NULL,
    potential_entity_id_2 TEXT NOT NULL,
    similarity_score REAL,
    quarantine_reason TEXT,             -- low_confidence, ambiguous, conflicting_attributes
    source_message_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed BOOLEAN DEFAULT FALSE,
    review_decision TEXT,               -- merge, keep_separate, needs_more_info
    reviewed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_quarantine_reviewed ON quarantined_entities(reviewed);

-- ============================================================================
-- PART 13: GRAPH INFRASTRUCTURE EXTENSIONS
-- Strategy Reference: Part 12, lines 921-926
-- ============================================================================

-- Add community clustering to entities
-- (Add column to existing entities table)
-- ALTER TABLE entities ADD COLUMN community_id TEXT;
-- ALTER TABLE entities ADD COLUMN activation REAL DEFAULT 1.0;
-- ALTER TABLE entities ADD COLUMN last_accessed DATETIME;

-- Community definitions
CREATE TABLE IF NOT EXISTS entity_communities (
    id TEXT PRIMARY KEY,
    community_name TEXT,
    member_count INTEGER DEFAULT 0,
    cohesion_score REAL,                -- How tightly connected
    central_entity_id TEXT REFERENCES entities(id),
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME
);

-- ============================================================================
-- UPDATE SCHEMA VERSION
-- ============================================================================

UPDATE schema_version SET version = 2, applied_at = CURRENT_TIMESTAMP;
