// Personality adaptation based on engagement signals

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection';
import { calculateEngagementScore, type EngagementSignal } from './tracker';

// Learning rate dynamics from 9-model consensus
const BASE_LEARNING_RATE = 0.3;
const MIN_LEARNING_RATE = 0.05;
const DECAY_POINT = 50;  // interactions
const SESSION_CAP = 0.01;  // Max 1% shift per session

// Vent mode thresholds
const VENT_SENTIMENT_THRESHOLD = -0.5;
const VENT_THREAD_LENGTH_THRESHOLD = 5;
const VENT_MESSAGE_VELOCITY_THRESHOLD = 3;  // messages per minute

export interface AdaptationResult {
  applied: boolean;
  learningRate: number;
  changes: Array<{
    dimension: string;
    oldValue: number;
    newValue: number;
    delta: number;
  }>;
  reason?: string;  // Why adaptation was/wasn't applied
}

/**
 * Calculate dynamic learning rate based on interaction count
 * Decays from 0.3 to 0.05 as confidence grows
 */
export function calculateLearningRate(interactionCount: number): number {
  // Exponential decay toward minimum
  const decayFactor = Math.pow(0.9, interactionCount / 10);
  return Math.max(MIN_LEARNING_RATE, BASE_LEARNING_RATE * decayFactor);
}

/**
 * Detect vent mode - when user is emotionally venting
 * During vent mode, freeze personality adaptation
 */
export function detectVentMode(
  sentiment: number,
  threadLength: number,
  messageVelocity: number = 0,
  capsRatio: number = 0
): { isVenting: boolean; confidence: number; signals: string[] } {
  let signals: string[] = [];
  let score = 0;

  // Strong negative sentiment
  if (sentiment < VENT_SENTIMENT_THRESHOLD) {
    signals.push('strong_negative_sentiment');
    score += 2;
  } else if (sentiment < -0.3) {
    signals.push('negative_sentiment');
    score += 1;
  }

  // Extended thread with negativity
  if (threadLength > VENT_THREAD_LENGTH_THRESHOLD && sentiment < 0) {
    signals.push('extended_negative_thread');
    score += 1;
  }

  // Rapid message succession
  if (messageVelocity > VENT_MESSAGE_VELOCITY_THRESHOLD) {
    signals.push('rapid_messages');
    score += 1;
  }

  // Excessive caps usage
  if (capsRatio > 0.3) {
    signals.push('excessive_caps');
    score += 1;
  }

  return {
    isVenting: score >= 3,
    confidence: Math.min(score / 5, 1),
    signals,
  };
}

/**
 * Calculate caps ratio in text
 */
export function calculateCapsRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return 0;

  const caps = letters.replace(/[^A-Z]/g, '');
  return caps.length / letters.length;
}

/**
 * Apply personality adaptation based on engagement
 */
export function applyAdaptation(
  signal: EngagementSignal,
  options: {
    checkVentMode?: boolean;
    sessionEngagement?: number;  // Total engagement this session
  } = {}
): AdaptationResult {
  const db = getDb();

  // Get current interaction count
  const stats = db.prepare(`
    SELECT interaction_count FROM user_style WHERE id = 'default'
  `).get() as { interaction_count: number };

  const interactionCount = stats?.interaction_count ?? 0;

  // Calculate learning rate
  let learningRate = calculateLearningRate(interactionCount);

  // Apply session cap
  if (options.sessionEngagement !== undefined) {
    learningRate = Math.min(learningRate, SESSION_CAP / Math.max(options.sessionEngagement, 0.01));
  }

  // Check vent mode
  if (options.checkVentMode && signal.userResponseSentiment !== undefined) {
    const ventCheck = detectVentMode(
      signal.userResponseSentiment,
      signal.threadLength ?? 0
    );

    if (ventCheck.isVenting) {
      // Log vent mode detection
      db.prepare(`
        INSERT INTO engagement_events (
          id, interaction_type, timestamp, user_response_sentiment, thread_length
        ) VALUES (?, 'vent_mode_detected', datetime('now'), ?, ?)
      `).run(uuidv4(), signal.userResponseSentiment, signal.threadLength ?? 0);

      return {
        applied: false,
        learningRate: 0,
        changes: [],
        reason: `Vent mode detected (${ventCheck.signals.join(', ')}). Adaptation frozen.`,
      };
    }
  }

  // Calculate engagement score
  const engagement = calculateEngagementScore(signal);

  // Only adapt if we have enough confidence in the signal
  if (engagement.confidence < 0.3) {
    return {
      applied: false,
      learningRate,
      changes: [],
      reason: 'Insufficient signal confidence for adaptation',
    };
  }

  // Get current style
  const currentStyle = db.prepare(`
    SELECT formality, verbosity, emoji_density FROM user_style WHERE id = 'default'
  `).get() as { formality: number; verbosity: number; emoji_density: number };

  const changes: AdaptationResult['changes'] = [];

  // Adapt based on engagement score
  // High engagement = move toward this style
  // Low engagement = move away from this style
  const adaptationDirection = engagement.overall - 0.5;  // -0.5 to 0.5
  const adaptationMagnitude = Math.abs(adaptationDirection) * learningRate;

  // For now, we adjust based on edit ratio as proxy for style match
  // If user heavily edited, our style was wrong
  if (signal.editRatio !== undefined) {
    const editPenalty = signal.editRatio > 0.5 ? -0.1 : 0.05;
    const formalityDelta = editPenalty * adaptationMagnitude;

    const newFormality = Math.max(0, Math.min(1,
      currentStyle.formality + formalityDelta
    ));

    if (Math.abs(newFormality - currentStyle.formality) > 0.001) {
      changes.push({
        dimension: 'formality',
        oldValue: currentStyle.formality,
        newValue: newFormality,
        delta: formalityDelta,
      });
    }
  }

  // Apply changes if any
  if (changes.length > 0) {
    // Update user_style
    for (const change of changes) {
      db.prepare(`
        UPDATE user_style SET ${change.dimension} = ?, updated_at = datetime('now')
        WHERE id = 'default'
      `).run(change.newValue);

      // Log to personality_evolution
      db.prepare(`
        INSERT INTO personality_evolution (
          id, timestamp, dimension, old_value, new_value, learning_rate
        ) VALUES (?, datetime('now'), ?, ?, ?, ?)
      `).run(uuidv4(), change.dimension, change.oldValue, change.newValue, learningRate);
    }

    // Increment interaction count
    db.prepare(`
      UPDATE user_style SET interaction_count = interaction_count + 1
      WHERE id = 'default'
    `).run();
  }

  return {
    applied: changes.length > 0,
    learningRate,
    changes,
  };
}

