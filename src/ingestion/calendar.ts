// Calendar Event Ingestion
// Strategy Reference: Part 3 - Data Sources
//
// Ingests calendar events into the knowledge graph:
// - Creates commitments from meetings
// - Links attendee entities
// - Creates calendar events

import { v4 as uuid } from 'uuid';
import { getDb } from '../db/connection';
import { findOrCreateEntity } from './pipeline';

// ============================================================
// TYPES
// ============================================================

export interface CalendarEventInput {
  /** External source ID (e.g., Google Calendar event ID) */
  sourceId: string;
  /** Event title */
  title: string;
  /** Event description */
  description?: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime: Date;
  /** List of attendees */
  attendees: Array<{
    email: string;
    name?: string;
    responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  }>;
  /** Event location */
  location?: string;
  /** Whether this is a recurring event */
  isRecurring: boolean;
  /** Recurrence rule (RRULE format) */
  recurrenceRule?: string;
  /** Meeting URL if virtual */
  meetingUrl?: string;
  /** Organizer email */
  organizerEmail?: string;
}

export interface CalendarIngestResult {
  /** Whether the event was stored (false if duplicate) */
  stored: boolean;
  /** The commitment ID created for this event */
  commitmentId: string | null;
  /** The event ID in the events table */
  eventId: string;
  /** Entity IDs for attendees */
  attendeeEntityIds: string[];
  /** Number of new entities created */
  entitiesCreated: number;
}

export interface BatchCalendarIngestResult {
  /** Total events received */
  totalReceived: number;
  /** Successfully processed count */
  successCount: number;
  /** Skipped (duplicate) count */
  skipCount: number;
  /** Error count */
  errorCount: number;
  /** Commitments created */
  commitmentsCreated: number;
  /** Entities created */
  entitiesCreated: number;
  /** Errors encountered */
  errors: Array<{ sourceId: string; error: string }>;
}

// ============================================================
// INGESTION
// ============================================================

/**
 * Ingest a single calendar event
 */
