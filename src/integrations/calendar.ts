// Calendar Integration
// Strategy Reference: Integration Hooks
//
// Connects Skippy's calendar service to peanut-core's commitment tracking.
// Auto-creates commitments from calendar events.

import { v4 as uuid } from 'uuid';
import { execute, query } from '../db/connection';
import type { Commitment, CommitmentType, CommitmentStatus } from '../types';

// ============================================================
// TYPES (matching Skippy's CalendarEvent)
// ============================================================

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  attendees: string[];
  isAllDay: boolean;
  status: string;
  organizer?: string;
  calendarId: string;
  category?: string;
  htmlLink?: string;
  meetingLink?: string;
  responseStatus?: string;
}

export interface SyncResult {
  commitmentsCreated: number;
  commitmentsUpdated: number;
  entitiesLinked: number;
}

// ============================================================
// EVENT → COMMITMENT CONVERSION
// ============================================================

/**
 * Sync calendar events to commitments
 */
export function syncCalendarToCommitments(events: CalendarEvent[]): SyncResult {
  let created = 0;
  let updated = 0;
  let linked = 0;

  for (const event of events) {
    const commitment = createCommitmentFromEvent(event);
    if (!commitment) continue;

    // Check if commitment already exists for this event
    const existing = query<{ id: string; status: string }>(`
      SELECT id, status FROM commitments
      WHERE source_type = 'calendar' AND source_id = ?
    `, [event.id]);

    if (existing.length > 0) {
      // Update if event changed
      const existingCommitment = existing[0]!;
      if (existingCommitment.status === 'open') {
        execute(`
          UPDATE commitments
          SET
            description = ?,
            due_date = ?
          WHERE id = ?
        `, [
          commitment.description,
          commitment.dueDate?.toISOString() || null,
          existingCommitment.id,
        ]);
        updated++;
      }
    } else {
      // Create new commitment
      const id = uuid();
      execute(`
        INSERT INTO commitments (
          id, type, description, owner_entity_id, counterparty_entity_id,
          due_date, status, source_type, source_id, source_timestamp,
          created_at, reminder_sent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
      `, [
        id,
        commitment.type,
        commitment.description,
        commitment.ownerEntityId || null,
        commitment.counterpartyEntityId || null,
        commitment.dueDate?.toISOString() || null,
        commitment.status,
        'calendar',
        event.id,
        event.start.toISOString(),
      ]);
      created++;

      // Link attendees to entities
      const linkedCount = linkAttendeesToEntities(id, event.attendees);
      linked += linkedCount;
    }
  }

  return { commitmentsCreated: created, commitmentsUpdated: updated, entitiesLinked: linked };
}

/**
 * Create a commitment from a calendar event
 */
export function createCommitmentFromEvent(event: CalendarEvent): Partial<Commitment> | null {
  // Skip cancelled/declined events
  if (event.status === 'cancelled' || event.responseStatus === 'declined') {
    return null;
  }

  // Skip all-day events (usually reminders, not commitments)
  if (event.isAllDay) {
    return null;
  }

  // Determine commitment type
  let type: CommitmentType = 'deadline';

  // If I'm the organizer, it's my promise to meet
  // If someone else organized, it's an ask of my time
  const isOrganizer = !event.organizer || event.organizer.includes('me');  // Simplified check

  if (event.attendees.length > 1) {
    type = isOrganizer ? 'promise' : 'ask';
  }

  // Build description
  let description = event.title;
  if (event.location) {
    description += ` @ ${event.location}`;
  }
  if (event.meetingLink) {
    description += ` [video call]`;
  }

  return {
    type,
    description,
    dueDate: event.start,
    status: 'open',
    sourceType: 'calendar',
    sourceId: event.id,
    sourceTimestamp: event.start,
  };
}

/**
 * Link event attendees to entity IDs
 */
function linkAttendeesToEntities(commitmentId: string, attendees: string[]): number {
  let linked = 0;

  for (const attendee of attendees) {
    // Try to find entity by email
    const entityRows = query<{ entity_id: string }>(`
      SELECT entity_id FROM entity_attributes
      WHERE attribute_type = 'email' AND LOWER(attribute_value) = LOWER(?)
    `, [attendee]);

    if (entityRows.length > 0) {
      const entityId = entityRows[0]!.entity_id;

      // Update commitment with entity reference
      // (For now, just link to counterparty - could be smarter about owner vs counterparty)
      execute(`
        UPDATE commitments
        SET counterparty_entity_id = COALESCE(counterparty_entity_id, ?)
        WHERE id = ? AND counterparty_entity_id IS NULL
      `, [entityId, commitmentId]);

      linked++;
    }
  }

  return linked;
}

// ============================================================
// CALENDAR → CONTEXT
// ============================================================

