// Cognitive Pattern Inference Module
// Strategy Reference: Part 5.5, Part 11
//
// Infers cognitive patterns from user behavior:
// - Decision-making styles
// - Communication preferences
// - Work patterns
// - Stress responses

import { v4 as uuid } from 'uuid';
import { execute, query } from '../db/connection';
import { getDecisionsByType, type DecisionType, type Decision } from './decisions';

// ============================================================
// TYPES
// ============================================================

export interface CognitivePattern {
  id: string;
  patternType: CognitivePatternType;
  name: string;
  description: string;
  indicators: PatternIndicator[];
  confidence: number;
  observationCount: number;
  lastObserved: Date;
  createdAt: Date;
}

export type CognitivePatternType =
  | 'decision_style'       // How they make decisions
  | 'communication_style'  // How they communicate
  | 'work_preference'      // How they prefer to work
  | 'stress_response'      // How they handle stress
  | 'time_preference'      // When they prefer to do things
  | 'relationship_style';  // How they manage relationships

export interface PatternIndicator {
  type: string;
  value: string | number;
  frequency: number;
  examples: string[];
}

export interface CognitiveProfile {
  decisionMaking: {
    speed: 'quick' | 'deliberate' | 'mixed';
    riskTolerance: 'low' | 'medium' | 'high';
    preferredStyle: 'analytical' | 'intuitive' | 'collaborative';
  };
  communication: {
    formality: 'formal' | 'casual' | 'adaptive';
    length: 'brief' | 'detailed' | 'varies';
    responseSpeed: 'immediate' | 'thoughtful' | 'delayed';
  };
  workStyle: {
    focusPattern: 'deep_focus' | 'multitasker' | 'balanced';
    preferredLoad: 'light' | 'moderate' | 'heavy';
    collaborationPreference: 'solo' | 'team' | 'mixed';
  };
}

// ============================================================
// PATTERN INFERENCE
// ============================================================

/**
 * Infer decision-making style from past decisions
 */
export function inferDecisionStyle(): {
  speed: 'quick' | 'deliberate' | 'mixed';
  riskTolerance: 'low' | 'medium' | 'high';
  successRate: number;
} {
  const allTypes: DecisionType[] = [
    'scheduling', 'communication', 'prioritization',
    'delegation', 'resource', 'commitment',
  ];

  let totalDecisions = 0;
  let totalTimeMs = 0;
  let timedDecisions = 0;
  let lowRiskChoices = 0;
  let highRiskChoices = 0;
  let positiveOutcomes = 0;
  let outcomeCount = 0;

  for (const type of allTypes) {
    const decisions = getDecisionsByType(type, { limit: 50 });

    for (const d of decisions) {
      totalDecisions++;

      // Decision speed
      if (d.decidedAt) {
        totalTimeMs += d.decidedAt.getTime() - d.createdAt.getTime();
        timedDecisions++;
      }

      // Risk preference
      if (d.chosenOptionId) {
        const chosen = d.options.find(o => o.id === d.chosenOptionId);
        if (chosen?.risk === 'low') lowRiskChoices++;
        if (chosen?.risk === 'high') highRiskChoices++;
      }

      // Outcome
      if (d.outcome) {
        outcomeCount++;
        if (d.outcome.rating === 'positive') positiveOutcomes++;
      }
    }
  }

  // Determine speed (average decision time)
  let speed: 'quick' | 'deliberate' | 'mixed' = 'mixed';
  if (timedDecisions > 0) {
    const avgMinutes = totalTimeMs / timedDecisions / 60000;
    if (avgMinutes < 5) speed = 'quick';
    else if (avgMinutes > 30) speed = 'deliberate';
  }

  // Determine risk tolerance
  let riskTolerance: 'low' | 'medium' | 'high' = 'medium';
  const riskDecisions = lowRiskChoices + highRiskChoices;
  if (riskDecisions > 5) {
    const highRiskRatio = highRiskChoices / riskDecisions;
    if (highRiskRatio > 0.6) riskTolerance = 'high';
    else if (highRiskRatio < 0.3) riskTolerance = 'low';
  }

  const successRate = outcomeCount > 0 ? positiveOutcomes / outcomeCount : 0;

  return { speed, riskTolerance, successRate };
}

/**
 * Infer communication style from messages
 */
