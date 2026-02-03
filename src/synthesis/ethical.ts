// Ethical Bounds Checking
// Strategy Reference: Part 16, Part 3.4
//
// Enforces guardrails to prevent:
// - Manipulation patterns
// - Sycophancy
// - Pressure tactics
// - Emotional exploitation

import { query, execute } from '../db/connection';
import type { EthicalBound } from '../types';

// ============================================================
// TYPES
// ============================================================

export interface EthicalCheckResult {
  passed: boolean;
  violations: EthicalViolation[];
  adjustments: StyleAdjustment[];
  overallRisk: 'none' | 'low' | 'medium' | 'high';
}

export interface EthicalViolation {
  dimension: string;
  actualValue: number;
  boundMin: number;
  boundMax: number;
  severity: 'warning' | 'block';
  description: string;
}

export interface StyleAdjustment {
  dimension: string;
  originalValue: number;
  adjustedValue: number;
  reason: string;
}

export interface ResponseAnalysis {
  manipulationScore: number;      // 0-1: Dark patterns
  sycophancyScore: number;        // 0-1: Excessive agreement
  pressureTactics: number;        // 0-1: Urgency/pressure
  emotionalExploitation: number;  // 0-1: Vulnerability targeting
  authenticityScore: number;      // 0-1: Genuine vs performative
}

// ============================================================
// BOUNDS MANAGEMENT
// ============================================================

/**
 * Get all ethical bounds
 */
export function getEthicalBounds(): EthicalBound[] {
  const rows = query<{
    dimension: string;
    min_value: number;
    max_value: number;
    description: string | null;
  }>(`
    SELECT * FROM ethical_bounds
  `, []);

  return rows.map(row => ({
    dimension: row.dimension,
    minValue: row.min_value,
    maxValue: row.max_value,
    description: row.description ?? undefined,
  }));
}

/**
 * Get bound for specific dimension
 */
export function getBound(dimension: string): EthicalBound | null {
  const rows = query<{
    dimension: string;
    min_value: number;
    max_value: number;
    description: string | null;
  }>(`
    SELECT * FROM ethical_bounds WHERE dimension = ?
  `, [dimension]);

  if (rows.length === 0) return null;

  const row = rows[0]!;
  return {
    dimension: row.dimension,
    minValue: row.min_value,
    maxValue: row.max_value,
    description: row.description ?? undefined,
  };
}

/**
 * Update ethical bound
 */
export function updateBound(
  dimension: string,
  minValue: number,
  maxValue: number,
  description?: string
): void {
  execute(`
    INSERT OR REPLACE INTO ethical_bounds (dimension, min_value, max_value, description)
    VALUES (?, ?, ?, ?)
  `, [dimension, minValue, maxValue, description || null]);
}

/**
 * Seed default ethical bounds
 */
export function seedDefaultBounds(): void {
  const defaults: Array<{ dimension: string; min: number; max: number; desc: string }> = [
    { dimension: 'manipulation_score', min: 0, max: 0.3, desc: 'Prevent dark patterns' },
    { dimension: 'sycophancy_score', min: 0, max: 0.4, desc: 'Maintain honesty' },
    { dimension: 'pressure_tactics', min: 0, max: 0.1, desc: 'No urgency manipulation' },
    { dimension: 'emotional_exploitation', min: 0, max: 0.2, desc: 'No vulnerability targeting' },
    { dimension: 'authenticity_score', min: 0.6, max: 1.0, desc: 'Genuine responses' },
  ];

  for (const d of defaults) {
    const existing = getBound(d.dimension);
    if (!existing) {
      updateBound(d.dimension, d.min, d.max, d.desc);
    }
  }
}

// ============================================================
// RESPONSE ANALYSIS
// ============================================================

/**
 * Analyze a draft response for ethical concerns
 */
