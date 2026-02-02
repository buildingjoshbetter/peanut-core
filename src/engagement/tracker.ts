// Engagement signal tracking and scoring

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection';

export interface EngagementSignal {
  draftId: string;
  recipientEntityId?: string;
  contextType?: 'work' | 'personal';

  // Draft metrics
  aiDraftLength: number;
  userFinalLength?: number;
  editRatio?: number;

  // Response metrics
  userResponseSentiment?: number;  // -1 to 1
  threadLength?: number;
  threadContinued?: boolean;

  // Timing
  responseTimeMs?: number;
}

export interface EngagementScore {
  overall: number;  // 0 to 1
  components: {
    editScore: number;
    sentimentScore: number;
    lengthScore: number;
    continuationScore: number;
  };
  confidence: number;  // How reliable is this score
}

// Signal weights from 9-model consensus
const SIGNAL_WEIGHTS = {
  editRatio: 0.35,        // Tier 1: Most reliable
  sentiment: 0.30,        // Tier 1
  lengthRatio: 0.20,      // Tier 1
  continuation: 0.10,     // Tier 2
  depth: 0.05,            // Tier 2
};

/**
 * Calculate engagement score from signals
 */
export function calculateEngagementScore(signal: EngagementSignal): EngagementScore {
  const components = {
    editScore: 0,
    sentimentScore: 0.5,
    lengthScore: 0.5,
    continuationScore: 0,
  };

  let confidence = 0;

  // Edit ratio: Less editing = better match
  if (signal.editRatio !== undefined) {
    components.editScore = 1 - Math.min(signal.editRatio, 1);
    confidence += SIGNAL_WEIGHTS.editRatio;
  }

  // Sentiment: Positive response = good
  if (signal.userResponseSentiment !== undefined) {
    // Normalize from -1..1 to 0..1
    components.sentimentScore = (signal.userResponseSentiment + 1) / 2;
    confidence += SIGNAL_WEIGHTS.sentiment;
  }

  // Length ratio: User expanding on AI draft = engagement
  if (signal.userFinalLength !== undefined && signal.aiDraftLength > 0) {
    const ratio = signal.userFinalLength / signal.aiDraftLength;
    // Normalize: 0.5x to 2x is good range
    components.lengthScore = Math.min(ratio, 2) / 2;
    confidence += SIGNAL_WEIGHTS.lengthRatio;
  }

  // Thread continuation: Kept talking = engaged
  if (signal.threadContinued !== undefined) {
    components.continuationScore = signal.threadContinued ? 1 : 0;
    confidence += SIGNAL_WEIGHTS.continuation;
  }

  // Calculate weighted overall score
  const overall = (
    components.editScore * SIGNAL_WEIGHTS.editRatio +
    components.sentimentScore * SIGNAL_WEIGHTS.sentiment +
    components.lengthScore * SIGNAL_WEIGHTS.lengthRatio +
    components.continuationScore * SIGNAL_WEIGHTS.continuation
  ) / confidence;  // Normalize by available signals

  return {
    overall: Math.max(0, Math.min(1, overall)),
    components,
    confidence,
  };
}

/**
 * Record a draft being sent
 */
export function recordDraftSent(
  draftId: string,
  aiDraftLength: number,
  recipientEntityId?: string,
  contextType?: 'work' | 'personal'
): string {
  const db = getDb();
  const eventId = uuidv4();

  db.prepare(`
    INSERT INTO engagement_events (
      id, interaction_type, timestamp, ai_draft_length,
      recipient_entity_id, context_type
    ) VALUES (?, 'draft_sent', datetime('now'), ?, ?, ?)
  `).run(eventId, aiDraftLength, recipientEntityId ?? null, contextType ?? null);

  return eventId;
}

/**
 * Record user editing a draft
 */
