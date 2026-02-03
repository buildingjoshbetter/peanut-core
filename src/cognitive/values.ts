// Value Extraction Module
// Strategy Reference: Part 5.5, Part 11
//
// Extracts and tracks user values from behavior:
// - What they prioritize
// - What they protect
// - What they avoid
// - What they invest in

import { v4 as uuid } from 'uuid';
import { execute, query } from '../db/connection';
import { getDecisionsByType, type DecisionType } from './decisions';

// ============================================================
// TYPES
// ============================================================

export interface UserValue {
  id: string;
  name: string;
  category: ValueCategory;
  strength: number;          // 0-1, how strongly held
  evidence: ValueEvidence[];
  conflictsWith?: string[];  // Other value IDs
  lastReinforced: Date;
  createdAt: Date;
}

export type ValueCategory =
  | 'time'           // How they value their time
  | 'relationships'  // How they value relationships
  | 'work'           // Work-related values
  | 'personal'       // Personal life values
  | 'financial'      // Financial values
  | 'health'         // Health and wellness
  | 'growth';        // Learning and development

export interface ValueEvidence {
  type: 'decision' | 'commitment' | 'pattern' | 'explicit';
  sourceId?: string;
  description: string;
  timestamp: Date;
  reinforces: boolean;  // true = supports value, false = contradicts
}

export interface ValueConflict {
  value1Id: string;
  value2Id: string;
  description: string;
  occurrenceCount: number;
  lastOccurred: Date;
}

// ============================================================
// VALUE EXTRACTION
// ============================================================

/**
 * Extract values from decision history
 */
export function extractValuesFromDecisions(): Map<string, { count: number; examples: string[] }> {
  const valueSignals = new Map<string, { count: number; examples: string[] }>();

  const allTypes: DecisionType[] = [
    'scheduling', 'communication', 'prioritization',
    'delegation', 'resource', 'commitment',
  ];

  for (const type of allTypes) {
    const decisions = getDecisionsByType(type, { limit: 100, onlyWithOutcome: true });

    for (const d of decisions) {
      // Analyze what was prioritized
      const signals = analyzeDecisionForValues(d.description, d.chosenOptionId, d.options);

      for (const signal of signals) {
        const current = valueSignals.get(signal.value) || { count: 0, examples: [] };
        current.count++;
        if (current.examples.length < 3) {
          current.examples.push(signal.example);
        }
        valueSignals.set(signal.value, current);
      }
    }
  }

  return valueSignals;
}

/**
 * Analyze a single decision for value signals
 */
function analyzeDecisionForValues(
  description: string,
  chosenOptionId: string | null,
  options: Array<{ id: string; label: string; effort?: string }>
): Array<{ value: string; example: string }> {
  const signals: Array<{ value: string; example: string }> = [];
  const lower = description.toLowerCase();

  // Time value signals
  if (lower.includes('urgent') || lower.includes('asap') || lower.includes('deadline')) {
    signals.push({ value: 'time_efficiency', example: description });
  }

  if (lower.includes('family') || lower.includes('personal')) {
    signals.push({ value: 'work_life_balance', example: description });
  }

  // Relationship value signals
  if (lower.includes('help') || lower.includes('support') || lower.includes('favor')) {
    signals.push({ value: 'helping_others', example: description });
  }

  // Quality value signals
  if (chosenOptionId) {
    const chosen = options.find(o => o.id === chosenOptionId);
    if (chosen) {
      if (chosen.effort === 'high') {
        signals.push({ value: 'quality_over_speed', example: `Chose high-effort: ${chosen.label}` });
      } else if (chosen.effort === 'low') {
        signals.push({ value: 'efficiency', example: `Chose low-effort: ${chosen.label}` });
      }
    }
  }

  return signals;
}

/**
 * Extract values from commitments
 */
