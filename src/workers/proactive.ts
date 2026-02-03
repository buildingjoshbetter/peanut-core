// Proactive Trigger Service
// Strategy Reference: Part 5, Part 13
//
// Monitors for proactive opportunities and fires triggers:
// - Meeting prep (5 min before)
// - Deadline warnings (24h before)
// - Pattern-based suggestions
// - Follow-up reminders

import { v4 as uuid } from 'uuid';
import { execute, query } from '../db/connection';
import { getProactiveSuggestions } from '../synthesis/proactive';

// ============================================================
// TYPES
// ============================================================

export interface ProactiveConfig {
  /** Minutes before meeting to trigger prep (default: 5) */
  meetingPrepMinutesBefore: number;
  /** Days before deadline to trigger warning (default: 1) */
  deadlineWarningDays: number;
  /** Check interval in milliseconds (default: 60000 = 1 minute) */
  checkIntervalMs: number;
  /** Enable meeting prep triggers (default: true) */
  enableMeetingPrep: boolean;
  /** Enable deadline warnings (default: true) */
  enableDeadlineWarnings: boolean;
  /** Enable pattern-based triggers (default: true) */
  enablePatternTriggers: boolean;
}

export interface ProactiveTrigger {
  id: string;
  type: 'meeting_prep' | 'deadline_warning' | 'follow_up' | 'pattern_based';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  relatedEntityIds: string[];
  relatedCommitmentId?: string;
  triggeredAt: Date;
  expiresAt?: Date;
  context?: Record<string, unknown>;
}

export interface TriggerFeedback {
  triggerId: string;
  feedback: 'accepted' | 'dismissed' | 'ignored';
  timestamp: Date;
}

export interface ProactiveServiceStatus {
  running: boolean;
  lastCheckAt: Date | null;
  triggersGenerated: number;
  triggersAccepted: number;
  triggersDismissed: number;
}

// ============================================================
// SERVICE STATE
// ============================================================

const DEFAULT_CONFIG: ProactiveConfig = {
  meetingPrepMinutesBefore: 5,
  deadlineWarningDays: 1,
  checkIntervalMs: 60000,
  enableMeetingPrep: true,
  enableDeadlineWarnings: true,
  enablePatternTriggers: true,
};

let serviceConfig: ProactiveConfig = { ...DEFAULT_CONFIG };
let serviceInterval: ReturnType<typeof setInterval> | null = null;
let serviceStatus: ProactiveServiceStatus = {
  running: false,
  lastCheckAt: null,
  triggersGenerated: 0,
  triggersAccepted: 0,
  triggersDismissed: 0,
};

// ============================================================
// SERVICE CONTROL
// ============================================================

/**
 * Start the proactive trigger service
 */
export function startProactiveService(config?: Partial<ProactiveConfig>): void {
  if (serviceInterval) {
    console.log('[Proactive] Already running');
    return;
  }

  serviceConfig = { ...DEFAULT_CONFIG, ...config };
  serviceStatus.running = true;

  console.log(`[Proactive] Starting with ${serviceConfig.checkIntervalMs}ms interval`);

  // Ensure triggers table exists
  ensureTriggersTable();

  // Run immediately on start
  checkForTriggers();

  // Then run on interval
  serviceInterval = setInterval(() => {
    checkForTriggers();
  }, serviceConfig.checkIntervalMs);
}

/**
 * Stop the proactive trigger service
 */
export function stopProactiveService(): void {
  if (serviceInterval) {
    clearInterval(serviceInterval);
    serviceInterval = null;
  }
  serviceStatus.running = false;
  console.log('[Proactive] Stopped');
}

/**
 * Get current service status
 */
export function getProactiveServiceStatus(): ProactiveServiceStatus {
  return { ...serviceStatus };
}

/**
 * Get pending (unfired) triggers
 */
