// Commitment Tracker
// Strategy Reference: Part 11, lines 831-855
//
// Tracks promises, asks, decisions, and deadlines from messages.

import { v4 as uuid } from 'uuid';
import { getDb, query, execute, queryOne } from '../db/connection';
import type { Commitment, CommitmentType, CommitmentStatus } from '../types';

/**
 * Create a new commitment
 */
export function createCommitment(
  commitment: Omit<Commitment, 'id' | 'createdAt' | 'reminderSent'>
): Commitment {
  const id = uuid();
  const createdAt = new Date();

  execute(`
    INSERT INTO commitments
    (id, type, description, owner_entity_id, counterparty_entity_id,
     due_date, status, source_type, source_id, source_timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    commitment.type,
    commitment.description,
    commitment.ownerEntityId || null,
    commitment.counterpartyEntityId || null,
    commitment.dueDate?.toISOString() || null,
    commitment.status,
    commitment.sourceType || null,
    commitment.sourceId || null,
    commitment.sourceTimestamp?.toISOString() || null,
    createdAt.toISOString(),
  ]);

  return {
    id,
    ...commitment,
    createdAt,
    reminderSent: false,
  };
}

/**
 * Get all open commitments
 */
export function getOpenCommitments(): Commitment[] {
  return query<CommitmentRow>(`
    SELECT * FROM commitments
    WHERE status = 'open'
    ORDER BY due_date ASC NULLS LAST, created_at DESC
  `).map(rowToCommitment);
}

/**
 * Get commitments due within N days
 */
export function getUpcomingDeadlines(days: number = 7): Commitment[] {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return query<CommitmentRow>(`
    SELECT * FROM commitments
    WHERE status = 'open'
      AND due_date IS NOT NULL
      AND due_date <= ?
    ORDER BY due_date ASC
  `, [futureDate.toISOString()]).map(rowToCommitment);
}

/**
 * Get overdue commitments
 */
export function getOverdueCommitments(): Commitment[] {
  return query<CommitmentRow>(`
    SELECT * FROM commitments
    WHERE status = 'open'
      AND due_date IS NOT NULL
      AND due_date < CURRENT_TIMESTAMP
    ORDER BY due_date ASC
  `).map(rowToCommitment);
}

/**
 * Get commitments by entity (as owner or counterparty)
 */
export function getCommitmentsForEntity(entityId: string): Commitment[] {
  return query<CommitmentRow>(`
    SELECT * FROM commitments
    WHERE (owner_entity_id = ? OR counterparty_entity_id = ?)
      AND status = 'open'
    ORDER BY due_date ASC NULLS LAST
  `, [entityId, entityId]).map(rowToCommitment);
}

/**
 * Get commitments I made TO someone
 */
export function getCommitmentsMadeTo(counterpartyId: string): Commitment[] {
  return query<CommitmentRow>(`
    SELECT * FROM commitments
    WHERE counterparty_entity_id = ?
      AND owner_entity_id IS NULL
      AND status = 'open'
    ORDER BY due_date ASC NULLS LAST
  `, [counterpartyId]).map(rowToCommitment);
}

/**
 * Get commitments someone made TO me
 */
export function getCommitmentsMadeBy(ownerId: string): Commitment[] {
  return query<CommitmentRow>(`
    SELECT * FROM commitments
    WHERE owner_entity_id = ?
      AND status = 'open'
    ORDER BY due_date ASC NULLS LAST
  `, [ownerId]).map(rowToCommitment);
}

/**
 * Update commitment status
 */
export function updateCommitmentStatus(
  id: string,
  status: CommitmentStatus
): void {
  const completedAt = status === 'completed' ? new Date().toISOString() : null;

  execute(`
    UPDATE commitments
    SET status = ?, completed_at = ?
    WHERE id = ?
  `, [status, completedAt, id]);
}

/**
 * Mark a commitment as completed
 */
export function completeCommitment(id: string): void {
  updateCommitmentStatus(id, 'completed');
}

/**
 * Mark a commitment as broken
 */
export function breakCommitment(id: string): void {
  updateCommitmentStatus(id, 'broken');
}

/**
 * Cancel a commitment
 */
export function cancelCommitment(id: string): void {
  updateCommitmentStatus(id, 'cancelled');
}

/**
 * Mark reminder as sent for a commitment
 */
export function markReminderSent(id: string): void {
  execute(`
    UPDATE commitments
    SET reminder_sent = 1
    WHERE id = ?
  `, [id]);
}

/**
 * Get commitments needing reminders
 */
export function getCommitmentsNeedingReminders(hoursBeforeDue: number = 24): Commitment[] {
  const reminderThreshold = new Date();
  reminderThreshold.setHours(reminderThreshold.getHours() + hoursBeforeDue);

  return query<CommitmentRow>(`
    SELECT * FROM commitments
    WHERE status = 'open'
      AND due_date IS NOT NULL
      AND due_date <= ?
      AND due_date > CURRENT_TIMESTAMP
      AND reminder_sent = 0
    ORDER BY due_date ASC
  `, [reminderThreshold.toISOString()]).map(rowToCommitment);
}

/**
 * Search commitments by description
 */
export function searchCommitments(query_: string): Commitment[] {
  const searchTerm = `%${query_}%`;
  return query<CommitmentRow>(`
    SELECT * FROM commitments
    WHERE description LIKE ?
    ORDER BY created_at DESC
    LIMIT 20
  `, [searchTerm]).map(rowToCommitment);
}

// Helper types and functions
interface CommitmentRow {
  id: string;
  type: string;
  description: string;
  owner_entity_id: string | null;
  counterparty_entity_id: string | null;
  due_date: string | null;
  status: string;
  source_type: string | null;
  source_id: string | null;
  source_timestamp: string | null;
  created_at: string;
  completed_at: string | null;
  reminder_sent: number;
}

function rowToCommitment(row: CommitmentRow): Commitment {
  return {
    id: row.id,
    type: row.type as CommitmentType,
    description: row.description,
    ownerEntityId: row.owner_entity_id || undefined,
    counterpartyEntityId: row.counterparty_entity_id || undefined,
    dueDate: row.due_date ? new Date(row.due_date) : undefined,
    status: row.status as CommitmentStatus,
    sourceType: row.source_type || undefined,
    sourceId: row.source_id || undefined,
    sourceTimestamp: row.source_timestamp ? new Date(row.source_timestamp) : undefined,
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    reminderSent: row.reminder_sent === 1,
  };
}
