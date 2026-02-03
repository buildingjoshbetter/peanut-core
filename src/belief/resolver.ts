// Belief Contradiction Resolver
// Strategy Reference: Part 12, lines 1015-1020
//
// Resolves contradictions through confidence updates, temporal scoping,
// or human-in-the-loop escalation.

import { v4 as uuid } from 'uuid';
import { getDb, execute, query } from '../db/connection';
import type {
  BeliefContradiction,
  BeliefRevisionEvent,
  ResolutionMethod,
} from '../types';

interface AssertionRow {
  id: string;
  predicate: string;
  object_text: string | null;
  confidence: number;
  source_type: string;
  source_timestamp: string | null;
}

/**
 * Auto-resolve a contradiction based on confidence and recency
 */
export function autoResolve(contradictionId: string): {
  resolved: boolean;
  method?: ResolutionMethod;
  winnerId?: string;
  reason?: string;
} {
  const db = getDb();

  // Get the contradiction
  const contradiction = db.prepare(`
    SELECT id, assertion_id_1, assertion_id_2, severity
    FROM belief_contradictions
    WHERE id = ? AND resolution_status = 'pending'
  `).get(contradictionId) as {
    id: string;
    assertion_id_1: string;
    assertion_id_2: string;
    severity: number;
  } | undefined;

  if (!contradiction) {
    return { resolved: false, reason: 'Contradiction not found or already resolved' };
  }

  // Get both assertions
  const a1 = db.prepare(`
    SELECT id, predicate, object_text, confidence, source_type, source_timestamp
    FROM assertions WHERE id = ?
  `).get(contradiction.assertion_id_1) as AssertionRow | undefined;

  const a2 = db.prepare(`
    SELECT id, predicate, object_text, confidence, source_type, source_timestamp
    FROM assertions WHERE id = ?
  `).get(contradiction.assertion_id_2) as AssertionRow | undefined;

  if (!a1 || !a2) {
    return { resolved: false, reason: 'One or both assertions not found' };
  }

  // High severity contradictions need human review
  if (contradiction.severity >= 0.8) {
    execute(`
      UPDATE belief_contradictions
      SET resolution_status = 'escalated'
      WHERE id = ?
    `, [contradictionId]);

    return { resolved: false, method: 'user', reason: 'High severity - escalated for human review' };
  }

  // Determine winner based on confidence and recency
  let winnerId: string;
  let loserId: string;
  let reason: string;

  const confidenceDiff = a1.confidence - a2.confidence;
  const a1Time = a1.source_timestamp ? new Date(a1.source_timestamp).getTime() : 0;
  const a2Time = a2.source_timestamp ? new Date(a2.source_timestamp).getTime() : 0;

  if (Math.abs(confidenceDiff) > 0.3) {
    // Clear confidence winner
    winnerId = confidenceDiff > 0 ? a1.id : a2.id;
    loserId = confidenceDiff > 0 ? a2.id : a1.id;
    reason = 'Resolved by confidence difference';
  } else if (a1Time !== a2Time) {
    // More recent wins if confidence is similar
    winnerId = a1Time > a2Time ? a1.id : a2.id;
    loserId = a1Time > a2Time ? a2.id : a1.id;
    reason = 'Resolved by recency (more recent assertion preferred)';
  } else {
    // Cannot auto-resolve, escalate
    execute(`
      UPDATE belief_contradictions
      SET resolution_status = 'escalated'
      WHERE id = ?
    `, [contradictionId]);

    return { resolved: false, method: 'user', reason: 'Cannot auto-resolve - needs human review' };
  }

  // Apply resolution
  const losingAssertion = loserId === a1.id ? a1 : a2;
  const newConfidence = Math.max(0.1, losingAssertion.confidence * 0.5);

  // Update losing assertion confidence
  execute(`UPDATE assertions SET confidence = ? WHERE id = ?`, [newConfidence, loserId]);

  // Log the revision
  logRevision({
    assertionId: loserId,
    oldConfidence: losingAssertion.confidence,
    newConfidence,
    reason: 'contradiction',
    evidenceSourceId: winnerId,
    userInitiated: false,
  });

  // Mark contradiction as resolved
  execute(`
    UPDATE belief_contradictions
    SET resolution_status = 'resolved',
        resolved_at = CURRENT_TIMESTAMP,
        resolution_method = 'auto',
        winning_assertion_id = ?
    WHERE id = ?
  `, [winnerId, contradictionId]);

  return { resolved: true, method: 'auto', winnerId, reason };
}

/**
 * Resolve a contradiction with user input
 */