export function analyzeResponse(
  responseText: string,
  context?: {
    recipientName?: string;
    isVenting?: boolean;
    sentimentScore?: number;
  }
): ResponseAnalysis {
  const text = responseText.toLowerCase();

  // 1. Manipulation patterns
  const manipulationIndicators = [
    /\b(act now|limited time|don't miss|last chance)\b/i,
    /\b(everyone is|most people|you should)\b/i,
    /\b(trust me|believe me|honestly)\b/i,  // Excessive trust signals
  ];
  const manipulationCount = manipulationIndicators.filter(p => p.test(text)).length;
  const manipulationScore = Math.min(1, manipulationCount * 0.25);

  // 2. Sycophancy patterns
  const sycophancyIndicators = [
    /\b(you're (absolutely|totally|completely) right)\b/i,
    /\b(great (idea|point|question)!)\b/i,
    /\b(i (completely|totally|absolutely) agree)\b/i,
    /\b(that's (brilliant|genius|amazing))\b/i,
  ];
  const sycophancyCount = sycophancyIndicators.filter(p => p.test(text)).length;
  let sycophancyScore = Math.min(1, sycophancyCount * 0.3);

  // Adjust for context (some agreement is normal)
  if (sycophancyCount <= 1) {
    sycophancyScore *= 0.5;  // Single instance is less concerning
  }

  // 3. Pressure tactics
  const pressureIndicators = [
    /\b(asap|urgent|immediately|right now)\b/i,
    /\b(you (need|must|have) to)\b/i,
    /\b(don't (wait|delay|hesitate))\b/i,
    /!{2,}/,  // Multiple exclamation marks
  ];
  const pressureCount = pressureIndicators.filter(p => p.test(text)).length;
  const pressureTactics = Math.min(1, pressureCount * 0.3);

  // 4. Emotional exploitation
  let emotionalExploitation = 0;
  if (context?.isVenting) {
    // Check if response is taking advantage of vulnerable state
    const exploitativePatterns = [
      /\b(you should|why don't you|have you considered)\b/i,  // Unsolicited advice
      /\b(i told you|you knew|you should have)\b/i,  // Blame
    ];
    const exploitCount = exploitativePatterns.filter(p => p.test(text)).length;
    emotionalExploitation = Math.min(1, exploitCount * 0.4);
  }

  // 5. Authenticity (inverse of performative language)
  const performativePatterns = [
    /\b(i'm so (sorry|happy|excited) to hear)\b/i,
    /\b(thank you so much for sharing)\b/i,
    /\b(i really appreciate)\b/i,
  ];
  const performativeCount = performativePatterns.filter(p => p.test(text)).length;
  const authenticityScore = Math.max(0, 1 - performativeCount * 0.15);

  return {
    manipulationScore,
    sycophancyScore,
    pressureTactics,
    emotionalExploitation,
    authenticityScore,
  };
}

// ============================================================
// ETHICAL CHECKING
// ============================================================

/**
 * Check if a response passes ethical bounds
 */
export function checkEthicalBounds(analysis: ResponseAnalysis): EthicalCheckResult {
  const bounds = getEthicalBounds();
  const violations: EthicalViolation[] = [];
  const adjustments: StyleAdjustment[] = [];

  // Map analysis fields to dimension names
  const analysisMap: Record<string, number> = {
    manipulation_score: analysis.manipulationScore,
    sycophancy_score: analysis.sycophancyScore,
    pressure_tactics: analysis.pressureTactics,
    emotional_exploitation: analysis.emotionalExploitation,
    authenticity_score: analysis.authenticityScore,
  };

  for (const bound of bounds) {
    const value = analysisMap[bound.dimension];
    if (value === undefined) continue;

    // Check if value is within bounds
    if (value < bound.minValue || value > bound.maxValue) {
      const isBelow = value < bound.minValue;
      const severity = Math.abs(isBelow ? bound.minValue - value : value - bound.maxValue) > 0.2
        ? 'block'
        : 'warning';

      violations.push({
        dimension: bound.dimension,
        actualValue: value,
        boundMin: bound.minValue,
        boundMax: bound.maxValue,
        severity,
        description: bound.description || `${bound.dimension} out of bounds`,
      });

      // Suggest adjustment
      const targetValue = isBelow ? bound.minValue : bound.maxValue;
      adjustments.push({
        dimension: bound.dimension,
        originalValue: value,
        adjustedValue: targetValue,
        reason: `Adjust to stay within ethical bounds`,
      });
    }
  }

  // Calculate overall risk
  let overallRisk: 'none' | 'low' | 'medium' | 'high' = 'none';
  const blockCount = violations.filter(v => v.severity === 'block').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;

  if (blockCount > 0) {
    overallRisk = 'high';
  } else if (warningCount >= 2) {
    overallRisk = 'medium';
  } else if (warningCount === 1) {
    overallRisk = 'low';
  }

  return {
    passed: blockCount === 0,
    violations,
    adjustments,
    overallRisk,
  };
}

/**
 * Apply ethical adjustments to response
 */
export function applyEthicalAdjustments(
  responseText: string,
  adjustments: StyleAdjustment[]
): string {
  let adjusted = responseText;

  for (const adj of adjustments) {
    switch (adj.dimension) {
      case 'manipulation_score':
        // Remove urgency language
        adjusted = adjusted.replace(/\b(act now|limited time|don't miss|last chance)\b/gi, '');
        break;

      case 'sycophancy_score':
        // Tone down excessive agreement
        adjusted = adjusted.replace(/you're absolutely right/gi, 'that makes sense');
        adjusted = adjusted.replace(/great (idea|point)!/gi, 'good $1.');
        break;

      case 'pressure_tactics':
        // Remove pressure language
        adjusted = adjusted.replace(/\b(asap|urgently)\b/gi, 'when you can');
        adjusted = adjusted.replace(/you (need|must|have) to/gi, 'you might want to');
        break;

      case 'authenticity_score':
        // This is harder to fix programmatically
        // Just flag for human review
        break;
    }
  }

  return adjusted.trim();
}

// ============================================================
// PATTERN DETECTION
// ============================================================

/**
 * Detect if adaptation is drifting toward manipulation
 */
export function detectManipulationDrift(
  recentAnalyses: ResponseAnalysis[],
  windowSize: number = 10
): {
  driftDetected: boolean;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  averageManipulation: number;
} {
  if (recentAnalyses.length < 3) {
    return {
      driftDetected: false,
      trendDirection: 'stable',
      averageManipulation: 0,
    };
  }

  const window = recentAnalyses.slice(-windowSize);
  const scores = window.map(a => a.manipulationScore);

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Check trend (simple linear regression)
  let sumXY = 0;
  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  const n = scores.length;

  for (let i = 0; i < n; i++) {
    sumXY += i * scores[i]!;
    sumX += i;
    sumY += scores[i]!;
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  let trendDirection: 'increasing' | 'decreasing' | 'stable';
  if (slope > 0.01) {
    trendDirection = 'increasing';
  } else if (slope < -0.01) {
    trendDirection = 'decreasing';
  } else {
    trendDirection = 'stable';
  }

  // Drift detected if increasing and above threshold
  const driftDetected = trendDirection === 'increasing' && avg > 0.2;

  return {
    driftDetected,
    trendDirection,
    averageManipulation: avg,
  };
}

/**
 * Log ethical check for audit trail
 */
export function logEthicalCheck(
  responseId: string,
  analysis: ResponseAnalysis,
  result: EthicalCheckResult
): void {
  // Could store in database for audit
  console.log('Ethical check:', {
    responseId,
    analysis,
    passed: result.passed,
    overallRisk: result.overallRisk,
    violations: result.violations.length,
  });
}
