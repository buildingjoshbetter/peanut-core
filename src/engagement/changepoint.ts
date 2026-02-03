// Change Point Detection (CUSUM Algorithm)
// Strategy Reference: Part 16, lines 1353-1390
//
// Detects genuine personality shifts (new job, relationship change, crisis, growth)
// using CUSUM (Cumulative Sum Control Chart) algorithm.

import { v4 as uuid } from 'uuid';
import { execute, query } from '../db/connection';

/**
 * CUSUM-based change point detector for personality drift
 */
export class PersonalityChangeDetector {
  private threshold: number;
  private driftWindow: number;
  private history: number[][] = [];
  private cusumPos: number = 0;
  private cusumNeg: number = 0;
  private userId: string;

  constructor(
    userId: string = 'default',
    options: {
      threshold?: number;
      driftWindow?: number;
    } = {}
  ) {
    this.userId = userId;
    this.threshold = options.threshold ?? 3.0;
    this.driftWindow = options.driftWindow ?? 20;

    // Load history from database
    this.loadHistory();
  }

  /**
   * Load recent style history from database
   */
  private loadHistory(): void {
    const rows = query<{
      formality: number;
      verbosity: number;
      emoji_density: number;
      positivity_bias: number;
      directness: number;
    }>(`
      SELECT formality, verbosity, emoji_density, positivity_bias, directness
      FROM user_style_dimensions
      WHERE user_id = ?
      ORDER BY last_updated DESC
      LIMIT ?
    `, [this.userId, this.driftWindow]);

    this.history = rows.map(r => [
      r.formality,
      r.verbosity,
      r.emoji_density,
      r.positivity_bias,
      r.directness,
    ]);
  }

  /**
   * Update with a new style observation and check for change point
   */
  update(styleVector: number[]): {
    changeDetected: boolean;
    deviation: number;
    cusumPos: number;
    cusumNeg: number;
  } {
    this.history.push(styleVector);

    if (this.history.length < this.driftWindow) {
      return {
        changeDetected: false,
        deviation: 0,
        cusumPos: this.cusumPos,
        cusumNeg: this.cusumNeg,
      };
    }

    // Calculate baseline from recent history (excluding current)
    const baseline = this.calculateMean(
      this.history.slice(-this.driftWindow - 1, -1)
    );

    // Calculate deviation from baseline
    const deviation = this.calculateDistance(styleVector, baseline);

    // CUSUM update
    // k is the allowance value (typically 0.5 standard deviations)
    const k = 0.5;
    this.cusumPos = Math.max(0, this.cusumPos + deviation - k);
    this.cusumNeg = Math.max(0, this.cusumNeg - deviation + k);

    // Check for change point
    const changeDetected = this.cusumPos > this.threshold || this.cusumNeg > this.threshold;

    if (changeDetected) {
      // Reset CUSUM after detecting change
      this.cusumPos = 0;
      this.cusumNeg = 0;

      // Log the change point
      this.logChangePoint(deviation, styleVector, baseline);
    }

    return {
      changeDetected,
      deviation,
      cusumPos: this.cusumPos,
      cusumNeg: this.cusumNeg,
    };
  }

  /**
   * Calculate mean of style vectors
   */
  private calculateMean(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];

    const firstVec = vectors[0];
    if (!firstVec) return [];

    const dims = firstVec.length;
    const mean = new Array(dims).fill(0) as number[];

    for (const vec of vectors) {
      for (let i = 0; i < dims; i++) {
        const val = vec[i];
        if (val !== undefined) {
          mean[i] = (mean[i] ?? 0) + val;
        }
      }
    }

    for (let i = 0; i < dims; i++) {
      mean[i] = (mean[i] ?? 0) / vectors.length;
    }

    return mean;
  }

  /**
   * Calculate Euclidean distance between vectors
   */
  private calculateDistance(v1: number[], v2: number[]): number {
    if (v1.length !== v2.length) return 0;

    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
      const a = v1[i] ?? 0;
      const b = v2[i] ?? 0;
      sum += Math.pow(a - b, 2);
    }

    return Math.sqrt(sum);
  }

  /**
   * Log a detected change point to the database
   */
  private logChangePoint(
    deviation: number,
    currentVector: number[],
    baseline: number[]
  ): void {
    const dimensions = ['formality', 'verbosity', 'emoji_density', 'positivity_bias', 'directness'];

    for (let i = 0; i < dimensions.length && i < currentVector.length; i++) {
      const currentVal = currentVector[i] ?? 0;
      const baselineVal = baseline[i] ?? 0;
      const delta = currentVal - baselineVal;

      if (Math.abs(delta) > 0.1) {  // Only log significant changes
        execute(`
          INSERT INTO personality_evolution
          (id, timestamp, dimension, old_value, new_value, learning_rate)
          VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
        `, [
          uuid(),
          dimensions[i],
          baselineVal,
          currentVal,
          deviation,  // Use deviation as a proxy for learning rate/intensity
        ]);
      }
    }
  }

  /**
   * Reset the detector (e.g., after user confirms new baseline)
   */
  reset(): void {
    this.cusumPos = 0;
    this.cusumNeg = 0;
    this.history = [];
  }

  /**
   * Get current CUSUM state
   */
  getState(): {
    cusumPos: number;
    cusumNeg: number;
    historyLength: number;
    isNearThreshold: boolean;
  } {
    return {
      cusumPos: this.cusumPos,
      cusumNeg: this.cusumNeg,
      historyLength: this.history.length,
      isNearThreshold: this.cusumPos > this.threshold * 0.7 || this.cusumNeg > this.threshold * 0.7,
    };
  }
}

/**
 * Check for personality change and get adjustment factor
 */
export function checkPersonalityChange(
  userId: string,
  currentStyle: {
    formality: number;
    verbosity: number;
    emojiDensity: number;
    positivityBias: number;
    directness: number;
  }
): {
  changeDetected: boolean;
  recommendedLearningRate: number;
} {
  const detector = new PersonalityChangeDetector(userId);

  const styleVector = [
    currentStyle.formality,
    currentStyle.verbosity,
    currentStyle.emojiDensity,
    currentStyle.positivityBias,
    currentStyle.directness,
  ];

  const result = detector.update(styleVector);

  // If change detected, temporarily increase learning rate
  // to adapt faster to the new personality
  const baseLearningRate = 0.1;
  const boostedLearningRate = 0.3;

  return {
    changeDetected: result.changeDetected,
    recommendedLearningRate: result.changeDetected ? boostedLearningRate : baseLearningRate,
  };
}

/**
 * Get recent change points from the database
 */
export function getRecentChangePoints(
  userId: string,
  days: number = 30
): Array<{
  timestamp: Date;
  dimension: string;
  oldValue: number;
  newValue: number;
  delta: number;
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return query<{
    timestamp: string;
    dimension: string;
    old_value: number;
    new_value: number;
  }>(`
    SELECT timestamp, dimension, old_value, new_value
    FROM personality_evolution
    WHERE timestamp > ?
    ORDER BY timestamp DESC
  `, [cutoff.toISOString()]).map(row => ({
    timestamp: new Date(row.timestamp),
    dimension: row.dimension,
    oldValue: row.old_value,
    newValue: row.new_value,
    delta: row.new_value - row.old_value,
  }));
}