export function userResolve(
  contradictionId: string,
  winnerId: string,
  keepBoth: boolean = false
): { resolved: boolean; reason?: string } {
  const db = getDb();

  const contradiction = db.prepare(`
    SELECT id, assertion_id_1, assertion_id_2
    FROM belief_contradictions
    WHERE id = ? AND resolution_status IN ('pending', 'escalated')
  `).get(contradictionId) as {
    id: string;
    assertion_id_1: string;
    assertion_id_2: string;
  } | undefined;

  if (!contradiction) {
    return { resolved: false, reason: 'Contradiction not found or already resolved' };
  }

  const loserId = winnerId === contradiction.assertion_id_1
    ? contradiction.assertion_id_2
    : contradiction.assertion_id_1;

  if (keepBoth) {
    // User says both are valid - they may apply to different time periods
    // Mark the older one with a valid_until
    execute(`
      UPDATE assertions
      SET valid_until = (SELECT source_timestamp FROM assertions WHERE id = ?)
      WHERE id = ?
    `, [winnerId, loserId]);

    execute(`
      UPDATE belief_contradictions
      SET resolution_status = 'resolved',
          resolved_at = CURRENT_TIMESTAMP,
          resolution_method = 'user',
          winning_assertion_id = ?
      WHERE id = ?
    `, [winnerId, contradictionId]);

    return { resolved: true, reason: 'Both kept - older assertion given end date' };
  }

  // Get loser's current confidence
  const loser = db.prepare(`SELECT confidence FROM assertions WHERE id = ?`).get(loserId) as { confidence: number };

  // Significantly reduce losing assertion's confidence
  const newConfidence = Math.max(0.05, loser.confidence * 0.2);
  execute(`UPDATE assertions SET confidence = ? WHERE id = ?`, [newConfidence, loserId]);

  // Log the revision
  logRevision({
    assertionId: loserId,
    oldConfidence: loser.confidence,
    newConfidence,
    reason: 'user_correction',
    evidenceSourceId: winnerId,
    userInitiated: true,
  });

  // Mark as resolved
  execute(`
    UPDATE belief_contradictions
    SET resolution_status = 'resolved',
        resolved_at = CURRENT_TIMESTAMP,
        resolution_method = 'user',
        winning_assertion_id = ?
    WHERE id = ?
  `, [winnerId, contradictionId]);

  return { resolved: true, reason: 'Resolved by user selection' };
}

/**
 * Log a belief revision event
 */
function logRevision(params: {
  assertionId: string;
  oldConfidence: number;
  newConfidence: number;
  reason: 'new_evidence' | 'contradiction' | 'user_correction' | 'decay';
  evidenceSourceId?: string;
  userInitiated: boolean;
}): void {
  execute(`
    INSERT INTO belief_revision_log
    (id, assertion_id, timestamp, old_confidence, new_confidence, reason, evidence_source_id, user_initiated)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
  `, [
    uuid(),
    params.assertionId,
    params.oldConfidence,
    params.newConfidence,
    params.reason,
    params.evidenceSourceId || null,
    params.userInitiated ? 1 : 0,
  ]);
}

/**
 * Get revision history for an assertion
 */
export function getRevisionHistory(assertionId: string): BeliefRevisionEvent[] {
  return query<{
    id: string;
    assertion_id: string;
    timestamp: string;
    old_confidence: number;
    new_confidence: number;
    reason: string;
    evidence_source_id: string | null;
    user_initiated: number;
  }>(`
    SELECT id, assertion_id, timestamp, old_confidence, new_confidence,
           reason, evidence_source_id, user_initiated
    FROM belief_revision_log
    WHERE assertion_id = ?
    ORDER BY timestamp DESC
  `, [assertionId]).map(row => ({
    id: row.id,
    assertionId: row.assertion_id,
    timestamp: new Date(row.timestamp),
    oldConfidence: row.old_confidence,
    newConfidence: row.new_confidence,
    reason: row.reason as BeliefRevisionEvent['reason'],
    evidenceSourceId: row.evidence_source_id || undefined,
    userInitiated: row.user_initiated === 1,
  }));
}

/**
 * Apply confidence decay to old assertions (time-travel support)
 */
export function applyConfidenceDecay(
  olderThanDays: number = 365,
  decayFactor: number = 0.9
): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const oldAssertions = query<{ id: string; confidence: number }>(`
    SELECT id, confidence
    FROM assertions
    WHERE source_timestamp < ?
      AND confidence > 0.1
  `, [cutoffDate.toISOString()]);

  let updated = 0;
  for (const assertion of oldAssertions) {
    const newConfidence = assertion.confidence * decayFactor;

    execute(`UPDATE assertions SET confidence = ? WHERE id = ?`, [newConfidence, assertion.id]);

    logRevision({
      assertionId: assertion.id,
      oldConfidence: assertion.confidence,
      newConfidence,
      reason: 'decay',
      userInitiated: false,
    });

    updated++;
  }

  return updated;
}

/**
 * Time-travel query: Get assertion state at a specific point in time
 */
export function getAssertionsAtTime(entityId: string, atTime: Date): Array<{
  id: string;
  predicate: string;
  objectText: string | null;
  confidence: number;
}> {
  const timeStr = atTime.toISOString();

  return query<{
    id: string;
    predicate: string;
    object_text: string | null;
    confidence: number;
  }>(`
    SELECT id, predicate, object_text, confidence
    FROM assertions
    WHERE subject_entity_id = ?
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_until IS NULL OR valid_until > ?)
      AND confidence > 0.3
    ORDER BY confidence DESC
  `, [entityId, timeStr, timeStr]).map(row => ({
    id: row.id,
    predicate: row.predicate,
    objectText: row.object_text,
    confidence: row.confidence,
  }));
}
