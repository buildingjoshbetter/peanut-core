-- Peanut-1 Database Schema
-- Local-first AI memory system

------------------------------------------------------------
-- ENTITIES: Unified people/orgs/places
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('person', 'org', 'place', 'thing')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    merge_history JSON DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);

------------------------------------------------------------
-- ENTITY ATTRIBUTES: Email, phone, aliases, etc.
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entity_attributes (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    attribute_type TEXT NOT NULL,  -- 'email', 'phone', 'title', 'alias', 'company'
    attribute_value TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    source_assertion_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_id, attribute_type, attribute_value)
);

CREATE INDEX IF NOT EXISTS idx_entity_attrs_lookup ON entity_attributes(attribute_type, attribute_value);
CREATE INDEX IF NOT EXISTS idx_entity_attrs_entity ON entity_attributes(entity_id);

------------------------------------------------------------
-- ASSERTIONS: Immutable facts extracted from sources
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assertions (
    id TEXT PRIMARY KEY,
    subject_entity_id TEXT REFERENCES entities(id),
    predicate TEXT NOT NULL,  -- 'works_at', 'is_married_to', 'lives_in', 'knows', etc.
    object_text TEXT,
    object_entity_id TEXT REFERENCES entities(id),
    confidence REAL DEFAULT 1.0,
    source_type TEXT NOT NULL,  -- 'email', 'message', 'calendar', 'manual'
    source_id TEXT NOT NULL,
    source_timestamp DATETIME,
    extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    embedding_id TEXT  -- Reference to vector store
);

CREATE INDEX IF NOT EXISTS idx_assertions_subject ON assertions(subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_assertions_object ON assertions(object_entity_id);
CREATE INDEX IF NOT EXISTS idx_assertions_predicate ON assertions(predicate);
CREATE INDEX IF NOT EXISTS idx_assertions_source ON assertions(source_type, source_id);

------------------------------------------------------------
-- GRAPH EDGES: Derived/aggregated relationships
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    edge_type TEXT NOT NULL,  -- 'works_with', 'family', 'knows', 'reports_to'
    strength REAL DEFAULT 1.0,
    evidence_count INTEGER DEFAULT 1,
    last_evidence_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_entity_id, to_entity_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON graph_edges(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON graph_edges(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON graph_edges(edge_type);

------------------------------------------------------------
-- MESSAGES: Raw ingested content
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,  -- 'gmail', 'imessage', 'slack'
    source_id TEXT NOT NULL,    -- Original ID from source
    thread_id TEXT,
    sender_entity_id TEXT REFERENCES entities(id),
    recipient_entity_ids JSON,  -- Array of entity IDs
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    timestamp DATETIME NOT NULL,
    is_from_user BOOLEAN DEFAULT FALSE,
    processed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_entity_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_processed ON messages(processed);

------------------------------------------------------------
-- FTS5 VIRTUAL TABLE for full-text search
------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    subject,
    body_text,
    content=messages,
    content_rowid=rowid
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, subject, body_text)
    VALUES (NEW.rowid, NEW.subject, NEW.body_text);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, subject, body_text)
    VALUES('delete', OLD.rowid, OLD.subject, OLD.body_text);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, subject, body_text)
    VALUES('delete', OLD.rowid, OLD.subject, OLD.body_text);
    INSERT INTO messages_fts(rowid, subject, body_text)
    VALUES (NEW.rowid, NEW.subject, NEW.body_text);
END;

------------------------------------------------------------
-- EVENTS: Behavioral signals
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,  -- 'app_focus', 'message_sent', 'draft_created', etc.
    timestamp DATETIME NOT NULL,
    payload JSON NOT NULL,
    context_type TEXT,  -- 'work', 'personal'
    processed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

------------------------------------------------------------
-- USER STYLE: Global personality model
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_style (
    id TEXT PRIMARY KEY DEFAULT 'default',
    formality REAL DEFAULT 0.5,
    verbosity REAL DEFAULT 0.5,
    emoji_density REAL DEFAULT 0.0,
    avg_message_length INTEGER DEFAULT 0,
    greeting_patterns JSON DEFAULT '[]',
    signoff_patterns JSON DEFAULT '[]',
    signature_phrases JSON DEFAULT '[]',
    interaction_count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Initialize default row
INSERT OR IGNORE INTO user_style (id) VALUES ('default');

------------------------------------------------------------
-- RECIPIENT STYLES: Per-relationship style adjustments
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipient_styles (
    recipient_entity_id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    relationship_type TEXT,  -- 'friend', 'family', 'colleague', 'boss', 'client'
    formality REAL DEFAULT 0.5,
    warmth REAL DEFAULT 0.5,
    emoji_usage REAL DEFAULT 0.0,
    avg_response_time_hours REAL,
    example_messages JSON DEFAULT '[]',
    message_count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

------------------------------------------------------------
-- ENGAGEMENT EVENTS: Implicit feedback tracking
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_events (
    id TEXT PRIMARY KEY,
    interaction_type TEXT NOT NULL,  -- 'draft_sent', 'draft_edited', 'thread_continued'
    timestamp DATETIME NOT NULL,

    -- What happened
    ai_draft_length INTEGER,
    user_final_length INTEGER,
    edit_ratio REAL,
    thread_length INTEGER,

    -- Sentiment
    user_response_sentiment REAL,

    -- Context
    context_type TEXT,
    recipient_entity_id TEXT REFERENCES entities(id),

    -- Did we learn from this?
    learning_applied BOOLEAN DEFAULT FALSE,
    personality_delta JSON
);

CREATE INDEX IF NOT EXISTS idx_engagement_timestamp ON engagement_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_engagement_type ON engagement_events(interaction_type);

------------------------------------------------------------
-- PERSONALITY EVOLUTION: Audit log of style changes
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personality_evolution (
    id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    dimension TEXT NOT NULL,  -- 'formality', 'verbosity', 'emoji_density', etc.
    old_value REAL,
    new_value REAL,
    trigger_event_id TEXT REFERENCES engagement_events(id),
    learning_rate REAL
);

CREATE INDEX IF NOT EXISTS idx_personality_evo_timestamp ON personality_evolution(timestamp);

------------------------------------------------------------
-- SCHEMA VERSION: For migrations
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);
