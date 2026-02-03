// Bi-Temporal Query Functions
// Strategy Reference: Part 11, Part 12
//
// Supports "time-travel" queries:
// - What did we know at a specific point in time?
// - How has our knowledge about an entity evolved?
// - Supersede assertions with new information while preserving history

import { v4 as uuid } from 'uuid';
import { execute, query } from '../db/connection';

// ============================================================
// TYPES
// ============================================================

export interface TemporalAssertion {
  id: string;
  subjectEntityId?: string;
  predicate: string;
  objectValue?: string;
  objectEntityId?: string;
  confidence: number;
  sourceType: string;
  sourceId?: string;
  sourceTimestamp?: Date;
  extractedAt: Date;
  /** When this fact became true in the real world */
  validFrom?: Date;
  /** When this fact stopped being true (null = still true) */
  validUntil?: Date;
  /** When we learned this fact */
  learnedAt: Date;
  /** ID of the assertion this supersedes */
  supersedesId?: string;
  /** ID of the assertion that superseded this */
  supersededById?: string;
}

export interface EntitySnapshot {
  entityId: string;
  canonicalName: string;
  asOfDate: Date;
  assertions: TemporalAssertion[];
  attributes: Array<{
    type: string;
    value: string;
    confidence: number;
    learnedAt: Date;
  }>;
}

export interface AssertionHistory {
  assertionId: string;
  predicate: string;
  objectValue: string;
  versions: Array<{
    id: string;
    objectValue: string;
    validFrom: Date;
    validUntil?: Date;
    learnedAt: Date;
    sourceType: string;
    confidence: number;
  }>;
}

// ============================================================
// TEMPORAL QUERIES
// ============================================================

/**
 * Get assertions as they were known at a specific point in time
 *
 * @param subjectEntityId - Entity to get assertions for
 * @param asOfDate - Point in time to query
 * @param options - Optional filters
 */
export function getAssertionsAsOf(
  subjectEntityId: string,
  asOfDate: Date,
  options?: {
    predicate?: string;
    includeSuperseded?: boolean;
  }
): TemporalAssertion[] {
  let sql = `
    SELECT
      a.*,
      a.extracted_at as learned_at,
      a.valid_from,
      a.valid_until,
      a.supersedes_id,
      a.superseded_by_id
    FROM assertions a
    WHERE a.subject_entity_id = ?
      AND a.extracted_at <= ?
  `;
  const params: unknown[] = [subjectEntityId, asOfDate.toISOString()];

  // Filter out superseded assertions unless explicitly requested
  if (!options?.includeSuperseded) {
    sql += ` AND (a.superseded_by_id IS NULL OR a.superseded_by_id = '')`;
  }

  // Filter by predicate
  if (options?.predicate) {
    sql += ' AND a.predicate = ?';
    params.push(options.predicate);
  }

  // Only include assertions that were valid at the asOfDate
  sql += ` AND (a.valid_from IS NULL OR a.valid_from <= ?)`;
  params.push(asOfDate.toISOString());

  sql += ` AND (a.valid_until IS NULL OR a.valid_until > ?)`;
  params.push(asOfDate.toISOString());

  sql += ' ORDER BY a.extracted_at DESC';

  const rows = query<{
    id: string;
    subject_entity_id: string;
    predicate: string;
    object_type: string;
    object_value: string;
    object_entity_id: string | null;
    confidence: number;
    source_type: string;
    source_id: string | null;
    source_timestamp: string | null;
    learned_at: string;
    valid_from: string | null;
    valid_until: string | null;
    supersedes_id: string | null;
    superseded_by_id: string | null;
  }>(sql, params);

  return rows.map(row => ({
    id: row.id,
    subjectEntityId: row.subject_entity_id,
    predicate: row.predicate,
    objectValue: row.object_value,
    objectEntityId: row.object_entity_id || undefined,
    confidence: row.confidence,
    sourceType: row.source_type,
    sourceId: row.source_id || undefined,
    sourceTimestamp: row.source_timestamp ? new Date(row.source_timestamp) : undefined,
    extractedAt: new Date(row.learned_at),
    learnedAt: new Date(row.learned_at),
    validFrom: row.valid_from ? new Date(row.valid_from) : undefined,
    validUntil: row.valid_until ? new Date(row.valid_until) : undefined,
    supersedesId: row.supersedes_id || undefined,
    supersededById: row.superseded_by_id || undefined,
  }));
}

/**
 * Get entity state at a specific point in time
 *
 * @param entityId - Entity to get state for
 * @param asOfDate - Point in time to query
 */
