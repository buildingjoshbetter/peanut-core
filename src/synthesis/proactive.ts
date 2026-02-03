// Proactive Surfacing Module
// Strategy Reference: Part 3, Part 5
//
// Surfaces information before the user asks:
// - Pre-meeting context
// - Upcoming deadlines
// - Pattern-based predictions

import { query } from '../db/connection';
import type { Commitment, Prediction } from '../types';
import { assembleContext, formatContextForLlm } from './context';

// ============================================================
// TYPES
// ============================================================

export interface ProactiveSuggestion {
  type: 'meeting_prep' | 'deadline' | 'followup' | 'pattern' | 'context';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  context?: string;  // Pre-assembled context
  actionItems?: string[];
  triggerTime: Date;
  expiresAt?: Date;
  relatedEntityIds?: string[];
  relatedCommitmentId?: string;
  relatedPredictionId?: string;
}

export interface SurfacingTrigger {
  type: 'time' | 'context_switch' | 'entity_mention' | 'manual';
  value: string;
}

// ============================================================
// PROACTIVE SURFACING
// ============================================================

/**
 * Get all proactive suggestions for current moment
 */
export function getProactiveSuggestions(options?: {
  userId?: string;
  currentContext?: string;
  lookaheadMinutes?: number;
  limit?: number;
}): ProactiveSuggestion[] {
  const lookahead = options?.lookaheadMinutes || 60;
  const limit = options?.limit || 10;
  const now = new Date();

  const suggestions: ProactiveSuggestion[] = [];

  // 1. Meeting prep suggestions
  suggestions.push(...getMeetingPrepSuggestions(now, lookahead));

  // 2. Deadline reminders
  suggestions.push(...getDeadlineSuggestions(now));

  // 3. Follow-up reminders
  suggestions.push(...getFollowupSuggestions(now));

  // 4. Pattern-based suggestions
  suggestions.push(...getPatternSuggestions(now));

  // Sort by priority and time
  return suggestions
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.triggerTime.getTime() - b.triggerTime.getTime();
    })
    .slice(0, limit);
}

/**
 * Get meeting prep suggestions
 */
function getMeetingPrepSuggestions(now: Date, lookaheadMinutes: number): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  const cutoff = new Date(now.getTime() + lookaheadMinutes * 60 * 1000);

  // Get upcoming calendar events (would need calendar integration)
  // For now, check commitments with 'meeting' type
  const meetings = query<{
    id: string;
    description: string;
    due_date: string;
    counterparty_entity_id: string | null;
  }>(`
    SELECT id, description, due_date, counterparty_entity_id
    FROM commitments
    WHERE status = 'open'
      AND type = 'deadline'
      AND due_date IS NOT NULL
      AND due_date > ?
      AND due_date <= ?
      AND description LIKE '%meeting%'
    ORDER BY due_date ASC
  `, [now.toISOString(), cutoff.toISOString()]);

  for (const meeting of meetings) {
    const meetingTime = new Date(meeting.due_date);
    const minutesUntil = Math.floor((meetingTime.getTime() - now.getTime()) / 60000);

    // Get context for attendees
    let context: string | undefined;
    const entityIds: string[] = [];
    if (meeting.counterparty_entity_id) {
      entityIds.push(meeting.counterparty_entity_id);
      const bundle = assembleContext({ entityIds });
      context = formatContextForLlm(bundle);
    }

    suggestions.push({
      type: 'meeting_prep',
      priority: minutesUntil <= 15 ? 'high' : 'medium',
      title: `Prepare for: ${meeting.description}`,
      description: `Meeting starts in ${minutesUntil} minutes`,
      context,
      actionItems: [
        'Review previous conversations',
        'Check open commitments',
        'Prepare talking points',
      ],
      triggerTime: new Date(meetingTime.getTime() - 15 * 60 * 1000),  // 15 min before
      expiresAt: meetingTime,
      relatedEntityIds: entityIds,
      relatedCommitmentId: meeting.id,
    });
  }

  return suggestions;
}

/**
 * Get deadline suggestions
 */
