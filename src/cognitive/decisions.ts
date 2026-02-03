// Decision Tracking Module
// Strategy Reference: Part 5.5, Part 11
//
// Tracks user decisions, their contexts, and outcomes
// Used to infer preferences and predict future decisions

import { v4 as uuid } from 'uuid';
import { execute, query } from '../db/connection';

// ============================================================
// TYPES
// ============================================================

export interface Decision {
  id: string;
  decisionType: DecisionType;
  description: string;
  options: DecisionOption[];
  chosenOptionId: string | null;
  context: DecisionContext;
  outcome?: DecisionOutcome;
  createdAt: Date;
  decidedAt?: Date;
}

export type DecisionType =
  | 'scheduling'      // When to meet, deadlines
  | 'communication'   // How to respond, tone
  | 'prioritization'  // What to work on first
  | 'delegation'      // Who should handle
  | 'resource'        // Time/money/effort allocation
  | 'commitment'      // Accept/decline requests
  | 'other';

export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  predictedOutcome?: string;
  effort?: 'low' | 'medium' | 'high';
  risk?: 'low' | 'medium' | 'high';
}

export interface DecisionContext {
  entityIds?: string[];           // People/orgs involved
  commitmentIds?: string[];       // Related commitments
  timeConstraints?: {
    deadline?: Date;
    preferredTime?: string;
  };
  emotionalState?: string;        // From sentiment analysis
  workloadLevel?: 'light' | 'normal' | 'heavy';
  sourceType?: string;            // email, calendar, manual
  sourceId?: string;
}

export interface DecisionOutcome {
  rating: 'positive' | 'neutral' | 'negative';
  notes?: string;
  recordedAt: Date;
}

// ============================================================
// DECISION RECORDING
// ============================================================

/**
 * Record a new decision point
 */
export function recordDecision(
  decisionType: DecisionType,
  description: string,
  options: DecisionOption[],
  context: DecisionContext
): string {
  const id = uuid();

  execute(`
    INSERT INTO decisions (
      id, decision_type, description, options, context,
      created_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    id,
    decisionType,
    description,
    JSON.stringify(options),
    JSON.stringify(context),
  ]);

  return id;
}

/**
 * Record which option was chosen
 */
export function recordChoice(
  decisionId: string,
  chosenOptionId: string
): void {
  execute(`
    UPDATE decisions
    SET chosen_option_id = ?, decided_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [chosenOptionId, decisionId]);
}

/**
 * Record the outcome of a decision
 */
export function recordOutcome(
  decisionId: string,
  rating: DecisionOutcome['rating'],
  notes?: string
): void {
  const outcome: DecisionOutcome = {
    rating,
    notes,
    recordedAt: new Date(),
  };

  execute(`
    UPDATE decisions
    SET outcome = ?
    WHERE id = ?
  `, [JSON.stringify(outcome), decisionId]);
}

// ============================================================
// DECISION RETRIEVAL
// ============================================================

/**
 * Get a decision by ID
 */
export function getDecision(id: string): Decision | null {
  const rows = query<{
    id: string;
    decision_type: string;
    description: string;
    options: string;
    chosen_option_id: string | null;
    context: string;
    outcome: string | null;
    created_at: string;
    decided_at: string | null;
  }>(`
    SELECT * FROM decisions WHERE id = ?
  `, [id]);

  if (rows.length === 0) return null;

  const row = rows[0]!;
  return {
    id: row.id,
    decisionType: row.decision_type as DecisionType,
    description: row.description,
    options: JSON.parse(row.options),
    chosenOptionId: row.chosen_option_id,
    context: JSON.parse(row.context),
    outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
    createdAt: new Date(row.created_at),
    decidedAt: row.decided_at ? new Date(row.decided_at) : undefined,
  };
}

/**
 * Get decisions by type
 */