export function getEntityStateAsOf(entityId: string, asOfDate: Date): EntitySnapshot | null {
  // Get entity info
  const entity = query<{ canonical_name: string }>(`
    SELECT canonical_name FROM entities WHERE id = ?
  `, [entityId]);

  if (entity.length === 0) return null;

  // Get assertions as of date
  const assertions = getAssertionsAsOf(entityId, asOfDate);

  // Get attributes as of date
  const attributes = query<{
    attribute_type: string;
    attribute_value: string;
    confidence: number;
    created_at: string;
  }>(`
    SELECT attribute_type, attribute_value, confidence, created_at
    FROM entity_attributes
    WHERE entity_id = ?
      AND created_at <= ?
    ORDER BY created_at DESC
  `, [entityId, asOfDate.toISOString()]);

  return {
    entityId,
    canonicalName: entity[0]!.canonical_name,
    asOfDate,
    assertions,
    attributes: attributes.map(a => ({
      type: a.attribute_type,
      value: a.attribute_value,
      confidence: a.confidence,
      learnedAt: new Date(a.created_at),
    })),
  };
}

/**
 * Supersede an assertion with new information
 * Preserves the old assertion for history while marking it as superseded
 *
 * @param oldAssertionId - ID of the assertion being superseded
 * @param newAssertion - New assertion data
 */
