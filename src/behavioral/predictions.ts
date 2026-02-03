// Prediction Engine
// Strategy Reference: Part 5
//
// Generates predictions for proactive intelligence:
// - Pre-meeting context surfacing
// - Anticipated needs based on patterns
// - Deadline reminders

import { v4 as uuid } from 'uuid';
import { query, execute } from '../db/connection';
import type { Prediction, PredictionType, BehavioralPattern } from '../types';
import { getPatterns } from './patterns';

// ============================================================
// TYPES
// ============================================================

export interface PredictionContext {
  currentTime: Date;
  activeContext?: string;
  recentActivities?: string[];
  upcomingEvents?: Array<{
    id: string;
    title: string;
    startTime: Date;
    attendees?: string[];
  }>;
}

export interface GeneratedPrediction {
  type: PredictionType;
  target: string;
  confidence: number;
  predictedTime: Date;
  reasoning: string;
  suggestedAction?: string;
  relatedPatterns?: string[];
}

// ============================================================
// PREDICTION GENERATION
// ============================================================

/**
 * Generate predictions based on current context and patterns
 */
export function generatePredictions(context: PredictionContext): GeneratedPrediction[] {
  const predictions: GeneratedPrediction[] = [];

  // 1. Pre-meeting context predictions
  predictions.push(...generateMeetingPredictions(context));

  // 2. Pattern-based predictions
  predictions.push(...generatePatternPredictions(context));

  // 3. Context switch predictions
  predictions.push(...generateContextSwitchPredictions(context));

  // Sort by confidence and time
  return predictions
    .sort((a, b) => {
      const timeDiff = a.predictedTime.getTime() - b.predictedTime.getTime();
      if (Math.abs(timeDiff) < 3600000) {  // Within 1 hour
        return b.confidence - a.confidence;
      }
      return timeDiff;
    })
    .slice(0, 10);  // Top 10 predictions
}

/**
 * Generate predictions for upcoming meetings
 */
function generateMeetingPredictions(context: PredictionContext): GeneratedPrediction[] {
  const predictions: GeneratedPrediction[] = [];

  if (!context.upcomingEvents) return predictions;

  const now = context.currentTime.getTime();
  const fiveMinutes = 5 * 60 * 1000;
  const thirtyMinutes = 30 * 60 * 1000;

  for (const event of context.upcomingEvents) {
    const timeUntil = event.startTime.getTime() - now;

    // Pre-meeting context (5-30 min before)
    if (timeUntil > fiveMinutes && timeUntil < thirtyMinutes) {
      predictions.push({
        type: 'need_surfaced',
        target: `meeting_context:${event.id}`,
        confidence: 0.9,
        predictedTime: new Date(event.startTime.getTime() - fiveMinutes),
        reasoning: `Meeting "${event.title}" starts in ${Math.round(timeUntil / 60000)} minutes`,
        suggestedAction: `Surface context for ${event.attendees?.join(', ') || 'attendees'}`,
        relatedPatterns: [],
      });
    }

    // Meeting prep reminder (30min-1hr before)
    if (timeUntil > thirtyMinutes && timeUntil < 3600000) {
      predictions.push({
        type: 'next_action',
        target: `meeting_prep:${event.id}`,
        confidence: 0.7,
        predictedTime: new Date(event.startTime.getTime() - thirtyMinutes),
        reasoning: `Prepare for "${event.title}"`,
        suggestedAction: 'Review agenda and previous discussions',
      });
    }
  }

  return predictions;
}

/**
 * Generate predictions from behavioral patterns
 */
function generatePatternPredictions(context: PredictionContext): GeneratedPrediction[] {
  const predictions: GeneratedPrediction[] = [];

  // Get strong patterns
  const patterns = getPatterns({
    minConfidence: 0.6,
    limit: 20,
  });

  const now = context.currentTime;
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  for (const pattern of patterns) {
    // Check time-based patterns
    if (pattern.timeSignature) {
      const sig = pattern.timeSignature as Record<string, number>;

      // Daily habits at specific hour
      if (sig.hourOfDay !== undefined) {
        const patternHour = sig.hourOfDay;
        let hoursUntil = patternHour - currentHour;
        if (hoursUntil < 0) hoursUntil += 24;

        if (hoursUntil > 0 && hoursUntil <= 2) {
          const predictedTime = new Date(now);
          predictedTime.setHours(patternHour, 0, 0, 0);
          if (predictedTime < now) {
            predictedTime.setDate(predictedTime.getDate() + 1);
          }

          predictions.push({
            type: 'next_action',
            target: `pattern:${pattern.id}`,
            confidence: pattern.confidence * 0.8,
            predictedTime,
            reasoning: `Based on pattern: ${pattern.description}`,
            suggestedAction: pattern.description,
            relatedPatterns: [pattern.id],
          });
        }
      }

      // Weekly patterns
      if (sig.dayOfWeek !== undefined && sig.dayOfWeek === currentDay) {
        predictions.push({
          type: 'next_action',
          target: `weekly_pattern:${pattern.id}`,
          confidence: pattern.confidence * 0.7,
          predictedTime: now,
          reasoning: `Weekly pattern: ${pattern.description}`,
          suggestedAction: pattern.description,
          relatedPatterns: [pattern.id],
        });
      }
    }
  }

  return predictions;
}

/**
 * Predict context switches
 */