export function ingestCalendarEvent(event: CalendarEventInput): CalendarIngestResult {
  const db = getDb();

  // Check for duplicate by source ID
  const existing = db.prepare(`
    SELECT id FROM events WHERE payload LIKE ?
  `).get(`%"sourceId":"${event.sourceId}"%`) as { id: string } | undefined;

  if (existing) {
    return {
      stored: false,
      commitmentId: null,
      eventId: existing.id,
      attendeeEntityIds: [],
      entitiesCreated: 0,
    };
  }

  let entitiesCreated = 0;
  const countBefore = (db.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number }).count;

  // Resolve attendee entities
  const attendeeEntityIds: string[] = [];
  for (const attendee of event.attendees) {
    const entityId = findOrCreateEntity({
      email: attendee.email,
      name: attendee.name,
    });
    attendeeEntityIds.push(entityId);
  }

  const countAfter = (db.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number }).count;
  entitiesCreated = countAfter - countBefore;

  // Create event in events table
  const eventId = uuid();
  db.prepare(`
    INSERT INTO events (
      id, event_type, timestamp, payload, context_type, entities, processed
    ) VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    eventId,
    'CALENDAR_EVENT',
    event.startTime.toISOString(),
    JSON.stringify({
      sourceId: event.sourceId,
      title: event.title,
      description: event.description,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      location: event.location,
      isRecurring: event.isRecurring,
      meetingUrl: event.meetingUrl,
      organizerEmail: event.organizerEmail,
    }),
    'work',  // Calendar events are typically work context
    JSON.stringify(attendeeEntityIds),
  );

  // Create commitment for the meeting
  let commitmentId: string | null = null;
  if (event.attendees.length > 0) {
    commitmentId = uuid();

    // Find organizer entity
    let ownerEntityId: string | null = null;
    if (event.organizerEmail) {
      ownerEntityId = findOrCreateEntity({ email: event.organizerEmail });
    }

    db.prepare(`
      INSERT INTO commitments (
        id, type, description, owner_entity_id,
        due_date, status, source_type, source_id,
        source_timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      commitmentId,
      'meeting',
      event.title,
      ownerEntityId,
      event.startTime.toISOString(),
      'open',
      'calendar',
      event.sourceId,
      event.startTime.toISOString(),
    );

    // Link attendees to commitment
    for (const entityId of attendeeEntityIds) {
      db.prepare(`
        INSERT OR IGNORE INTO commitment_participants (
          id, commitment_id, entity_id, created_at
        ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(uuid(), commitmentId, entityId);
    }
  }

  return {
    stored: true,
    commitmentId,
    eventId,
    attendeeEntityIds,
    entitiesCreated,
  };
}

/**
 * Ingest multiple calendar events
 */
export function ingestCalendarBatch(events: CalendarEventInput[]): BatchCalendarIngestResult {
  const result: BatchCalendarIngestResult = {
    totalReceived: events.length,
    successCount: 0,
    skipCount: 0,
    errorCount: 0,
    commitmentsCreated: 0,
    entitiesCreated: 0,
    errors: [],
  };

  for (const event of events) {
    try {
      const ingestResult = ingestCalendarEvent(event);

      if (ingestResult.stored) {
        result.successCount++;
        result.entitiesCreated += ingestResult.entitiesCreated;
        if (ingestResult.commitmentId) {
          result.commitmentsCreated++;
        }
      } else {
        result.skipCount++;
      }
    } catch (error) {
      const err = error as Error;
      result.errorCount++;
      result.errors.push({
        sourceId: event.sourceId,
        error: err.message,
      });
    }
  }

  return result;
}

/**
 * Get upcoming calendar events as commitments
 */
export function getUpcomingCalendarCommitments(hoursAhead: number = 24): Array<{
  id: string;
  title: string;
  startTime: Date;
  attendeeCount: number;
  meetingUrl?: string;
}> {
  const db = getDb();

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() + hoursAhead);

  const rows = db.prepare(`
    SELECT c.id, c.description as title, c.due_date as start_time,
           (SELECT COUNT(*) FROM commitment_participants WHERE commitment_id = c.id) as attendee_count
    FROM commitments c
    WHERE c.type = 'meeting'
      AND c.status = 'open'
      AND c.due_date >= datetime('now')
      AND c.due_date <= ?
    ORDER BY c.due_date ASC
  `).all(cutoff.toISOString()) as Array<{
    id: string;
    title: string;
    start_time: string;
    attendee_count: number;
  }>;

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    startTime: new Date(row.start_time),
    attendeeCount: row.attendee_count,
  }));
}

/**
 * Mark past calendar commitments as completed
 */
export function markPastMeetingsCompleted(): number {
  const db = getDb();

  const result = db.prepare(`
    UPDATE commitments
    SET status = 'completed',
        completed_at = due_date
    WHERE type = 'meeting'
      AND status = 'open'
      AND due_date < datetime('now')
  `).run();

  return result.changes;
}

/**
 * Get calendar context for a specific entity (their meetings)
 */
export function getEntityCalendarContext(entityId: string, daysAhead: number = 7): Array<{
  commitmentId: string;
  title: string;
  startTime: Date;
  otherAttendees: string[];
}> {
  const db = getDb();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const rows = db.prepare(`
    SELECT c.id, c.description as title, c.due_date as start_time
    FROM commitments c
    JOIN commitment_participants cp ON c.id = cp.commitment_id
    WHERE cp.entity_id = ?
      AND c.type = 'meeting'
      AND c.status = 'open'
      AND c.due_date >= datetime('now')
      AND c.due_date <= ?
    ORDER BY c.due_date ASC
  `).all(entityId, cutoff.toISOString()) as Array<{
    id: string;
    title: string;
    start_time: string;
  }>;

  return rows.map(row => {
    // Get other attendees
    const otherAttendees = db.prepare(`
      SELECT e.canonical_name
      FROM commitment_participants cp
      JOIN entities e ON cp.entity_id = e.id
      WHERE cp.commitment_id = ?
        AND cp.entity_id != ?
    `).all(row.id, entityId) as Array<{ canonical_name: string }>;

    return {
      commitmentId: row.id,
      title: row.title,
      startTime: new Date(row.start_time),
      otherAttendees: otherAttendees.map(a => a.canonical_name),
    };
  });
}
