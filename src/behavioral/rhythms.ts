// Daily Rhythm Analysis
// Strategy Reference: Part 5
//
// Builds hour-by-day activity matrices and infers energy levels.

import { query, execute } from '../db/connection';
import type { DailyRhythm } from '../types';

// ============================================================
// TYPES
// ============================================================

export interface ActivityEvent {
  timestamp: Date;
  activityType: string;  // 'email', 'coding', 'meeting', 'browsing', etc.
  contextType?: string;  // 'work', 'personal', etc.
  responseTimeMs?: number;  // If applicable
  focusScore?: number;  // 0-1
}

export interface RhythmMatrix {
  /** [dayOfWeek][hour] -> activity distribution */
  distribution: Record<number, Record<number, Record<string, number>>>;
  /** [dayOfWeek][hour] -> average focus score */
  focusScores: Record<number, Record<number, number>>;
  /** [dayOfWeek][hour] -> average energy level (inferred) */
  energyLevels: Record<number, Record<number, number>>;
  /** [dayOfWeek][hour] -> message count */
  messageVolumes: Record<number, Record<number, number>>;
}

export interface TimeSlotProfile {
  dayOfWeek: number;
  hour: number;
  topActivities: Array<{ activity: string; percentage: number }>;
  avgFocusScore: number;
  avgEnergyLevel: number;
  avgMessageVolume: number;
  typicalContext: string;
  isBestFor: string[];  // ['deep_work', 'meetings', 'email']
}

// ============================================================
// RHYTHM BUILDING
// ============================================================

/**
 * Build rhythm matrix from activity events
 */
export function buildRhythmMatrix(events: ActivityEvent[]): RhythmMatrix {
  const distribution: RhythmMatrix['distribution'] = {};
  const focusScores: RhythmMatrix['focusScores'] = {};
  const energyLevels: RhythmMatrix['energyLevels'] = {};
  const messageVolumes: RhythmMatrix['messageVolumes'] = {};

  // Initialize all slots
  for (let day = 0; day < 7; day++) {
    distribution[day] = {};
    focusScores[day] = {};
    energyLevels[day] = {};
    messageVolumes[day] = {};

    for (let hour = 0; hour < 24; hour++) {
      distribution[day]![hour] = {};
      focusScores[day]![hour] = 0;
      energyLevels[day]![hour] = 0.5;  // Default neutral
      messageVolumes[day]![hour] = 0;
    }
  }

  // Aggregate events
  const slotData = new Map<string, {
    activities: Record<string, number>;
    focusScores: number[];
    responseTimes: number[];
    messageCount: number;
    contexts: Record<string, number>;
  }>();

  for (const event of events) {
    const day = event.timestamp.getDay();
    const hour = event.timestamp.getHours();
    const key = `${day}:${hour}`;

    if (!slotData.has(key)) {
      slotData.set(key, {
        activities: {},
        focusScores: [],
        responseTimes: [],
        messageCount: 0,
        contexts: {},
      });
    }

    const data = slotData.get(key)!;

    // Count activity
    data.activities[event.activityType] = (data.activities[event.activityType] || 0) + 1;

    // Track focus
    if (event.focusScore !== undefined) {
      data.focusScores.push(event.focusScore);
    }

    // Track response time (for energy inference)
    if (event.responseTimeMs !== undefined) {
      data.responseTimes.push(event.responseTimeMs);
    }

    // Count messages
    if (event.activityType === 'email' || event.activityType === 'message') {
      data.messageCount++;
    }

    // Track context
    if (event.contextType) {
      data.contexts[event.contextType] = (data.contexts[event.contextType] || 0) + 1;
    }
  }

  // Convert to matrix
  for (const [key, data] of slotData) {
    const [dayStr, hourStr] = key.split(':');
    const day = parseInt(dayStr!, 10);
    const hour = parseInt(hourStr!, 10);

    // Normalize activity distribution
    const totalActivities = Object.values(data.activities).reduce((a, b) => a + b, 0);
    for (const [activity, count] of Object.entries(data.activities)) {
      distribution[day]![hour]![activity] = count / totalActivities;
    }

    // Average focus score
    if (data.focusScores.length > 0) {
      focusScores[day]![hour] = data.focusScores.reduce((a, b) => a + b, 0) / data.focusScores.length;
    }

    // Infer energy from response times (faster = higher energy)
    if (data.responseTimes.length > 0) {
      const avgResponseTime = data.responseTimes.reduce((a, b) => a + b, 0) / data.responseTimes.length;
      // Normalize: <1min = high energy (1.0), >10min = low energy (0.0)
      energyLevels[day]![hour] = Math.max(0, Math.min(1, 1 - (avgResponseTime / 600000)));
    }

    // Message volume
    messageVolumes[day]![hour] = data.messageCount;
  }

  return { distribution, focusScores, energyLevels, messageVolumes };
}