export function getDecisionsByType(
  decisionType: DecisionType,
  options?: {
    limit?: number;
    onlyWithOutcome?: boolean;
    entityId?: string;
  }
): Decision[] {
  let sql = `
    SELECT * FROM decisions
    WHERE decision_type = ?
  `;
  const params: unknown[] = [decisionType];

  if (options?.onlyWithOutcome) {
    sql += ' AND outcome IS NOT NULL';
  }

  if (options?.entityId) {
    sql += ' AND context LIKE ?';
    params.push(`%${options.entityId}%`);
  }

  sql += ' ORDER BY created_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = query<{
    id: string;
    decision_type: string;
    description: string;
    options: string;
    chosen_option_id: string | null;
    context: string;
    outcome: string | null;
    created_at: string;
    decided_at: string | null;
  }>(sql, params);

  return rows.map(row => ({
    id: row.id,
    decisionType: row.decision_type as DecisionType,
    description: row.description,
    options: JSON.parse(row.options),
    chosenOptionId: row.chosen_option_id,
    context: JSON.parse(row.context),
    outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
    createdAt: new Date(row.created_at),
    decidedAt: row.decided_at ? new Date(row.decided_at) : undefined,
  }));
}

/**
 * Get recent decisions for an entity
 */
export function getDecisionsForEntity(
  entityId: string,
  limit: number = 10
): Decision[] {
  const rows = query<{
    id: string;
    decision_type: string;
    description: string;
    options: string;
    chosen_option_id: string | null;
    context: string;
    outcome: string | null;
    created_at: string;
    decided_at: string | null;
  }>(`
    SELECT * FROM decisions
    WHERE context LIKE ?
    ORDER BY created_at DESC
    LIMIT ?
  `, [`%${entityId}%`, limit]);

  return rows.map(row => ({
    id: row.id,
    decisionType: row.decision_type as DecisionType,
    description: row.description,
    options: JSON.parse(row.options),
    chosenOptionId: row.chosen_option_id,
    context: JSON.parse(row.context),
    outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
    createdAt: new Date(row.created_at),
    decidedAt: row.decided_at ? new Date(row.decided_at) : undefined,
  }));
}

// ============================================================
// DECISION ANALYSIS
// ============================================================

/**
 * Analyze decision patterns for a type
 */
export function analyzeDecisionPatterns(
  decisionType: DecisionType,
  windowDays: number = 90
): {
  totalDecisions: number;
  averageDecisionTime: number;  // minutes
  outcomeDistribution: Record<string, number>;
  commonContexts: Array<{ context: string; count: number }>;
} {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const decisions = getDecisionsByType(decisionType, { onlyWithOutcome: true });
  const recentDecisions = decisions.filter(d => d.createdAt >= cutoff);

  // Calculate average decision time
  let totalTime = 0;
  let timedDecisions = 0;
  for (const d of recentDecisions) {
    if (d.decidedAt) {
      totalTime += d.decidedAt.getTime() - d.createdAt.getTime();
      timedDecisions++;
    }
  }
  const avgTimeMinutes = timedDecisions > 0
    ? totalTime / timedDecisions / 60000
    : 0;

  // Outcome distribution
  const outcomeDistribution: Record<string, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };
  for (const d of recentDecisions) {
    if (d.outcome) {
      const rating = d.outcome.rating as keyof typeof outcomeDistribution;
      outcomeDistribution[rating] = (outcomeDistribution[rating] || 0) + 1;
    }
  }

  // Common contexts (simplified - would need more sophisticated analysis)
  const contextCounts = new Map<string, number>();
  for (const d of recentDecisions) {
    if (d.context.emotionalState) {
      const key = `emotion:${d.context.emotionalState}`;
      contextCounts.set(key, (contextCounts.get(key) || 0) + 1);
    }
    if (d.context.workloadLevel) {
      const key = `workload:${d.context.workloadLevel}`;
      contextCounts.set(key, (contextCounts.get(key) || 0) + 1);
    }
  }

  const commonContexts = Array.from(contextCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([context, count]) => ({ context, count }));

  return {
    totalDecisions: recentDecisions.length,
    averageDecisionTime: avgTimeMinutes,
    outcomeDistribution,
    commonContexts,
  };
}

