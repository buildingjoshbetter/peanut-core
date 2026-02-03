-- Migration 003: Add Missing Tables
-- Generated: 2026-02-02
-- Addresses: Deep audit findings - commitment_participants and decisions tables
--
-- These tables were identified as missing from the schema but actively used
-- by calendar.ts and decisions.ts modules.

-- ============================================================================
-- COMMITMENT PARTICIPANTS
-- Strategy Reference: Part 11 (commitments table extension)
-- Used By: ingestion/calendar.ts
-- ============================================================================

-- Many-to-many relationship between commitments and entities (meeting attendees)
CREATE TABLE IF NOT EXISTS commitment_participants (
    id TEXT PRIMARY KEY,
    commitment_id TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    response_status TEXT,  -- 'accepted', 'declined', 'tentative', 'needsAction'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(commitment_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_commit_part_commitment ON commitment_participants(commitment_id);
CREATE INDEX IF NOT EXISTS idx_commit_part_entity ON commitment_participants(entity_id);
CREATE INDEX IF NOT EXISTS idx_commit_part_status ON commitment_participants(response_status);

-- ============================================================================
-- DECISIONS
-- Strategy Reference: Part 7, lines 555-574 (decision_records)
-- Used By: cognitive/decisions.ts
-- ============================================================================

-- Tracks user decision points for cognitive modeling and pattern inference
CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    decision_type TEXT NOT NULL CHECK(decision_type IN (
        'scheduling', 'communication', 'prioritization',
        'delegation', 'resource', 'commitment', 'other'
    )),
    description TEXT NOT NULL,
    
    -- Decision options presented
    options JSON NOT NULL,  -- Array of {id, label, description, effort, risk}
    
    -- Which option was chosen
    chosen_option_id TEXT,
    
    -- Context at time of decision
    context JSON,  -- {entityIds, commitmentIds, timeConstraints, emotionalState, workloadLevel}
    
    -- Outcome tracking
    outcome JSON,  -- {rating: 'positive'|'neutral'|'negative', notes, recordedAt}
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME,  -- When the choice was made
    
    -- Analysis
    pattern_match JSON,  -- Similar past decisions
    consistency_with_values REAL  -- 0-1 score
);

CREATE INDEX IF NOT EXISTS idx_decisions_type ON decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_decided_at ON decisions(decided_at);
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON decisions(outcome);

-- ============================================================================
-- VALUE CONFLICTS (Supporting table for cognitive/values.ts)
-- ============================================================================

-- Tracks when user values come into conflict with each other
CREATE TABLE IF NOT EXISTS value_conflicts (
    id TEXT PRIMARY KEY,
    value1_name TEXT NOT NULL,
    value2_name TEXT NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    last_occurred DATETIME,
    last_context TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(value1_name, value2_name)
);

CREATE INDEX IF NOT EXISTS idx_value_conflicts_names ON value_conflicts(value1_name, value2_name);
CREATE INDEX IF NOT EXISTS idx_value_conflicts_count ON value_conflicts(occurrence_count);

-- ============================================================================
-- UPDATE SCHEMA VERSION
-- ============================================================================

-- Note: schema_version table may not exist yet, so we use INSERT OR IGNORE
CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY DEFAULT 1,
    version INTEGER NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO schema_version (id, version, applied_at)
VALUES (1, 3, CURRENT_TIMESTAMP);