export function extractValuesFromCommitments(): Map<string, { count: number; examples: string[] }> {
  const valueSignals = new Map<string, { count: number; examples: string[] }>();

  // Analyze commitment patterns
  const commitments = query<{
    type: string;
    description: string;
    status: string;
  }>(`
    SELECT type, description, status
    FROM commitments
    WHERE status IN ('open', 'completed')
    ORDER BY created_at DESC
    LIMIT 200
  `, []);

  for (const c of commitments) {
    const lower = c.description.toLowerCase();

    // Promise-keeping value
    if (c.type === 'promise' && c.status === 'completed') {
      const current = valueSignals.get('reliability') || { count: 0, examples: [] };
      current.count++;
      if (current.examples.length < 3) {
        current.examples.push(c.description);
      }
      valueSignals.set('reliability', current);
    }

    // Responsiveness value
    if (c.type === 'ask' && c.status === 'completed') {
      const current = valueSignals.get('responsiveness') || { count: 0, examples: [] };
      current.count++;
      if (current.examples.length < 3) {
        current.examples.push(c.description);
      }
      valueSignals.set('responsiveness', current);
    }

    // Domain-specific values
    if (lower.includes('exercise') || lower.includes('gym') || lower.includes('health')) {
      const current = valueSignals.get('health') || { count: 0, examples: [] };
      current.count++;
      valueSignals.set('health', current);
    }

    if (lower.includes('learn') || lower.includes('course') || lower.includes('study')) {
      const current = valueSignals.get('learning') || { count: 0, examples: [] };
      current.count++;
      valueSignals.set('learning', current);
    }
  }

  return valueSignals;
}

// ============================================================
// VALUE STORAGE
// ============================================================

/**
 * Create or update a user value
 */
export function upsertValue(
  name: string,
  category: ValueCategory,
  evidence: ValueEvidence
): string {
  // Check if value exists
  const existing = query<{ id: string; strength: number; evidence: string }>(`
    SELECT id, strength, evidence FROM user_values WHERE name = ?
  `, [name]);

  if (existing.length > 0) {
    const current = existing[0]!;
    const existingEvidence: ValueEvidence[] = JSON.parse(current.evidence);
    existingEvidence.push(evidence);

    // Increase strength with reinforcing evidence
    const newStrength = evidence.reinforces
      ? Math.min(1, current.strength + 0.05)
      : Math.max(0, current.strength - 0.03);

    execute(`
      UPDATE user_values
      SET strength = ?,
          evidence = ?,
          last_reinforced = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newStrength, JSON.stringify(existingEvidence.slice(-20)), current.id]);

    return current.id;
  }

  // Create new value
  const id = uuid();
  execute(`
    INSERT INTO user_values (
      id, name, category, strength, evidence,
      last_reinforced, created_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [
    id,
    name,
    category,
    evidence.reinforces ? 0.5 : 0.3,
    JSON.stringify([evidence]),
  ]);

  return id;
}

/**
 * Get all user values
 */
export function getUserValues(): UserValue[] {
  const rows = query<{
    id: string;
    name: string;
    category: string;
    strength: number;
    evidence: string;
    conflicts_with: string | null;
    last_reinforced: string;
    created_at: string;
  }>(`
    SELECT * FROM user_values
    ORDER BY strength DESC
  `, []);

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    category: row.category as ValueCategory,
    strength: row.strength,
    evidence: JSON.parse(row.evidence),
    conflictsWith: row.conflicts_with ? JSON.parse(row.conflicts_with) : undefined,
    lastReinforced: new Date(row.last_reinforced),
    createdAt: new Date(row.created_at),
  }));
}

/**
 * Get top values by strength
 */
export function getTopValues(limit: number = 5): UserValue[] {
  const all = getUserValues();
  return all.slice(0, limit);
}

/**
 * Get values by category
 */
export function getValuesByCategory(category: ValueCategory): UserValue[] {
  const all = getUserValues();
  return all.filter(v => v.category === category);
}

// ============================================================
// VALUE ANALYSIS
// ============================================================

/**
 * Detect value conflicts
 */
export function detectValueConflicts(): ValueConflict[] {
  const values = getUserValues();
  const conflicts: ValueConflict[] = [];

  // Known conflict pairs
  const conflictPairs: Array<[string, string, string]> = [
    ['work_dedication', 'work_life_balance', 'Work vs personal time'],
    ['quality_over_speed', 'efficiency', 'Quality vs speed trade-off'],
    ['helping_others', 'time_efficiency', 'Helping others vs own time'],
    ['reliability', 'flexibility', 'Commitment vs adaptability'],
  ];

  for (const [v1Name, v2Name, description] of conflictPairs) {
    const v1 = values.find(v => v.name === v1Name);
    const v2 = values.find(v => v.name === v2Name);

    if (v1 && v2 && v1.strength > 0.5 && v2.strength > 0.5) {
      conflicts.push({
        value1Id: v1.id,
        value2Id: v2.id,
        description,
        occurrenceCount: 1,  // Would need tracking
        lastOccurred: new Date(),
      });
    }
  }

  return conflicts;
}

/**
 * Check if action aligns with values
 */
