// Belief Contradiction Detector
// Strategy Reference: Part 12, lines 1015-1020
//
// Detects contradictions between assertions to maintain memory integrity.

import { v4 as uuid } from 'uuid';
import { getDb, query, execute } from '../db/connection';
import type { BeliefContradiction, ContradictionType } from '../types';

interface AssertionRow {
  id: string;
  subject_entity_id: string | null;
  predicate: string;
  object_text: string | null;
  object_entity_id: string | null;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
}

/**
 * Check if two assertions contradict each other
 */
export function areContradictory(a1: AssertionRow, a2: AssertionRow): {
  contradicts: boolean;
  type?: ContradictionType;
  severity?: number;
} {
  // Same subject, same predicate, different object = potential contradiction
  if (a1.subject_entity_id !== a2.subject_entity_id) {
    return { contradicts: false };
  }

  if (a1.predicate !== a2.predicate) {
    return { contradicts: false };
  }

  // Different objects for same subject+predicate
  const objectsDiffer =
    (a1.object_text !== a2.object_text) ||
    (a1.object_entity_id !== a2.object_entity_id);

  if (!objectsDiffer) {
    return { contradicts: false };
  }

  // Check for temporal overlap (bi-temporal contradiction)
  const a1Start = a1.valid_from ? new Date(a1.valid_from) : new Date(0);
  const a1End = a1.valid_until ? new Date(a1.valid_until) : new Date(8640000000000000);
  const a2Start = a2.valid_from ? new Date(a2.valid_from) : new Date(0);
  const a2End = a2.valid_until ? new Date(a2.valid_until) : new Date(8640000000000000);

  // Check if time ranges overlap
  const temporalOverlap = a1Start <= a2End && a2Start <= a1End;

  if (!temporalOverlap) {
    // No overlap = not a contradiction, just a change over time
    return { contradicts: false };
  }

  // Determine contradiction type and severity
  let type: ContradictionType = 'direct';
  let severity = 0.5;

  // Higher confidence difference = higher severity
  const confidenceDiff = Math.abs(a1.confidence - a2.confidence);
  if (confidenceDiff > 0.5) {
    type = 'confidence';
    severity = 0.3 + (0.4 * (1 - confidenceDiff)); // Low severity if one is clearly more confident
  } else if (a1.valid_from && a2.valid_from) {
    type = 'temporal';
    severity = 0.7; // Temporal contradictions are concerning
  } else {
    type = 'direct';
    severity = 0.8; // Direct contradictions are most severe
  }

  return { contradicts: true, type, severity };
}

/**
 * Detect contradictions for a new assertion against existing ones
 */
export function detectContradictions(assertionId: string): BeliefContradiction[] {
  const db = getDb();

  // Get the new assertion
  const newAssertion = db.prepare(`
    SELECT id, subject_entity_id, predicate, object_text, object_entity_id,
           confidence, valid_from, valid_until
    FROM assertions
    WHERE id = ?
  `).get(assertionId) as AssertionRow | undefined;

  if (!newAssertion || !newAssertion.subject_entity_id) {
    return [];
  }

  // Find potentially contradicting assertions
  const candidates = db.prepare(`
    SELECT id, subject_entity_id, predicate, object_text, object_entity_id,
           confidence, valid_from, valid_until
    FROM assertions
    WHERE subject_entity_id = ?
      AND predicate = ?
      AND id != ?
  `).all(
    newAssertion.subject_entity_id,
    newAssertion.predicate,
    assertionId
  ) as AssertionRow[];

  const contradictions: BeliefContradiction[] = [];

  for (const candidate of candidates) {
    const check = areContradictory(newAssertion, candidate);

    if (check.contradicts && check.type && check.severity !== undefined) {
      // Check if this contradiction is already recorded
      const existing = db.prepare(`
        SELECT id FROM belief_contradictions
        WHERE (assertion_id_1 = ? AND assertion_id_2 = ?)
           OR (assertion_id_1 = ? AND assertion_id_2 = ?)
      `).get(assertionId, candidate.id, candidate.id, assertionId);

      if (!existing) {
        const contradiction: BeliefContradiction = {
          id: uuid(),
          assertionId1: assertionId,
          assertionId2: candidate.id,
          detectedAt: new Date(),
          contradictionType: check.type,
          severity: check.severity,
          resolutionStatus: 'pending',
        };

        // Store the contradiction
        execute(`
          INSERT INTO belief_contradictions
          (id, assertion_id_1, assertion_id_2, detected_at, contradiction_type, severity, resolution_status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          contradiction.id,
          contradiction.assertionId1,
          contradiction.assertionId2,
          contradiction.detectedAt.toISOString(),
          contradiction.contradictionType,
          contradiction.severity,
          contradiction.resolutionStatus,
        ]);

        contradictions.push(contradiction);
      }
    }
  }

  return contradictions;
}

/**
 * Get all pending contradictions
 */
export function getPendingContradictions(): BeliefContradiction[] {
  return query<{
    id: string;
    assertion_id_1: string;
    assertion_id_2: string;
    detected_at: string;
    contradiction_type: string | null;
    severity: number;
    resolution_status: string;
  }>(`
    SELECT id, assertion_id_1, assertion_id_2, detected_at,
           contradiction_type, severity, resolution_status
    FROM belief_contradictions
    WHERE resolution_status = 'pending'
    ORDER BY severity DESC, detected_at ASC
  `).map(row => ({
    id: row.id,
    assertionId1: row.assertion_id_1,
    assertionId2: row.assertion_id_2,
    detectedAt: new Date(row.detected_at),
    contradictionType: row.contradiction_type as ContradictionType | undefined,
    severity: row.severity,
    resolutionStatus: row.resolution_status as 'pending',
  }));
}

/**
 * Get contradictions by severity threshold
 */
export function getHighSeverityContradictions(threshold: number = 0.7): BeliefContradiction[] {
  return query<{
    id: string;
    assertion_id_1: string;
    assertion_id_2: string;
    detected_at: string;
    contradiction_type: string | null;
    severity: number;
    resolution_status: string;
  }>(`
    SELECT id, assertion_id_1, assertion_id_2, detected_at,
           contradiction_type, severity, resolution_status
    FROM belief_contradictions
    WHERE severity >= ? AND resolution_status = 'pending'
    ORDER BY severity DESC
  `, [threshold]).map(row => ({
    id: row.id,
    assertionId1: row.assertion_id_1,
    assertionId2: row.assertion_id_2,
    detectedAt: new Date(row.detected_at),
    contradictionType: row.contradiction_type as ContradictionType | undefined,
    severity: row.severity,
    resolutionStatus: row.resolution_status as 'pending',
  }));
}