/**
 * Get personality evolution history
 */
export function getPersonalityEvolution(
  limit: number = 100,
  dimension?: string
): Array<{
  id: string;
  timestamp: Date;
  dimension: string;
  oldValue: number;
  newValue: number;
  learningRate: number;
}> {
  const db = getDb();

  let sql = 'SELECT * FROM personality_evolution';
  const params: unknown[] = [];

  if (dimension) {
    sql += ' WHERE dimension = ?';
    params.push(dimension);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: string;
    timestamp: string;
    dimension: string;
    old_value: number;
    new_value: number;
    learning_rate: number;
  }>;

  return rows.map(row => ({
    id: row.id,
    timestamp: new Date(row.timestamp),
    dimension: row.dimension,
    oldValue: row.old_value,
    newValue: row.new_value,
    learningRate: row.learning_rate,
  }));
}

/**
 * Detect significant personality drift using CUSUM algorithm
 */
export function detectPersonalityDrift(
  dimension: string,
  threshold: number = 0.15
): { driftDetected: boolean; magnitude: number; direction: 'positive' | 'negative' | 'none' } {
  const history = getPersonalityEvolution(50, dimension);

  if (history.length < 10) {
    return { driftDetected: false, magnitude: 0, direction: 'none' };
  }

  // Calculate cumulative sum of changes
  let cusumPos = 0;
  let cusumNeg = 0;
  const targetChange = 0;  // Expected change is 0

  for (const entry of history) {
    const change = entry.newValue - entry.oldValue;
    cusumPos = Math.max(0, cusumPos + change - targetChange);
    cusumNeg = Math.max(0, cusumNeg - change + targetChange);
  }

  const magnitude = Math.max(cusumPos, cusumNeg);
  const driftDetected = magnitude > threshold;

  let direction: 'positive' | 'negative' | 'none' = 'none';
  if (driftDetected) {
    direction = cusumPos > cusumNeg ? 'positive' : 'negative';
  }

  return { driftDetected, magnitude, direction };
}

/**
 * Get engagement summary statistics
 */
export function getEngagementSummary(): {
  totalInteractions: number;
  averageEngagement: number;
  currentLearningRate: number;
  recentDrifts: Array<{ dimension: string; direction: string }>;
  ventModeCount: number;
} {
  const db = getDb();

  // Get interaction count
  const stats = db.prepare(`
    SELECT interaction_count FROM user_style WHERE id = 'default'
  `).get() as { interaction_count: number } | undefined;

  const totalInteractions = stats?.interaction_count ?? 0;

  // Get average engagement from recent events
  const engagementStats = db.prepare(`
    SELECT
      AVG(1 - COALESCE(edit_ratio, 0.5)) as avg_engagement,
      COUNT(*) as count
    FROM engagement_events
    WHERE timestamp > datetime('now', '-30 days')
      AND interaction_type IN ('draft_edited', 'response_received')
  `).get() as { avg_engagement: number | null; count: number };

  // Get vent mode count
  const ventCount = db.prepare(`
    SELECT COUNT(*) as count FROM engagement_events
    WHERE interaction_type = 'vent_mode_detected'
      AND timestamp > datetime('now', '-30 days')
  `).get() as { count: number };

  // Check for drifts in key dimensions
  const dimensions = ['formality', 'verbosity', 'emoji_density'];
  const recentDrifts: Array<{ dimension: string; direction: string }> = [];

  for (const dim of dimensions) {
    const drift = detectPersonalityDrift(dim);
    if (drift.driftDetected) {
      recentDrifts.push({ dimension: dim, direction: drift.direction });
    }
  }

  return {
    totalInteractions,
    averageEngagement: engagementStats.avg_engagement ?? 0.5,
    currentLearningRate: calculateLearningRate(totalInteractions),
    recentDrifts,
    ventModeCount: ventCount.count,
  };
}