/**
 * Get upcoming meetings for context surfacing
 */
export function getUpcomingMeetings(minutesAhead: number = 60): Array<{
  event: Partial<CalendarEvent>;
  attendeeEntities: Array<{ entityId: string; name: string; email?: string }>;
  relatedCommitmentId?: string;
}> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + minutesAhead * 60 * 1000);

  // Get commitments from calendar source with upcoming due dates
  const rows = query<{
    id: string;
    description: string;
    due_date: string;
    source_id: string;
    counterparty_entity_id: string | null;
  }>(`
    SELECT id, description, due_date, source_id, counterparty_entity_id
    FROM commitments
    WHERE source_type = 'calendar'
      AND status = 'open'
      AND due_date >= ?
      AND due_date <= ?
    ORDER BY due_date ASC
  `, [now.toISOString(), cutoff.toISOString()]);

  const results: Array<{
    event: Partial<CalendarEvent>;
    attendeeEntities: Array<{ entityId: string; name: string; email?: string }>;
    relatedCommitmentId: string;
  }> = [];

  for (const row of rows) {
    const attendeeEntities: Array<{ entityId: string; name: string; email?: string }> = [];

    // Get counterparty entity details
    if (row.counterparty_entity_id) {
      const entityRows = query<{
        id: string;
        canonical_name: string;
      }>(`
        SELECT id, canonical_name FROM entities WHERE id = ?
      `, [row.counterparty_entity_id]);

      if (entityRows.length > 0) {
        const entity = entityRows[0]!;

        // Get email attribute
        const emailRows = query<{ attribute_value: string }>(`
          SELECT attribute_value FROM entity_attributes
          WHERE entity_id = ? AND attribute_type = 'email'
          LIMIT 1
        `, [entity.id]);

        attendeeEntities.push({
          entityId: entity.id,
          name: entity.canonical_name,
          email: emailRows[0]?.attribute_value,
        });
      }
    }

    results.push({
      event: {
        id: row.source_id,
        title: row.description,
        start: new Date(row.due_date),
      },
      attendeeEntities,
      relatedCommitmentId: row.id,
    });
  }

  return results;
}

/**
 * Get calendar context for LLM
 */
export function getCalendarContextForLlm(hours: number = 4): string {
  const now = new Date();
  const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);

  const upcoming = query<{
    description: string;
    due_date: string;
  }>(`
    SELECT description, due_date
    FROM commitments
    WHERE source_type = 'calendar'
      AND status = 'open'
      AND due_date >= ?
      AND due_date <= ?
    ORDER BY due_date ASC
    LIMIT 5
  `, [now.toISOString(), cutoff.toISOString()]);

  if (upcoming.length === 0) return '';

  const lines = ['Upcoming calendar events:'];
  for (const event of upcoming) {
    const eventTime = new Date(event.due_date);
    const minutesUntil = Math.floor((eventTime.getTime() - now.getTime()) / 60000);

    let timeStr: string;
    if (minutesUntil < 60) {
      timeStr = `in ${minutesUntil} minutes`;
    } else {
      const hoursUntil = Math.floor(minutesUntil / 60);
      timeStr = `in ${hoursUntil} hour${hoursUntil > 1 ? 's' : ''}`;
    }

    lines.push(`- ${timeStr}: ${event.description}`);
  }

  return lines.join('\n');
}

// ============================================================
// MAINTENANCE
// ============================================================

/**
 * Mark past calendar commitments as completed
 */
export function completePastCalendarEvents(): number {
  const result = execute(`
    UPDATE commitments
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP
    WHERE source_type = 'calendar'
      AND status = 'open'
      AND due_date < datetime('now', '-1 hour')
  `, []);

  return result.changes;
}

/**
 * Delete old calendar commitments
 */
export function cleanupOldCalendarCommitments(daysOld: number = 90): number {
  const result = execute(`
    DELETE FROM commitments
    WHERE source_type = 'calendar'
      AND (status = 'completed' OR status = 'cancelled')
      AND completed_at < datetime('now', ?)
  `, [`-${daysOld} days`]);

  return result.changes;
}

/**
 * Get stats for calendar sync
 */
export function getCalendarSyncStats(): {
  totalEvents: number;
  openEvents: number;
  completedEvents: number;
  upcomingToday: number;
} {
  const stats = query<{
    total: number;
    open: number;
    completed: number;
    today: number;
  }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'open' AND date(due_date) = date('now') THEN 1 ELSE 0 END) as today
    FROM commitments
    WHERE source_type = 'calendar'
  `, []);

  const row = stats[0] || { total: 0, open: 0, completed: 0, today: 0 };

  return {
    totalEvents: row.total,
    openEvents: row.open,
    completedEvents: row.completed,
    upcomingToday: row.today,
  };
}