/**
 * Get profile for a specific time slot
 */
export function getTimeSlotProfile(
  matrix: RhythmMatrix,
  dayOfWeek: number,
  hour: number
): TimeSlotProfile {
  const activities = matrix.distribution[dayOfWeek]?.[hour] || {};
  const focusScore = matrix.focusScores[dayOfWeek]?.[hour] || 0.5;
  const energyLevel = matrix.energyLevels[dayOfWeek]?.[hour] || 0.5;
  const messageVolume = matrix.messageVolumes[dayOfWeek]?.[hour] || 0;

  // Sort activities by percentage
  const topActivities = Object.entries(activities)
    .map(([activity, percentage]) => ({ activity, percentage }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5);

  // Determine typical context
  const typicalContext = determineTypicalContext(topActivities);

  // Determine best uses for this time slot
  const isBestFor = determineBestUses(focusScore, energyLevel, topActivities);

  return {
    dayOfWeek,
    hour,
    topActivities,
    avgFocusScore: focusScore,
    avgEnergyLevel: energyLevel,
    avgMessageVolume: messageVolume,
    typicalContext,
    isBestFor,
  };
}

/**
 * Determine typical context from activities
 */
function determineTypicalContext(activities: Array<{ activity: string; percentage: number }>): string {
  const workActivities = ['coding', 'email', 'meeting', 'document', 'slack'];
  const personalActivities = ['browsing', 'social', 'entertainment', 'shopping'];

  let workScore = 0;
  let personalScore = 0;

  for (const { activity, percentage } of activities) {
    if (workActivities.includes(activity)) {
      workScore += percentage;
    } else if (personalActivities.includes(activity)) {
      personalScore += percentage;
    }
  }

  if (workScore > personalScore * 2) return 'work';
  if (personalScore > workScore * 2) return 'personal';
  return 'mixed';
}

/**
 * Determine best uses for a time slot
 */
function determineBestUses(
  focusScore: number,
  energyLevel: number,
  activities: Array<{ activity: string; percentage: number }>
): string[] {
  const uses: string[] = [];

  // High focus + high energy = deep work
  if (focusScore > 0.7 && energyLevel > 0.7) {
    uses.push('deep_work');
  }

  // High energy = meetings
  if (energyLevel > 0.6) {
    uses.push('meetings');
  }

  // Medium energy = email/admin
  if (energyLevel >= 0.4 && energyLevel <= 0.7) {
    uses.push('email');
    uses.push('admin');
  }

  // Low energy = low-stakes tasks
  if (energyLevel < 0.4) {
    uses.push('review');
    uses.push('reading');
  }

  // Based on historical activity
  const topActivity = activities[0]?.activity;
  if (topActivity && !uses.includes(topActivity)) {
    uses.push(topActivity);
  }

  return uses;
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

/**
 * Save daily rhythms to database
 */
export function saveRhythms(userId: string, matrix: RhythmMatrix): void {
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const activities = matrix.distribution[day]?.[hour] || {};
      const focusScore = matrix.focusScores[day]?.[hour];
      const energyLevel = matrix.energyLevels[day]?.[hour];
      const messageVolume = matrix.messageVolumes[day]?.[hour];

      // Determine typical context
      const profile = getTimeSlotProfile(matrix, day, hour);

      execute(`
        INSERT OR REPLACE INTO daily_rhythms (
          user_id, day_of_week, hour,
          activity_distribution, focus_score_avg, energy_level_avg,
          response_time_avg, message_volume, typical_context
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        day,
        hour,
        JSON.stringify(activities),
        focusScore,
        energyLevel,
        null,  // response_time_avg calculated separately
        messageVolume,
        profile.typicalContext,
      ]);
    }
  }
}

/**
 * Load rhythms from database
 */
export function loadRhythms(userId: string): DailyRhythm[] {
  const rows = query<{
    user_id: string;
    day_of_week: number;
    hour: number;
    activity_distribution: string | null;
    focus_score_avg: number | null;
    energy_level_avg: number | null;
    response_time_avg: number | null;
    message_volume: number | null;
    typical_context: string | null;
  }>(`
    SELECT * FROM daily_rhythms
    WHERE user_id = ?
    ORDER BY day_of_week, hour
  `, [userId]);

  return rows.map(row => ({
    userId: row.user_id,
    dayOfWeek: row.day_of_week,
    hour: row.hour,
    activityDistribution: row.activity_distribution ? JSON.parse(row.activity_distribution) : {},
    focusScoreAvg: row.focus_score_avg ?? undefined,
    energyLevelAvg: row.energy_level_avg ?? undefined,
    responseTimeAvg: row.response_time_avg ?? undefined,
    messageVolume: row.message_volume ?? undefined,
    typicalContext: row.typical_context ?? undefined,
  }));
}

/**
 * Get current time slot rhythm
 */
export function getCurrentRhythm(userId: string): DailyRhythm | null {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  const rows = query<{
    user_id: string;
    day_of_week: number;
    hour: number;
    activity_distribution: string | null;
    focus_score_avg: number | null;
    energy_level_avg: number | null;
    response_time_avg: number | null;
    message_volume: number | null;
    typical_context: string | null;
  }>(`
    SELECT * FROM daily_rhythms
    WHERE user_id = ? AND day_of_week = ? AND hour = ?
  `, [userId, day, hour]);

  if (rows.length === 0) return null;

  const row = rows[0]!;
  return {
    userId: row.user_id,
    dayOfWeek: row.day_of_week,
    hour: row.hour,
    activityDistribution: row.activity_distribution ? JSON.parse(row.activity_distribution) : {},
    focusScoreAvg: row.focus_score_avg ?? undefined,
    energyLevelAvg: row.energy_level_avg ?? undefined,
    responseTimeAvg: row.response_time_avg ?? undefined,
    messageVolume: row.message_volume ?? undefined,
    typicalContext: row.typical_context ?? undefined,
  };
}

/**
 * Get best time slots for a specific activity
 */
export function getBestTimeSlotsFor(
  userId: string,
  activity: 'deep_work' | 'meetings' | 'email' | 'creative',
  limit: number = 5
): Array<{ dayOfWeek: number; hour: number; score: number }> {
  const rhythms = loadRhythms(userId);
  const scored: Array<{ dayOfWeek: number; hour: number; score: number }> = [];

  for (const rhythm of rhythms) {
    let score = 0;

    switch (activity) {
      case 'deep_work':
        score = (rhythm.focusScoreAvg || 0.5) * (rhythm.energyLevelAvg || 0.5);
        break;
      case 'meetings':
        score = rhythm.energyLevelAvg || 0.5;
        break;
      case 'email':
        // Prefer times with historical email activity
        const emailPct = rhythm.activityDistribution['email'] || 0;
        score = emailPct * 0.5 + (rhythm.energyLevelAvg || 0.5) * 0.5;
        break;
      case 'creative':
        // High focus, moderate energy
        const focus = rhythm.focusScoreAvg || 0.5;
        const energy = rhythm.energyLevelAvg || 0.5;
        score = focus * 0.7 + (energy > 0.4 && energy < 0.8 ? 0.3 : 0);
        break;
    }

    scored.push({
      dayOfWeek: rhythm.dayOfWeek,
      hour: rhythm.hour,
      score,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Infer energy level from response patterns
 */
export function inferEnergyFromResponses(
  responseTimes: number[],
  messageLengths: number[]
): number {
  if (responseTimes.length === 0) return 0.5;

  // Fast responses = high energy
  const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const responseScore = Math.max(0, 1 - avgResponseTime / 600000);  // 10min baseline

  // Longer messages = higher engagement/energy
  let lengthScore = 0.5;
  if (messageLengths.length > 0) {
    const avgLength = messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length;
    lengthScore = Math.min(1, avgLength / 500);  // 500 chars baseline
  }

  return responseScore * 0.6 + lengthScore * 0.4;
}