export function supersedeAssertion(
  oldAssertionId: string,
  newAssertion: {
    objectValue: string;
    objectEntityId?: string;
    confidence: number;
    sourceType: string;
    sourceId?: string;
    validFrom?: Date;
  }
): string {
  // Get old assertion
  const old = query<{
    subject_entity_id: string;
    predicate: string;
    object_type: string;
    valid_from: string | null;
  }>(`
    SELECT subject_entity_id, predicate, object_type, valid_from
    FROM assertions WHERE id = ?
  `, [oldAssertionId]);

  if (old.length === 0) {
    throw new Error(`Assertion ${oldAssertionId} not found`);
  }

  const oldAssertion = old[0]!;
  const newId = uuid();
  const now = new Date();

  // Mark old assertion as superseded (valid_until = now)
  execute(`
    UPDATE assertions
    SET valid_until = ?,
        superseded_by_id = ?
    WHERE id = ?
  `, [now.toISOString(), newId, oldAssertionId]);

  // Create new assertion
  execute(`
    INSERT INTO assertions (
      id, subject_entity_id, predicate, object_type, object_value,
      object_entity_id, confidence, source_type, source_id,
      source_timestamp, extracted_at, valid_from, supersedes_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    newId,
    oldAssertion.subject_entity_id,
    oldAssertion.predicate,
    oldAssertion.object_type,
    newAssertion.objectValue,
    newAssertion.objectEntityId || null,
    newAssertion.confidence,
    newAssertion.sourceType,
    newAssertion.sourceId || null,
    now.toISOString(),
    now.toISOString(),
    newAssertion.validFrom?.toISOString() || now.toISOString(),
    oldAssertionId,
  ]);

  return newId;
}

/**
 * Get the history of a specific assertion (all versions)
 *
 * @param assertionId - ID of any version of the assertion
 */
export function getAssertionHistory(assertionId: string): AssertionHistory | null {
  // First, find the root assertion (original version)
  let rootId = assertionId;
  let current = query<{ supersedes_id: string | null }>(`
    SELECT supersedes_id FROM assertions WHERE id = ?
  `, [rootId]);

  while (current.length > 0 && current[0]!.supersedes_id) {
    rootId = current[0]!.supersedes_id;
    current = query<{ supersedes_id: string | null }>(`
      SELECT supersedes_id FROM assertions WHERE id = ?
    `, [rootId]);
  }

  // Get the root assertion info
  const root = query<{
    predicate: string;
    object_value: string;
  }>(`
    SELECT predicate, object_value FROM assertions WHERE id = ?
  `, [rootId]);

  if (root.length === 0) return null;

  // Define version row type
  type VersionRow = {
    id: string;
    object_value: string;
    valid_from: string | null;
    valid_until: string | null;
    extracted_at: string;
    source_type: string;
    confidence: number;
    superseded_by_id: string | null;
  };

  // Get all versions in the chain
  const versions: AssertionHistory['versions'] = [];

  let currentId: string | null = rootId;
  while (currentId) {
    const versionRows: VersionRow[] = query<VersionRow>(`
      SELECT id, object_value, valid_from, valid_until, extracted_at, source_type, confidence, superseded_by_id
      FROM assertions WHERE id = ?
    `, [currentId]);

    if (versionRows.length === 0) break;

    const versionData: VersionRow = versionRows[0]!;
    versions.push({
      id: versionData.id,
      objectValue: versionData.object_value,
      validFrom: versionData.valid_from ? new Date(versionData.valid_from) : new Date(versionData.extracted_at),
      validUntil: versionData.valid_until ? new Date(versionData.valid_until) : undefined,
      learnedAt: new Date(versionData.extracted_at),
      sourceType: versionData.source_type,
      confidence: versionData.confidence,
    });

    currentId = versionData.superseded_by_id;
  }

  return {
    assertionId: rootId,
    predicate: root[0]!.predicate,
    objectValue: root[0]!.object_value,
    versions,
  };
}

/**
 * Get all changes to an entity within a time range
 *
 * @param entityId - Entity to get changes for
 * @param startDate - Start of time range
 * @param endDate - End of time range
 */
export function getEntityChanges(
  entityId: string,
  startDate: Date,
  endDate: Date
): Array<{
  type: 'added' | 'superseded' | 'attribute_added';
  timestamp: Date;
  description: string;
  assertionId?: string;
}> {
  const changes: Array<{
    type: 'added' | 'superseded' | 'attribute_added';
    timestamp: Date;
    description: string;
    assertionId?: string;
  }> = [];

  // Get new assertions in range
  const newAssertions = query<{
    id: string;
    predicate: string;
    object_value: string;
    extracted_at: string;
    supersedes_id: string | null;
  }>(`
    SELECT id, predicate, object_value, extracted_at, supersedes_id
    FROM assertions
    WHERE subject_entity_id = ?
      AND extracted_at BETWEEN ? AND ?
    ORDER BY extracted_at ASC
  `, [entityId, startDate.toISOString(), endDate.toISOString()]);

  for (const a of newAssertions) {
    if (a.supersedes_id) {
      changes.push({
        type: 'superseded',
        timestamp: new Date(a.extracted_at),
        description: `Updated ${a.predicate}: ${a.object_value}`,
        assertionId: a.id,
      });
    } else {
      changes.push({
        type: 'added',
        timestamp: new Date(a.extracted_at),
        description: `Learned ${a.predicate}: ${a.object_value}`,
        assertionId: a.id,
      });
    }
  }

  // Get new attributes in range
  const newAttributes = query<{
    attribute_type: string;
    attribute_value: string;
    created_at: string;
  }>(`
    SELECT attribute_type, attribute_value, created_at
    FROM entity_attributes
    WHERE entity_id = ?
      AND created_at BETWEEN ? AND ?
    ORDER BY created_at ASC
  `, [entityId, startDate.toISOString(), endDate.toISOString()]);

  for (const attr of newAttributes) {
    changes.push({
      type: 'attribute_added',
      timestamp: new Date(attr.created_at),
      description: `Added ${attr.attribute_type}: ${attr.attribute_value}`,
    });
  }

  // Sort by timestamp
  changes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return changes;
}

/**
 * Get assertions that are currently in conflict
 * (Same predicate for same entity with different values, both currently valid)
 */
export function getConflictingAssertions(entityId: string): Array<{
  predicate: string;
  assertions: TemporalAssertion[];
}> {
  const conflicts: Array<{
    predicate: string;
    assertions: TemporalAssertion[];
  }> = [];

  // Get all current assertions grouped by predicate
  const rows = query<{
    predicate: string;
    count: number;
  }>(`
    SELECT predicate, COUNT(*) as count
    FROM assertions
    WHERE subject_entity_id = ?
      AND (superseded_by_id IS NULL OR superseded_by_id = '')
      AND (valid_until IS NULL OR valid_until > datetime('now'))
    GROUP BY predicate
    HAVING COUNT(*) > 1
  `, [entityId]);

  for (const row of rows) {
    const assertions = getAssertionsAsOf(entityId, new Date(), {
      predicate: row.predicate,
    });

    if (assertions.length > 1) {
      conflicts.push({
        predicate: row.predicate,
        assertions,
      });
    }
  }

  return conflicts;
}

/**
 * Ensure the assertions table has bi-temporal columns
 */
export function ensureBiTemporalColumns(): void {
  // Check if columns exist
  const columns = query<{ name: string }>(`
    PRAGMA table_info(assertions)
  `, []);

  const columnNames = new Set(columns.map(c => c.name));

  if (!columnNames.has('valid_from')) {
    execute('ALTER TABLE assertions ADD COLUMN valid_from DATETIME', []);
  }

  if (!columnNames.has('valid_until')) {
    execute('ALTER TABLE assertions ADD COLUMN valid_until DATETIME', []);
  }

  if (!columnNames.has('supersedes_id')) {
    execute('ALTER TABLE assertions ADD COLUMN supersedes_id TEXT', []);
  }

  if (!columnNames.has('superseded_by_id')) {
    execute('ALTER TABLE assertions ADD COLUMN superseded_by_id TEXT', []);
  }
}