/**
 * Get decision success rate for a type
 */
export function getDecisionSuccessRate(
  decisionType: DecisionType,
  windowDays: number = 90
): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const decisions = getDecisionsByType(decisionType, { onlyWithOutcome: true });
  const recentDecisions = decisions.filter(d => d.createdAt >= cutoff);

  if (recentDecisions.length === 0) return 0;

  const positive = recentDecisions.filter(d => d.outcome?.rating === 'positive').length;
  return positive / recentDecisions.length;
}

/**
 * Find similar past decisions
 */
export function findSimilarDecisions(
  decisionType: DecisionType,
  context: Partial<DecisionContext>,
  limit: number = 5
): Decision[] {
  const candidates = getDecisionsByType(decisionType, {
    onlyWithOutcome: true,
    limit: 50,
  });

  // Score by context similarity
  const scored = candidates.map(d => {
    let score = 0;

    // Entity overlap
    if (context.entityIds && d.context.entityIds) {
      const overlap = context.entityIds.filter(e => d.context.entityIds?.includes(e)).length;
      score += overlap * 2;
    }

    // Same workload level
    if (context.workloadLevel && d.context.workloadLevel === context.workloadLevel) {
      score += 1;
    }

    // Same emotional state
    if (context.emotionalState && d.context.emotionalState === context.emotionalState) {
      score += 1;
    }

    // Same source type
    if (context.sourceType && d.context.sourceType === context.sourceType) {
      score += 1;
    }

    return { decision: d, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.decision);
}

/**
 * Suggest best option based on past decisions
 */
export function suggestOption(
  decisionType: DecisionType,
  options: DecisionOption[],
  context: DecisionContext
): {
  suggestedOptionId: string | null;
  confidence: number;
  reasoning: string;
} {
  const similarDecisions = findSimilarDecisions(decisionType, context);

  if (similarDecisions.length < 3) {
    return {
      suggestedOptionId: null,
      confidence: 0,
      reasoning: 'Not enough historical data',
    };
  }

  // Analyze which options led to positive outcomes
  const optionScores = new Map<string, { positive: number; total: number }>();

  for (const d of similarDecisions) {
    if (!d.chosenOptionId || !d.outcome) continue;

    const chosenOption = d.options.find(o => o.id === d.chosenOptionId);
    if (!chosenOption) continue;

    // Match by label (since IDs won't match across decisions)
    const matchingOption = options.find(o =>
      o.label.toLowerCase() === chosenOption.label.toLowerCase() ||
      o.effort === chosenOption.effort
    );

    if (matchingOption) {
      const current = optionScores.get(matchingOption.id) || { positive: 0, total: 0 };
      current.total++;
      if (d.outcome.rating === 'positive') {
        current.positive++;
      }
      optionScores.set(matchingOption.id, current);
    }
  }

  // Find best option
  let bestOptionId: string | null = null;
  let bestScore = 0;

  for (const [optionId, { positive, total }] of optionScores) {
    if (total >= 2) {  // Need at least 2 data points
      const score = positive / total;
      if (score > bestScore) {
        bestScore = score;
        bestOptionId = optionId;
      }
    }
  }

  if (!bestOptionId) {
    return {
      suggestedOptionId: null,
      confidence: 0,
      reasoning: 'No clear pattern found',
    };
  }

  const matchedOption = options.find(o => o.id === bestOptionId);

  return {
    suggestedOptionId: bestOptionId,
    confidence: bestScore,
    reasoning: `Based on ${similarDecisions.length} similar decisions, "${matchedOption?.label}" had ${Math.round(bestScore * 100)}% positive outcomes`,
  };
}