function getDeadlineSuggestions(now: Date): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];

  // Get overdue commitments
  const overdue = query<{
    id: string;
    type: string;
    description: string;
    due_date: string;
    owner_entity_id: string | null;
    counterparty_entity_id: string | null;
  }>(`
    SELECT id, type, description, due_date, owner_entity_id, counterparty_entity_id
    FROM commitments
    WHERE status = 'open'
      AND due_date IS NOT NULL
      AND due_date < ?
    ORDER BY due_date ASC
    LIMIT 5
  `, [now.toISOString()]);

  for (const commitment of overdue) {
    const dueDate = new Date(commitment.due_date);
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    suggestions.push({
      type: 'deadline',
      priority: 'high',
      title: `OVERDUE: ${commitment.description}`,
      description: `Was due ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} ago`,
      triggerTime: now,
      relatedCommitmentId: commitment.id,
      relatedEntityIds: [
        commitment.owner_entity_id,
        commitment.counterparty_entity_id,
      ].filter(Boolean) as string[],
    });
  }

  // Get upcoming deadlines (next 3 days)
  const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const upcoming = query<{
    id: string;
    type: string;
    description: string;
    due_date: string;
    owner_entity_id: string | null;
  }>(`
    SELECT id, type, description, due_date, owner_entity_id
    FROM commitments
    WHERE status = 'open'
      AND due_date IS NOT NULL
      AND due_date >= ?
      AND due_date <= ?
    ORDER BY due_date ASC
    LIMIT 10
  `, [now.toISOString(), threeDays.toISOString()]);

  for (const commitment of upcoming) {
    const dueDate = new Date(commitment.due_date);
    const hoursUntil = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));
    const daysUntil = Math.floor(hoursUntil / 24);

    const timeStr = daysUntil > 0
      ? `in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`
      : `in ${hoursUntil} hour${hoursUntil > 1 ? 's' : ''}`;

    suggestions.push({
      type: 'deadline',
      priority: hoursUntil <= 24 ? 'high' : 'medium',
      title: `Due ${timeStr}: ${commitment.description}`,
      description: `${commitment.type} due ${dueDate.toLocaleDateString()}`,
      triggerTime: now,
      relatedCommitmentId: commitment.id,
    });
  }

  return suggestions;
}

/**
 * Get follow-up suggestions
 */
function getFollowupSuggestions(now: Date): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];

  // Find threads where user owes a response
  const unanswered = query<{
    thread_id: string;
    sender_entity_id: string | null;
    timestamp: string;
    subject: string | null;
  }>(`
    SELECT m.thread_id, m.sender_entity_id, m.timestamp, m.subject
    FROM messages m
    WHERE m.is_from_user = 0
      AND m.timestamp > datetime('now', '-7 days')
      AND NOT EXISTS (
        SELECT 1 FROM messages m2
        WHERE m2.thread_id = m.thread_id
          AND m2.is_from_user = 1
          AND m2.timestamp > m.timestamp
      )
    ORDER BY m.timestamp DESC
    LIMIT 5
  `, []);

  for (const thread of unanswered) {
    const receivedAt = new Date(thread.timestamp);
    const hoursAgo = Math.floor((now.getTime() - receivedAt.getTime()) / (1000 * 60 * 60));

    if (hoursAgo < 2) continue;  // Too recent

    // Get sender name
    let senderName = 'someone';
    if (thread.sender_entity_id) {
      const entityRows = query<{ canonical_name: string }>(`
        SELECT canonical_name FROM entities WHERE id = ?
      `, [thread.sender_entity_id]);
      if (entityRows.length > 0) {
        senderName = entityRows[0]!.canonical_name;
      }
    }

    suggestions.push({
      type: 'followup',
      priority: hoursAgo > 48 ? 'high' : 'medium',
      title: `Reply to ${senderName}`,
      description: `Received ${hoursAgo} hours ago${thread.subject ? `: "${thread.subject}"` : ''}`,
      triggerTime: now,
      relatedEntityIds: thread.sender_entity_id ? [thread.sender_entity_id] : [],
    });
  }

  return suggestions;
}