export function inferCommunicationStyle(): {
  formality: 'formal' | 'casual' | 'adaptive';
  averageLength: number;
  responsePattern: 'immediate' | 'thoughtful' | 'delayed';
} {
  // Get user's sent messages
  const messages = query<{
    content: string;
    timestamp: string;
    thread_id: string;
  }>(`
    SELECT content, timestamp, thread_id
    FROM messages
    WHERE is_from_user = 1
    ORDER BY timestamp DESC
    LIMIT 100
  `, []);

  if (messages.length === 0) {
    return {
      formality: 'adaptive',
      averageLength: 0,
      responsePattern: 'thoughtful',
    };
  }

  // Analyze formality
  let formalCount = 0;
  let casualCount = 0;
  let totalLength = 0;

  const formalIndicators = ['dear', 'regards', 'sincerely', 'thank you for', 'i would like'];
  const casualIndicators = ['hey', 'hi!', 'thanks!', 'cool', 'awesome', 'lol', ':)'];

  for (const msg of messages) {
    const lower = msg.content.toLowerCase();
    totalLength += msg.content.length;

    for (const indicator of formalIndicators) {
      if (lower.includes(indicator)) {
        formalCount++;
        break;
      }
    }

    for (const indicator of casualIndicators) {
      if (lower.includes(indicator)) {
        casualCount++;
        break;
      }
    }
  }

  let formality: 'formal' | 'casual' | 'adaptive' = 'adaptive';
  if (formalCount > casualCount * 2) formality = 'formal';
  else if (casualCount > formalCount * 2) formality = 'casual';

  // Analyze response times
  const responseTimes: number[] = [];

  // Group by thread and find response times
  const threadMessages = new Map<string, Array<{ timestamp: Date; isFromUser: boolean }>>();

  const allMessages = query<{
    thread_id: string;
    timestamp: string;
    is_from_user: number;
  }>(`
    SELECT thread_id, timestamp, is_from_user
    FROM messages
    WHERE thread_id IN (
      SELECT DISTINCT thread_id FROM messages WHERE is_from_user = 1
    )
    ORDER BY thread_id, timestamp ASC
    LIMIT 500
  `, []);

  for (const msg of allMessages) {
    if (!threadMessages.has(msg.thread_id)) {
      threadMessages.set(msg.thread_id, []);
    }
    threadMessages.get(msg.thread_id)!.push({
      timestamp: new Date(msg.timestamp),
      isFromUser: msg.is_from_user === 1,
    });
  }

  // Calculate response times
  for (const [_, msgs] of threadMessages) {
    for (let i = 1; i < msgs.length; i++) {
      const prev = msgs[i - 1]!;
      const curr = msgs[i]!;

      // If user replied to non-user message
      if (!prev.isFromUser && curr.isFromUser) {
        const responseTimeMinutes = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 60000;
        if (responseTimeMinutes > 0 && responseTimeMinutes < 10080) {  // Up to 1 week
          responseTimes.push(responseTimeMinutes);
        }
      }
    }
  }

  let responsePattern: 'immediate' | 'thoughtful' | 'delayed' = 'thoughtful';
  if (responseTimes.length > 0) {
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    if (avgResponseTime < 30) responsePattern = 'immediate';
    else if (avgResponseTime > 240) responsePattern = 'delayed';
  }

  return {
    formality,
    averageLength: Math.round(totalLength / messages.length),
    responsePattern,
  };
}

/**
 * Infer work preferences from behavioral patterns
 */
export function inferWorkPreferences(): {
  peakHours: number[];
  preferredDays: number[];
  focusPattern: 'deep_focus' | 'multitasker' | 'balanced';
  preferredLoad: 'light' | 'moderate' | 'heavy';
  collaborationPreference: 'solo' | 'team' | 'mixed';
} {
  // Get activity by hour
  const hourlyActivity = query<{
    hour: number;
    count: number;
  }>(`
    SELECT
      CAST(strftime('%H', timestamp) AS INTEGER) as hour,
      COUNT(*) as count
    FROM messages
    WHERE is_from_user = 1
    GROUP BY hour
    ORDER BY count DESC
  `, []);

  // Get activity by day
  const dailyActivity = query<{
    day: number;
    count: number;
  }>(`
    SELECT
      CAST(strftime('%w', timestamp) AS INTEGER) as day,
      COUNT(*) as count
    FROM messages
    WHERE is_from_user = 1
    GROUP BY day
    ORDER BY count DESC
  `, []);

  // Peak hours (top 3)
  const peakHours = hourlyActivity.slice(0, 3).map(h => h.hour);

  // Preferred days (above average)
  const avgDailyCount = dailyActivity.reduce((a, b) => a + b.count, 0) / Math.max(dailyActivity.length, 1);
  const preferredDays = dailyActivity
    .filter(d => d.count > avgDailyCount)
    .map(d => d.day);

  // Infer focus pattern from context switching
  const contextSwitches = query<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM screen_captures
    WHERE timestamp > datetime('now', '-7 days')
  `, []);

  const screenCaptures = contextSwitches[0]?.count || 0;
  const avgSwitchesPerDay = screenCaptures / 7;

  let focusPattern: 'deep_focus' | 'multitasker' | 'balanced' = 'balanced';
  if (avgSwitchesPerDay < 50) focusPattern = 'deep_focus';
  else if (avgSwitchesPerDay > 150) focusPattern = 'multitasker';

  // Infer preferred load from open commitment count
  const commitmentLoad = query<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM commitments
    WHERE status = 'open'
  `, []);

  const openCommitments = commitmentLoad[0]?.count || 0;
  let preferredLoad: 'light' | 'moderate' | 'heavy' = 'moderate';
  if (openCommitments < 5) preferredLoad = 'light';
  else if (openCommitments > 15) preferredLoad = 'heavy';

  // Infer collaboration preference from meeting/multi-recipient patterns
  const collaborationStats = query<{
    total_threads: number;
    multi_recipient_threads: number;
  }>(`
    SELECT
      COUNT(DISTINCT thread_id) as total_threads,
      COUNT(DISTINCT CASE
        WHEN LENGTH(recipient_entity_ids) - LENGTH(REPLACE(recipient_entity_ids, ',', '')) > 0
        THEN thread_id
      END) as multi_recipient_threads
    FROM messages
    WHERE is_from_user = 1
      AND timestamp > datetime('now', '-30 days')
  `, []);

  const stats = collaborationStats[0] || { total_threads: 0, multi_recipient_threads: 0 };
  const multiRecipientRatio = stats.total_threads > 0
    ? stats.multi_recipient_threads / stats.total_threads
    : 0.5;

  let collaborationPreference: 'solo' | 'team' | 'mixed' = 'mixed';
  if (multiRecipientRatio < 0.2) collaborationPreference = 'solo';
  else if (multiRecipientRatio > 0.6) collaborationPreference = 'team';

  return {
    peakHours,
    preferredDays,
    focusPattern,
    preferredLoad,
    collaborationPreference,
  };
}