export function getPendingTriggers(): ProactiveTrigger[] {
  const rows = query<{
    id: string;
    type: string;
    title: string;
    description: string;
    priority: string;
    related_entity_ids: string;
    related_commitment_id: string | null;
    triggered_at: string;
    expires_at: string | null;
    context: string | null;
  }>(`
    SELECT * FROM proactive_triggers
    WHERE feedback IS NULL
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      triggered_at DESC
    LIMIT 20
  `, []);

  return rows.map(row => ({
    id: row.id,
    type: row.type as ProactiveTrigger['type'],
    title: row.title,
    description: row.description,
    priority: row.priority as ProactiveTrigger['priority'],
    relatedEntityIds: JSON.parse(row.related_entity_ids || '[]'),
    relatedCommitmentId: row.related_commitment_id || undefined,
    triggeredAt: new Date(row.triggered_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    context: row.context ? JSON.parse(row.context) : undefined,
  }));
}

/**
 * Record feedback for a trigger
 */
export function recordTriggerFeedback(
  triggerId: string,
  feedback: 'accepted' | 'dismissed' | 'ignored'
): void {
  execute(`
    UPDATE proactive_triggers
    SET feedback = ?,
        feedback_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [feedback, triggerId]);

  // Update stats
  if (feedback === 'accepted') {
    serviceStatus.triggersAccepted++;
  } else if (feedback === 'dismissed') {
    serviceStatus.triggersDismissed++;
  }
}

// ============================================================
// TRIGGER CHECKING
// ============================================================

function checkForTriggers(): void {
  serviceStatus.lastCheckAt = new Date();

  try {
    // 1. Check for meeting prep triggers
    if (serviceConfig.enableMeetingPrep) {
      checkMeetingPrepTriggers();
    }

    // 2. Check for deadline warnings
    if (serviceConfig.enableDeadlineWarnings) {
      checkDeadlineTriggers();
    }

    // 3. Check for pattern-based triggers
    if (serviceConfig.enablePatternTriggers) {
      checkPatternTriggers();
    }

    // 4. Check for follow-up triggers
    checkFollowUpTriggers();

  } catch (error) {
    console.error('[Proactive] Error checking triggers:', error);
  }
}

function checkMeetingPrepTriggers(): void {
  const suggestions = getProactiveSuggestions({
    lookaheadMinutes: serviceConfig.meetingPrepMinutesBefore,
  }).filter(s => s.type === 'meeting_prep');

  for (const suggestion of suggestions) {
    // Check if we already created a trigger for this
    if (suggestion.relatedCommitmentId && hasTriggerForCommitment(suggestion.relatedCommitmentId, 'meeting_prep')) {
      continue;
    }

    // Create trigger
    createTrigger({
      type: 'meeting_prep',
      title: suggestion.title,
      description: suggestion.description,
      priority: 'high',
      relatedEntityIds: suggestion.relatedEntityIds || [],
      relatedCommitmentId: suggestion.relatedCommitmentId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Expires in 30 minutes
      context: suggestion.context ? { raw: suggestion.context } : undefined,
    });
  }
}

function checkDeadlineTriggers(): void {
  const suggestions = getProactiveSuggestions({
    lookaheadMinutes: serviceConfig.deadlineWarningDays * 24 * 60,
  }).filter(s => s.type === 'deadline');

  for (const suggestion of suggestions) {
    // Check if we already created a trigger for this
    if (suggestion.relatedCommitmentId && hasTriggerForCommitment(suggestion.relatedCommitmentId, 'deadline_warning')) {
      continue;
    }

    // Create trigger
    createTrigger({
      type: 'deadline_warning',
      title: suggestion.title,
      description: suggestion.description,
      priority: suggestion.priority,
      relatedEntityIds: suggestion.relatedEntityIds || [],
      relatedCommitmentId: suggestion.relatedCommitmentId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expires in 24 hours
      context: suggestion.context ? { raw: suggestion.context } : undefined,
    });
  }
}

function checkPatternTriggers(): void {
  // Get pattern-based suggestions
  const suggestions = getProactiveSuggestions().filter(s => s.type === 'pattern');

  for (const suggestion of suggestions) {
    // Check if similar trigger exists recently
    const recent = query<{ id: string }>(`
      SELECT id FROM proactive_triggers
      WHERE type = 'pattern_based'
        AND title = ?
        AND triggered_at > datetime('now', '-1 hour')
      LIMIT 1
    `, [suggestion.title]);

    if (recent.length > 0) continue;

    createTrigger({
      type: 'pattern_based',
      title: suggestion.title,
      description: suggestion.description,
      priority: suggestion.priority,
      relatedEntityIds: suggestion.relatedEntityIds || [],
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // Expires in 2 hours
      context: suggestion.context ? { raw: suggestion.context } : undefined,
    });
  }
}

function checkFollowUpTriggers(): void {
  // Find threads that need follow-up
  const followUps = query<{
    thread_id: string;
    counterparty_name: string;
    last_message_at: string;
    entity_id: string;
  }>(`
    SELECT
      m.thread_id,
      e.canonical_name as counterparty_name,
      MAX(m.timestamp) as last_message_at,
      m.sender_entity_id as entity_id
    FROM messages m
    JOIN entities e ON m.sender_entity_id = e.id
    WHERE m.is_from_user = 0
      AND m.thread_id IS NOT NULL
      AND m.timestamp > datetime('now', '-7 days')
      AND m.timestamp < datetime('now', '-2 days')
      AND NOT EXISTS (
        SELECT 1 FROM messages m2
        WHERE m2.thread_id = m.thread_id
          AND m2.is_from_user = 1
          AND m2.timestamp > m.timestamp
      )
    GROUP BY m.thread_id
    LIMIT 5
  `, []);

  for (const followUp of followUps) {
    // Check if trigger already exists
    const existing = query<{ id: string }>(`
      SELECT id FROM proactive_triggers
      WHERE type = 'follow_up'
        AND context LIKE ?
        AND triggered_at > datetime('now', '-24 hours')
      LIMIT 1
    `, [`%"threadId":"${followUp.thread_id}"%`]);

    if (existing.length > 0) continue;

    createTrigger({
      type: 'follow_up',
      title: `Follow up with ${followUp.counterparty_name}`,
      description: `No response sent to ${followUp.counterparty_name}'s message from ${formatAgo(new Date(followUp.last_message_at))}`,
      priority: 'medium',
      relatedEntityIds: [followUp.entity_id],
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // Expires in 48 hours
      context: { threadId: followUp.thread_id },
    });
  }
}