function generateContextSwitchPredictions(context: PredictionContext): GeneratedPrediction[] {
  const predictions: GeneratedPrediction[] = [];

  const now = context.currentTime;
  const hour = now.getHours();

  // Common context switch times
  const switchTimes = [
    { hour: 9, from: 'personal', to: 'work', desc: 'Start of work day' },
    { hour: 12, from: 'work', to: 'personal', desc: 'Lunch break' },
    { hour: 13, from: 'personal', to: 'work', desc: 'Back from lunch' },
    { hour: 17, from: 'work', to: 'personal', desc: 'End of work day' },
  ];

  for (const st of switchTimes) {
    const hoursUntil = st.hour - hour;
    if (hoursUntil > 0 && hoursUntil <= 1) {
      const predictedTime = new Date(now);
      predictedTime.setHours(st.hour, 0, 0, 0);

      predictions.push({
        type: 'context_switch',
        target: `${st.from}_to_${st.to}`,
        confidence: 0.6,
        predictedTime,
        reasoning: st.desc,
        suggestedAction: `Prepare for ${st.to} context`,
      });
    }
  }

  return predictions;
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

/**
 * Save a prediction to database
 */
export function savePrediction(prediction: GeneratedPrediction): string {
  const id = uuid();
  const now = new Date();

  execute(`
    INSERT INTO predictions (
      id, prediction_type, target, confidence,
      predicted_time, based_on_patterns, context_signals,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    prediction.type,
    prediction.target,
    prediction.confidence,
    prediction.predictedTime.toISOString(),
    prediction.relatedPatterns ? JSON.stringify(prediction.relatedPatterns) : null,
    JSON.stringify({ reasoning: prediction.reasoning, suggestedAction: prediction.suggestedAction }),
    now.toISOString(),
  ]);

  return id;
}

/**
 * Record prediction outcome
 */
export function recordPredictionOutcome(
  id: string,
  wasCorrect: boolean,
  actualTime?: Date,
  feedback?: string
): void {
  execute(`
    UPDATE predictions
    SET
      was_correct = ?,
      actual_time = ?,
      user_feedback = ?
    WHERE id = ?
  `, [
    wasCorrect,
    actualTime?.toISOString() || null,
    feedback || null,
    id,
  ]);
}

/**
 * Get pending predictions (not yet verified)
 */
export function getPendingPredictions(): Prediction[] {
  const rows = query<{
    id: string;
    prediction_type: string;
    target: string;
    confidence: number;
    predicted_time: string;
    based_on_patterns: string | null;
    context_signals: string | null;
    was_correct: boolean | null;
    actual_time: string | null;
    user_feedback: string | null;
    created_at: string;
  }>(`
    SELECT * FROM predictions
    WHERE was_correct IS NULL
      AND predicted_time > datetime('now', '-1 day')
    ORDER BY predicted_time ASC
  `, []);

  return rows.map(row => ({
    id: row.id,
    predictionType: row.prediction_type as PredictionType,
    target: row.target,
    confidence: row.confidence,
    predictedTime: new Date(row.predicted_time),
    basedOnPatterns: row.based_on_patterns ? JSON.parse(row.based_on_patterns) : undefined,
    contextSignals: row.context_signals ? JSON.parse(row.context_signals) : undefined,
    wasCorrect: row.was_correct ?? undefined,
    actualTime: row.actual_time ? new Date(row.actual_time) : undefined,
    userFeedback: row.user_feedback ?? undefined,
    createdAt: new Date(row.created_at),
  }));
}

/**
 * Get prediction accuracy statistics
 */
export function getPredictionAccuracy(options?: {
  predictionType?: PredictionType;
  daysBack?: number;
}): {
  total: number;
  correct: number;
  incorrect: number;
  pending: number;
  accuracy: number;
} {
  const daysBack = options?.daysBack || 30;

  let sql = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN was_correct = 0 THEN 1 ELSE 0 END) as incorrect,
      SUM(CASE WHEN was_correct IS NULL THEN 1 ELSE 0 END) as pending
    FROM predictions
    WHERE created_at > datetime('now', ?)
  `;
  const params: unknown[] = [`-${daysBack} days`];

  if (options?.predictionType) {
    sql += ' AND prediction_type = ?';
    params.push(options.predictionType);
  }

  const rows = query<{
    total: number;
    correct: number;
    incorrect: number;
    pending: number;
  }>(sql, params);

  const row = rows[0] || { total: 0, correct: 0, incorrect: 0, pending: 0 };
  const verified = row.correct + row.incorrect;

  return {
    total: row.total,
    correct: row.correct,
    incorrect: row.incorrect,
    pending: row.pending,
    accuracy: verified > 0 ? row.correct / verified : 0,
  };
}

/**
 * Get upcoming predictions for surfacing
 */
export function getUpcomingPredictions(minutesAhead: number = 30): Prediction[] {
  const cutoff = new Date();
  cutoff.setMinutes(cutoff.getMinutes() + minutesAhead);

  const rows = query<{
    id: string;
    prediction_type: string;
    target: string;
    confidence: number;
    predicted_time: string;
    based_on_patterns: string | null;
    context_signals: string | null;
    created_at: string;
  }>(`
    SELECT * FROM predictions
    WHERE was_correct IS NULL
      AND predicted_time > datetime('now')
      AND predicted_time <= ?
    ORDER BY predicted_time ASC
  `, [cutoff.toISOString()]);

  return rows.map(row => ({
    id: row.id,
    predictionType: row.prediction_type as PredictionType,
    target: row.target,
    confidence: row.confidence,
    predictedTime: new Date(row.predicted_time),
    basedOnPatterns: row.based_on_patterns ? JSON.parse(row.based_on_patterns) : undefined,
    contextSignals: row.context_signals ? JSON.parse(row.context_signals) : undefined,
    createdAt: new Date(row.created_at),
  }));
}

/**
 * Clean up old predictions
 */
export function cleanupOldPredictions(daysOld: number = 90): number {
  const result = execute(`
    DELETE FROM predictions
    WHERE created_at < datetime('now', ?)
  `, [`-${daysOld} days`]);

  return result.changes;
}