// ============================================================
// PATTERN STORAGE
// ============================================================

/**
 * Save a cognitive pattern
 */
export function savePattern(
  patternType: CognitivePatternType,
  name: string,
  description: string,
  indicators: PatternIndicator[],
  confidence: number
): string {
  const id = uuid();

  execute(`
    INSERT INTO cognitive_patterns (
      id, pattern_type, name, description, indicators,
      confidence, observation_count, last_observed, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [
    id,
    patternType,
    name,
    description,
    JSON.stringify(indicators),
    confidence,
  ]);

  return id;
}

/**
 * Update pattern with new observation
 */
export function observePattern(patternId: string): void {
  execute(`
    UPDATE cognitive_patterns
    SET observation_count = observation_count + 1,
        last_observed = CURRENT_TIMESTAMP,
        confidence = MIN(1.0, confidence + 0.01)
    WHERE id = ?
  `, [patternId]);
}

/**
 * Get patterns by type
 */
export function getPatternsByType(patternType: CognitivePatternType): CognitivePattern[] {
  const rows = query<{
    id: string;
    pattern_type: string;
    name: string;
    description: string;
    indicators: string;
    confidence: number;
    observation_count: number;
    last_observed: string;
    created_at: string;
  }>(`
    SELECT * FROM cognitive_patterns
    WHERE pattern_type = ?
    ORDER BY confidence DESC
  `, [patternType]);

  return rows.map(row => ({
    id: row.id,
    patternType: row.pattern_type as CognitivePatternType,
    name: row.name,
    description: row.description,
    indicators: JSON.parse(row.indicators),
    confidence: row.confidence,
    observationCount: row.observation_count,
    lastObserved: new Date(row.last_observed),
    createdAt: new Date(row.created_at),
  }));
}

// ============================================================
// COGNITIVE PROFILE
// ============================================================

/**
 * Build complete cognitive profile
 */
export function buildCognitiveProfile(): CognitiveProfile {
  const decisionStyle = inferDecisionStyle();
  const commStyle = inferCommunicationStyle();
  const workPrefs = inferWorkPreferences();

  return {
    decisionMaking: {
      speed: decisionStyle.speed,
      riskTolerance: decisionStyle.riskTolerance,
      preferredStyle: decisionStyle.speed === 'quick' ? 'intuitive' : 'analytical',
    },
    communication: {
      formality: commStyle.formality,
      length: commStyle.averageLength < 100 ? 'brief' : commStyle.averageLength > 500 ? 'detailed' : 'varies',
      responseSpeed: commStyle.responsePattern,
    },
    workStyle: {
      focusPattern: workPrefs.focusPattern,
      preferredLoad: workPrefs.preferredLoad,
      collaborationPreference: workPrefs.collaborationPreference,
    },
  };
}

/**
 * Get cognitive profile summary for LLM
 */
export function getCognitiveProfileForLlm(): string {
  const profile = buildCognitiveProfile();

  const lines = [
    'User Cognitive Profile:',
    '',
    'Decision Making:',
    `- Speed: ${profile.decisionMaking.speed}`,
    `- Risk tolerance: ${profile.decisionMaking.riskTolerance}`,
    `- Style: ${profile.decisionMaking.preferredStyle}`,
    '',
    'Communication:',
    `- Formality: ${profile.communication.formality}`,
    `- Message length: ${profile.communication.length}`,
    `- Response pattern: ${profile.communication.responseSpeed}`,
    '',
    'Work Style:',
    `- Focus: ${profile.workStyle.focusPattern}`,
    `- Collaboration: ${profile.workStyle.collaborationPreference}`,
  ];

  return lines.join('\n');
}