// ============================================================
// HELPERS
// ============================================================

function createTrigger(trigger: Omit<ProactiveTrigger, 'id' | 'triggeredAt'>): string {
  const id = uuid();

  execute(`
    INSERT INTO proactive_triggers (
      id, type, title, description, priority,
      related_entity_ids, related_commitment_id,
      triggered_at, expires_at, context
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
  `, [
    id,
    trigger.type,
    trigger.title,
    trigger.description,
    trigger.priority,
    JSON.stringify(trigger.relatedEntityIds),
    trigger.relatedCommitmentId || null,
    trigger.expiresAt?.toISOString() || null,
    trigger.context ? JSON.stringify(trigger.context) : null,
  ]);

  serviceStatus.triggersGenerated++;

  return id;
}

function hasTriggerForCommitment(commitmentId: string, type: string): boolean {
  const result = query<{ id: string }>(`
    SELECT id FROM proactive_triggers
    WHERE related_commitment_id = ?
      AND type = ?
      AND triggered_at > datetime('now', '-24 hours')
    LIMIT 1
  `, [commitmentId, type]);

  return result.length > 0;
}

function formatAgo(date: Date): string {
  const hours = Math.floor((Date.now() - date.getTime()) / (60 * 60 * 1000));
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function ensureTriggersTable(): void {
  execute(`
    CREATE TABLE IF NOT EXISTS proactive_triggers (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium',
      related_entity_ids TEXT,
      related_commitment_id TEXT,
      triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      context TEXT,
      feedback TEXT,
      feedback_at DATETIME
    )
  `, []);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_triggers_type ON proactive_triggers(type)
  `, []);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_triggers_feedback ON proactive_triggers(feedback)
  `, []);
}

/**
 * Get trigger acceptance rate
 */
export function getTriggerAcceptanceRate(): { rate: number; total: number } {
  const result = query<{ total: number; accepted: number }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN feedback = 'accepted' THEN 1 ELSE 0 END) as accepted
    FROM proactive_triggers
    WHERE feedback IS NOT NULL
  `, []);

  const data = result[0];
  if (!data || data.total === 0) {
    return { rate: 0, total: 0 };
  }

  return {
    rate: data.accepted / data.total,
    total: data.total,
  };
}

/**
 * Clean up old triggers
 */
export function cleanupOldTriggers(olderThanDays: number = 30): number {
  const result = execute(`
    DELETE FROM proactive_triggers
    WHERE triggered_at < datetime('now', '-' || ? || ' days')
  `, [olderThanDays]);

  return result.changes;
}