export function checkValueAlignment(
  action: string,
  context?: { entityId?: string; isUrgent?: boolean }
): {
  aligned: boolean;
  alignedValues: string[];
  conflictingValues: string[];
  recommendation?: string;
} {
  const values = getTopValues(10);
  const lower = action.toLowerCase();

  const alignedValues: string[] = [];
  const conflictingValues: string[] = [];

  for (const value of values) {
    const valueLower = value.name.toLowerCase().replace(/_/g, ' ');

    // Check alignment (simplified)
    if (lower.includes(valueLower) || isActionAlignedWithValue(lower, value.name)) {
      alignedValues.push(value.name);
    }

    // Check conflicts
    if (isActionConflictingWithValue(lower, value.name, context)) {
      conflictingValues.push(value.name);
    }
  }

  let recommendation: string | undefined;
  if (conflictingValues.length > 0 && alignedValues.length === 0) {
    recommendation = `This action may conflict with your values: ${conflictingValues.join(', ')}`;
  }

  return {
    aligned: alignedValues.length > conflictingValues.length,
    alignedValues,
    conflictingValues,
    recommendation,
  };
}

function isActionAlignedWithValue(action: string, valueName: string): boolean {
  const alignments: Record<string, string[]> = {
    reliability: ['deliver', 'complete', 'finish', 'send', 'follow up'],
    helping_others: ['help', 'assist', 'support', 'favor'],
    time_efficiency: ['quick', 'fast', 'efficient', 'streamline'],
    learning: ['learn', 'study', 'research', 'explore'],
    health: ['exercise', 'rest', 'break', 'walk'],
  };

  const keywords = alignments[valueName] || [];
  return keywords.some(k => action.includes(k));
}

function isActionConflictingWithValue(
  action: string,
  valueName: string,
  context?: { isUrgent?: boolean }
): boolean {
  // Work-life balance conflicts
  if (valueName === 'work_life_balance') {
    if (action.includes('weekend') || action.includes('late night')) {
      return true;
    }
  }

  // Reliability conflicts
  if (valueName === 'reliability') {
    if (action.includes('cancel') || action.includes('postpone') || action.includes('skip')) {
      return true;
    }
  }

  return false;
}

/**
 * Run value extraction job
 */
export function runValueExtraction(): {
  valuesUpdated: number;
  newValuesFound: number;
} {
  let updated = 0;
  let created = 0;

  // Extract from decisions
  const decisionValues = extractValuesFromDecisions();
  for (const [valueName, data] of decisionValues) {
    if (data.count >= 3) {  // Need at least 3 signals
      const category = inferCategory(valueName);
      const evidence: ValueEvidence = {
        type: 'decision',
        description: `Observed in ${data.count} decisions`,
        timestamp: new Date(),
        reinforces: true,
      };

      const existing = query<{ id: string }>(`SELECT id FROM user_values WHERE name = ?`, [valueName]);
      upsertValue(valueName, category, evidence);

      if (existing.length > 0) updated++;
      else created++;
    }
  }

  // Extract from commitments
  const commitmentValues = extractValuesFromCommitments();
  for (const [valueName, data] of commitmentValues) {
    if (data.count >= 3) {
      const category = inferCategory(valueName);
      const evidence: ValueEvidence = {
        type: 'commitment',
        description: `Observed in ${data.count} commitments`,
        timestamp: new Date(),
        reinforces: true,
      };

      const existing = query<{ id: string }>(`SELECT id FROM user_values WHERE name = ?`, [valueName]);
      upsertValue(valueName, category, evidence);

      if (existing.length > 0) updated++;
      else created++;
    }
  }

  return { valuesUpdated: updated, newValuesFound: created };
}

function inferCategory(valueName: string): ValueCategory {
  const categoryMap: Record<string, ValueCategory> = {
    time_efficiency: 'time',
    work_life_balance: 'time',
    helping_others: 'relationships',
    reliability: 'relationships',
    responsiveness: 'relationships',
    quality_over_speed: 'work',
    efficiency: 'work',
    work_dedication: 'work',
    health: 'health',
    learning: 'growth',
  };

  return categoryMap[valueName] || 'personal';
}

/**
 * Get values summary for LLM
 */
export function getValuesSummaryForLlm(): string {
  const values = getTopValues(5);

  if (values.length === 0) {
    return '';
  }

  const lines = ['User Values (by importance):'];

  for (const value of values) {
    const strengthLabel =
      value.strength > 0.8 ? 'strongly values' :
      value.strength > 0.6 ? 'values' :
      value.strength > 0.4 ? 'somewhat values' :
      'slightly values';

    lines.push(`- ${strengthLabel} ${value.name.replace(/_/g, ' ')}`);
  }

  return lines.join('\n');
}
