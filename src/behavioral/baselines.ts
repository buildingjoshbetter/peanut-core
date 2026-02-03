// Engagement Baselines Module
// Strategy Reference: Part 16, Part 3.3
//
// Calculates and manages engagement baselines for context-normalized scoring.
// A 3-message work email thread is great; a 3-message deep discussion is poor.

import { v4 as uuid } from 'uuid';
import { query, execute } from '../db/connection';
import type { EngagementBaseline } from '../types';

// ============================================================
// TYPES
// ============================================================

export interface InteractionData {
  contextType: string;
  responseLength: number;
  threadLength: number;
  sentiment: number;  // -1 to 1
  editRatio: number;  // 0 to 1
}

export interface NormalizedEngagement {
  rawScore: number;
  normalizedScore: number;
  deviation: number;  // Standard deviations from baseline
  contextType: string;
  comparedToBaseline: 'above' | 'below' | 'average';
}

// ============================================================
// BASELINE CALCULATION
// ============================================================

/**
 * Calculate baseline from interaction history
 */
export function calculateBaseline(interactions: InteractionData[]): Omit<EngagementBaseline, 'id' | 'lastUpdated'> {
  if (interactions.length === 0) {
    return {
      contextType: 'unknown',
      avgResponseLength: 100,
      avgThreadLength: 3,
      avgSentiment: 0,
      avgEditRatio: 0.2,
      sampleCount: 0,
    };
  }

  const contextType = interactions[0]!.contextType;

  const avgResponseLength = average(interactions.map(i => i.responseLength));
  const avgThreadLength = average(interactions.map(i => i.threadLength));
  const avgSentiment = average(interactions.map(i => i.sentiment));
  const avgEditRatio = average(interactions.map(i => i.editRatio));

  return {
    contextType,
    avgResponseLength,
    avgThreadLength,
    avgSentiment,
    avgEditRatio,
    sampleCount: interactions.length,
  };
}

/**
 * Calculate average
 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
function stdDev(values: number[], avg?: number): number {
  if (values.length < 2) return 0;
  const mean = avg ?? average(values);
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(average(squaredDiffs));
}

// ============================================================
// NORMALIZATION
// ============================================================

/**
 * Normalize an engagement score against baseline
 */
export function normalizeEngagementScore(
  rawScore: number,
  contextType: string,
  baseline?: EngagementBaseline
): NormalizedEngagement {
  // If no baseline, use defaults
  const effectiveBaseline = baseline || getDefaultBaseline(contextType);

  // Calculate expected score for this context
  const expectedScore = calculateExpectedScore(effectiveBaseline);

  // Normalize: (raw - expected) / expected
  // This gives us how much better/worse than expected
  const deviation = expectedScore > 0 ? (rawScore - expectedScore) / expectedScore : 0;

  // Convert to 0-1 scale centered at 0.5
  const normalizedScore = Math.max(0, Math.min(1, 0.5 + deviation * 0.25));

  let comparedToBaseline: 'above' | 'below' | 'average';
  if (deviation > 0.2) comparedToBaseline = 'above';
  else if (deviation < -0.2) comparedToBaseline = 'below';
  else comparedToBaseline = 'average';

  return {
    rawScore,
    normalizedScore,
    deviation,
    contextType,
    comparedToBaseline,
  };
}

/**
 * Calculate expected engagement score from baseline
 */
function calculateExpectedScore(baseline: EngagementBaseline): number {
  // Weight factors for engagement
  const lengthScore = Math.min(1, baseline.avgResponseLength / 200);  // Longer = more engaged
  const threadScore = Math.min(1, baseline.avgThreadLength / 10);  // More turns = more engaged
  const sentimentScore = (baseline.avgSentiment + 1) / 2;  // Convert -1..1 to 0..1
  const editScore = 1 - baseline.avgEditRatio;  // Lower edit = more engaged (less changed)

  return lengthScore * 0.3 + threadScore * 0.3 + sentimentScore * 0.2 + editScore * 0.2;
}

/**
 * Get default baseline for a context type
 */