export function recordDraftEdited(
  draftId: string,
  userFinalLength: number,
  aiDraftLength: number
): string {
  const db = getDb();
  const eventId = uuidv4();

  const editRatio = aiDraftLength > 0
    ? Math.abs(userFinalLength - aiDraftLength) / aiDraftLength
    : 0;

  db.prepare(`
    INSERT INTO engagement_events (
      id, interaction_type, timestamp,
      ai_draft_length, user_final_length, edit_ratio
    ) VALUES (?, 'draft_edited', datetime('now'), ?, ?, ?)
  `).run(eventId, aiDraftLength, userFinalLength, editRatio);

  return eventId;
}

/**
 * Record user response sentiment
 */
export function recordUserResponse(
  sentiment: number,
  threadLength: number,
  recipientEntityId?: string
): string {
  const db = getDb();
  const eventId = uuidv4();

  db.prepare(`
    INSERT INTO engagement_events (
      id, interaction_type, timestamp,
      user_response_sentiment, thread_length, recipient_entity_id
    ) VALUES (?, 'response_received', datetime('now'), ?, ?, ?)
  `).run(eventId, sentiment, threadLength, recipientEntityId ?? null);

  return eventId;
}

/**
 * Record thread continuation
 */
export function recordThreadContinued(
  threadLength: number,
  recipientEntityId?: string
): string {
  const db = getDb();
  const eventId = uuidv4();

  db.prepare(`
    INSERT INTO engagement_events (
      id, interaction_type, timestamp,
      thread_length, recipient_entity_id
    ) VALUES (?, 'thread_continued', datetime('now'), ?, ?)
  `).run(eventId, threadLength, recipientEntityId ?? null);

  return eventId;
}

/**
 * Get recent engagement events for analysis
 */
export function getRecentEngagementEvents(
  limit: number = 100,
  recipientEntityId?: string
): Array<{
  id: string;
  interactionType: string;
  timestamp: Date;
  editRatio?: number;
  sentiment?: number;
  threadLength?: number;
  recipientEntityId?: string;
}> {
  const db = getDb();

  let sql = `
    SELECT * FROM engagement_events
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (recipientEntityId) {
    sql += ' AND recipient_entity_id = ?';
    params.push(recipientEntityId);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: string;
    interaction_type: string;
    timestamp: string;
    edit_ratio: number | null;
    user_response_sentiment: number | null;
    thread_length: number | null;
    recipient_entity_id: string | null;
  }>;

  return rows.map(row => ({
    id: row.id,
    interactionType: row.interaction_type,
    timestamp: new Date(row.timestamp),
    editRatio: row.edit_ratio ?? undefined,
    sentiment: row.user_response_sentiment ?? undefined,
    threadLength: row.thread_length ?? undefined,
    recipientEntityId: row.recipient_entity_id ?? undefined,
  }));
}

/**
 * Calculate average engagement score over recent interactions
 */
export function getAverageEngagement(
  windowDays: number = 30,
  recipientEntityId?: string
): { average: number; count: number } {
  const db = getDb();

  let sql = `
    SELECT
      AVG(
        CASE WHEN edit_ratio IS NOT NULL
          THEN 1 - MIN(edit_ratio, 1)
          ELSE NULL
        END
      ) as avg_edit_score,
      AVG(
        CASE WHEN user_response_sentiment IS NOT NULL
          THEN (user_response_sentiment + 1) / 2
          ELSE NULL
        END
      ) as avg_sentiment_score,
      COUNT(*) as count
    FROM engagement_events
    WHERE timestamp > datetime('now', ?)
  `;
  const params: unknown[] = [`-${windowDays} days`];

  if (recipientEntityId) {
    sql += ' AND recipient_entity_id = ?';
    params.push(recipientEntityId);
  }

  const row = db.prepare(sql).get(...params) as {
    avg_edit_score: number | null;
    avg_sentiment_score: number | null;
    count: number;
  };

  const editScore = row.avg_edit_score ?? 0.5;
  const sentimentScore = row.avg_sentiment_score ?? 0.5;

  // Weighted average of available scores
  const average = editScore * 0.6 + sentimentScore * 0.4;

  return { average, count: row.count };
}