/**
 * Get pattern-based suggestions
 */
function getPatternSuggestions(now: Date): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  const hour = now.getHours();
  const day = now.getDay();

  // Get high-confidence patterns for current time
  const patterns = query<{
    id: string;
    pattern_type: string;
    description: string;
    time_signature: string | null;
    confidence: number;
  }>(`
    SELECT id, pattern_type, description, time_signature, confidence
    FROM behavioral_patterns
    WHERE confidence > 0.7
    ORDER BY confidence DESC
    LIMIT 10
  `, []);

  for (const pattern of patterns) {
    if (!pattern.time_signature) continue;

    const sig = JSON.parse(pattern.time_signature) as Record<string, number>;

    // Check if pattern applies now
    let applies = false;

    if (sig.hourOfDay !== undefined) {
      applies = Math.abs(sig.hourOfDay - hour) <= 1;
    }

    if (sig.dayOfWeek !== undefined) {
      applies = applies || sig.dayOfWeek === day;
    }

    if (applies) {
      suggestions.push({
        type: 'pattern',
        priority: 'low',
        title: pattern.description || 'Suggested action',
        description: `Based on your usual pattern (${Math.round(pattern.confidence * 100)}% confidence)`,
        triggerTime: now,
        relatedPredictionId: pattern.id,
      });
    }
  }

  return suggestions;
}

// ============================================================
// CONTEXT SURFACING
// ============================================================

/**
 * Surface context for an entity (when mentioned or relevant)
 */
export function surfaceEntityContext(entityId: string): ProactiveSuggestion | null {
  const bundle = assembleContext({ entityIds: [entityId] });

  if (!bundle.primaryEntity) return null;

  const entity = bundle.primaryEntity.entity;
  const context = formatContextForLlm(bundle);

  const actionItems: string[] = [];

  // Add relevant action items
  if (bundle.commitments.length > 0) {
    actionItems.push(`${bundle.commitments.length} open commitment(s)`);
  }

  if (bundle.relevantFacts.length > 0) {
    actionItems.push(`${bundle.relevantFacts.length} known fact(s)`);
  }

  return {
    type: 'context',
    priority: 'low',
    title: `Context for ${entity.canonicalName}`,
    description: `${bundle.primaryEntity.relationshipToUser || 'Contact'} with ${bundle.primaryEntity.interactionCount} interactions`,
    context,
    actionItems,
    triggerTime: new Date(),
    relatedEntityIds: [entityId],
  };
}

/**
 * Get suggestions triggered by context switch
 */
export function getContextSwitchSuggestions(
  fromContext: string,
  toContext: string
): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  const now = new Date();

  // Switching to work context
  if (toContext === 'work' && fromContext !== 'work') {
    suggestions.push({
      type: 'context',
      priority: 'medium',
      title: 'Starting work mode',
      description: 'Review your work priorities',
      actionItems: [
        'Check upcoming meetings',
        'Review open deadlines',
        'Check unread work emails',
      ],
      triggerTime: now,
    });
  }

  // Switching from work context
  if (fromContext === 'work' && toContext !== 'work') {
    // Check for unfinished items
    const openItems = query<{ count: number }>(`
      SELECT COUNT(*) as count FROM commitments
      WHERE status = 'open'
        AND due_date IS NOT NULL
        AND due_date < datetime('now', '+1 day')
    `, []);

    if (openItems[0] && openItems[0].count > 0) {
      suggestions.push({
        type: 'context',
        priority: 'low',
        title: 'End of work check',
        description: `${openItems[0].count} item(s) due tomorrow`,
        triggerTime: now,
      });
    }
  }

  return suggestions;
}

/**
 * Dismiss a suggestion (mark as seen/handled)
 */
export function dismissSuggestion(
  suggestionType: ProactiveSuggestion['type'],
  relatedId?: string
): void {
  // For now, just log - could track dismissed suggestions
  console.log(`Dismissed suggestion: ${suggestionType}${relatedId ? ` (${relatedId})` : ''}`);
}