function getDefaultBaseline(contextType: string): EngagementBaseline {
  const defaults: Record<string, Partial<EngagementBaseline>> = {
    work_email: {
      avgResponseLength: 150,
      avgThreadLength: 4,
      avgSentiment: 0.1,
      avgEditRatio: 0.3,
    },
    personal_email: {
      avgResponseLength: 200,
      avgThreadLength: 3,
      avgSentiment: 0.3,
      avgEditRatio: 0.2,
    },
    quick_task: {
      avgResponseLength: 50,
      avgThreadLength: 2,
      avgSentiment: 0.0,
      avgEditRatio: 0.4,
    },
    deep_discussion: {
      avgResponseLength: 500,
      avgThreadLength: 10,
      avgSentiment: 0.2,
      avgEditRatio: 0.15,
    },
    friend_chat: {
      avgResponseLength: 100,
      avgThreadLength: 20,
      avgSentiment: 0.5,
      avgEditRatio: 0.1,
    },
  };

  const baseDefaults: EngagementBaseline = {
    id: '',
    contextType,
    avgResponseLength: 100,
    avgThreadLength: 3,
    avgSentiment: 0,
    avgEditRatio: 0.2,
    sampleCount: 0,
  };

  return { ...baseDefaults, ...(defaults[contextType] || {}) };
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

/**
 * Save or update baseline
 */
export function saveBaseline(baseline: Omit<EngagementBaseline, 'id' | 'lastUpdated'>): string {
  const existing = getBaseline(baseline.contextType);

  if (existing) {
    // Update existing
    execute(`
      UPDATE engagement_baselines
      SET
        avg_response_length = ?,
        avg_thread_length = ?,
        avg_sentiment = ?,
        avg_edit_ratio = ?,
        sample_count = ?,
        last_updated = CURRENT_TIMESTAMP
      WHERE context_type = ?
    `, [
      baseline.avgResponseLength,
      baseline.avgThreadLength,
      baseline.avgSentiment,
      baseline.avgEditRatio,
      baseline.sampleCount,
      baseline.contextType,
    ]);
    return existing.id;
  } else {
    // Insert new
    const id = uuid();
    execute(`
      INSERT INTO engagement_baselines (
        id, context_type, avg_response_length, avg_thread_length,
        avg_sentiment, avg_edit_ratio, sample_count, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      id,
      baseline.contextType,
      baseline.avgResponseLength,
      baseline.avgThreadLength,
      baseline.avgSentiment,
      baseline.avgEditRatio,
      baseline.sampleCount,
    ]);
    return id;
  }
}

/**
 * Get baseline for a context type
 */
export function getBaseline(contextType: string): EngagementBaseline | null {
  const rows = query<{
    id: string;
    context_type: string;
    avg_response_length: number;
    avg_thread_length: number;
    avg_sentiment: number;
    avg_edit_ratio: number;
    sample_count: number;
    last_updated: string;
  }>(`
    SELECT * FROM engagement_baselines
    WHERE context_type = ?
  `, [contextType]);

  if (rows.length === 0) return null;

  const row = rows[0]!;
  return {
    id: row.id,
    contextType: row.context_type,
    avgResponseLength: row.avg_response_length,
    avgThreadLength: row.avg_thread_length,
    avgSentiment: row.avg_sentiment,
    avgEditRatio: row.avg_edit_ratio,
    sampleCount: row.sample_count,
    lastUpdated: new Date(row.last_updated),
  };
}

/**
 * Get all baselines
 */
export function getAllBaselines(): EngagementBaseline[] {
  const rows = query<{
    id: string;
    context_type: string;
    avg_response_length: number;
    avg_thread_length: number;
    avg_sentiment: number;
    avg_edit_ratio: number;
    sample_count: number;
    last_updated: string;
  }>(`
    SELECT * FROM engagement_baselines
    ORDER BY sample_count DESC
  `, []);

  return rows.map(row => ({
    id: row.id,
    contextType: row.context_type,
    avgResponseLength: row.avg_response_length,
    avgThreadLength: row.avg_thread_length,
    avgSentiment: row.avg_sentiment,
    avgEditRatio: row.avg_edit_ratio,
    sampleCount: row.sample_count,
    lastUpdated: new Date(row.last_updated),
  }));
}

/**
 * Update baseline with new interaction (incremental update)
 */
export function updateBaselineWithInteraction(interaction: InteractionData): void {
  const existing = getBaseline(interaction.contextType);

  if (!existing) {
    // Create new baseline from single interaction
    saveBaseline({
      contextType: interaction.contextType,
      avgResponseLength: interaction.responseLength,
      avgThreadLength: interaction.threadLength,
      avgSentiment: interaction.sentiment,
      avgEditRatio: interaction.editRatio,
      sampleCount: 1,
    });
    return;
  }

  // Exponential moving average update
  const alpha = 0.1;  // Learning rate
  const newCount = existing.sampleCount + 1;

  execute(`
    UPDATE engagement_baselines
    SET
      avg_response_length = avg_response_length * (1 - ?) + ? * ?,
      avg_thread_length = avg_thread_length * (1 - ?) + ? * ?,
      avg_sentiment = avg_sentiment * (1 - ?) + ? * ?,
      avg_edit_ratio = avg_edit_ratio * (1 - ?) + ? * ?,
      sample_count = ?,
      last_updated = CURRENT_TIMESTAMP
    WHERE context_type = ?
  `, [
    alpha, alpha, interaction.responseLength,
    alpha, alpha, interaction.threadLength,
    alpha, alpha, interaction.sentiment,
    alpha, alpha, interaction.editRatio,
    newCount,
    interaction.contextType,
  ]);
}

/**
 * Seed default baselines
 */
export function seedDefaultBaselines(): void {
  const defaults = [
    'work_email',
    'personal_email',
    'quick_task',
    'deep_discussion',
    'friend_chat',
  ];

  for (const contextType of defaults) {
    if (!getBaseline(contextType)) {
      const baseline = getDefaultBaseline(contextType);
      saveBaseline({
        contextType,
        avgResponseLength: baseline.avgResponseLength,
        avgThreadLength: baseline.avgThreadLength,
        avgSentiment: baseline.avgSentiment,
        avgEditRatio: baseline.avgEditRatio,
        sampleCount: 0,
      });
    }
  }
}

/**
 * Infer context type from signals
 */
export function inferContextType(signals: {
  recipientDomain?: string;
  subject?: string;
  threadLength?: number;
  hasAttachments?: boolean;
  timeOfDay?: number;
}): string {
  // Work indicators
  const workDomains = ['company.com', 'work.com', 'corp.com'];
  if (signals.recipientDomain && workDomains.some(d => signals.recipientDomain!.includes(d))) {
    return 'work_email';
  }

  // Quick task indicators
  if (signals.subject?.toLowerCase().match(/quick|urgent|asap|fyi|re:/)) {
    return 'quick_task';
  }

  // Deep discussion indicators
  if ((signals.threadLength || 0) > 5 && !signals.subject?.toLowerCase().includes('re:')) {
    return 'deep_discussion';
  }

  // Time-based inference
  if (signals.timeOfDay !== undefined) {
    if (signals.timeOfDay >= 9 && signals.timeOfDay < 17) {
      return 'work_email';
    }
  }

  return 'personal_email';
}
