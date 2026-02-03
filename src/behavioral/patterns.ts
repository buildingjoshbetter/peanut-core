// Behavioral Pattern Detection
// Strategy Reference: Part 5
//
// Detects habits, routines, and trigger-response patterns from event data.

import { v4 as uuid } from 'uuid';
import { query, execute } from '../db/connection';
import type { BehavioralPattern, PatternType } from '../types';

// ============================================================
// TYPES
// ============================================================

export interface EventData {
  timestamp: Date;
  eventType: string;
  appId?: string;
  windowTitle?: string;
  contextType?: string;
  activityCategory?: string;
}

export interface PatternCandidate {
  patternType: PatternType;
  description: string;
  occurrences: Date[];
  confidence: number;
  timeSignature?: {
    hourOfDay?: number;
    dayOfWeek?: number;
    intervalMinutes?: number;
  };
}

export interface SequencePattern {
  sequence: string[];
  frequency: number;
  avgGapMinutes: number;
  confidence: number;
}

// ============================================================
// PATTERN DETECTION
// ============================================================

/**
 * Detect all behavioral patterns from recent events
 */
export function detectPatterns(
  events: EventData[],
  options?: {
    minOccurrences?: number;
    minConfidence?: number;
  }
): PatternCandidate[] {
  const minOccurrences = options?.minOccurrences ?? 3;
  const minConfidence = options?.minConfidence ?? 0.5;

  const patterns: PatternCandidate[] = [];

  // 1. Time-based habits (same time each day)
  patterns.push(...detectTimeBasedHabits(events, minOccurrences));

  // 2. Sequence patterns (A -> B -> C)
  patterns.push(...detectSequencePatterns(events, minOccurrences));

  // 3. Day-of-week routines
  patterns.push(...detectDayOfWeekPatterns(events, minOccurrences));

  // 4. Trigger-response patterns
  patterns.push(...detectTriggerResponsePatterns(events, minOccurrences));

  // Filter by confidence
  return patterns.filter(p => p.confidence >= minConfidence);
}

/**
 * Detect time-based habits (e.g., "checks email at 9am")
 */
function detectTimeBasedHabits(events: EventData[], minOccurrences: number): PatternCandidate[] {
  const patterns: PatternCandidate[] = [];

  // Group events by type and hour
  const hourlyGroups = new Map<string, { hour: number; dates: Date[] }>();

  for (const event of events) {
    const hour = event.timestamp.getHours();
    const key = `${event.eventType}:${event.activityCategory || 'unknown'}:${hour}`;

    if (!hourlyGroups.has(key)) {
      hourlyGroups.set(key, { hour, dates: [] });
    }
    hourlyGroups.get(key)!.dates.push(event.timestamp);
  }

  // Find patterns with enough occurrences
  for (const [key, data] of hourlyGroups) {
    if (data.dates.length >= minOccurrences) {
      const [eventType, category] = key.split(':');

      // Check consistency (are these on different days?)
      const uniqueDays = new Set(data.dates.map(d =>
        `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      ));

      if (uniqueDays.size >= minOccurrences) {
        const confidence = Math.min(1, uniqueDays.size / 10);

        patterns.push({
          patternType: 'habit',
          description: `${category} (${eventType}) around ${formatHour(data.hour)}`,
          occurrences: data.dates,
          confidence,
          timeSignature: {
            hourOfDay: data.hour,
          },
        });
      }
    }
  }

  return patterns;
}

/**
 * Detect sequence patterns (e.g., "coffee -> email -> standup")
 */
function detectSequencePatterns(events: EventData[], minOccurrences: number): PatternCandidate[] {
  const patterns: PatternCandidate[] = [];

  // Sort events by time
  const sorted = [...events].sort((a, b) =>
    a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Look for 2-event and 3-event sequences
  const sequenceCounts = new Map<string, { count: number; gaps: number[]; timestamps: Date[] }>();

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1]!;

    // Only consider events within 30 minutes
    const gapMinutes = (next.timestamp.getTime() - current.timestamp.getTime()) / 60000;
    if (gapMinutes > 30 || gapMinutes < 1) continue;

    const key = `${current.activityCategory || current.eventType}->${next.activityCategory || next.eventType}`;

    if (!sequenceCounts.has(key)) {
      sequenceCounts.set(key, { count: 0, gaps: [], timestamps: [] });
    }
    const data = sequenceCounts.get(key)!;
    data.count++;
    data.gaps.push(gapMinutes);
    data.timestamps.push(current.timestamp);
  }

  // Convert to patterns
  for (const [key, data] of sequenceCounts) {
    if (data.count >= minOccurrences) {
      const avgGap = data.gaps.reduce((a, b) => a + b, 0) / data.gaps.length;
      const confidence = Math.min(1, data.count / 10);

      patterns.push({
        patternType: 'routine',
        description: `Sequence: ${key.replace('->', ' → ')}`,
        occurrences: data.timestamps,
        confidence,
        timeSignature: {
          intervalMinutes: Math.round(avgGap),
        },
      });
    }
  }

  return patterns;
}

/**
 * Detect day-of-week patterns (e.g., "team standup on Mondays")
 */
function detectDayOfWeekPatterns(events: EventData[], minOccurrences: number): PatternCandidate[] {
  const patterns: PatternCandidate[] = [];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Group by day and activity
  const dayGroups = new Map<string, Date[]>();

  for (const event of events) {
    const day = event.timestamp.getDay();
    const key = `${event.activityCategory || event.eventType}:${day}`;

    if (!dayGroups.has(key)) {
      dayGroups.set(key, []);
    }
    dayGroups.get(key)!.push(event.timestamp);
  }

  for (const [key, dates] of dayGroups) {
    if (dates.length >= minOccurrences) {
      const [activity, dayStr] = key.split(':');
      const day = parseInt(dayStr!, 10);

      // Check for different weeks
      const uniqueWeeks = new Set(dates.map(d => {
        const weekStart = new Date(d);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        return weekStart.toISOString().slice(0, 10);
      }));

      if (uniqueWeeks.size >= minOccurrences) {
        const confidence = Math.min(1, uniqueWeeks.size / 8);

        patterns.push({
          patternType: 'rhythm',
          description: `${activity} on ${dayNames[day]}s`,
          occurrences: dates,
          confidence,
          timeSignature: {
            dayOfWeek: day,
          },
        });
      }
    }
  }

  return patterns;
}

/**
 * Detect trigger-response patterns (e.g., "notification -> app switch")
 */
function detectTriggerResponsePatterns(events: EventData[], minOccurrences: number): PatternCandidate[] {
  const patterns: PatternCandidate[] = [];

  // Look for specific trigger types
  const triggers = ['notification', 'email_received', 'message_received', 'meeting_reminder'];

  const sorted = [...events].sort((a, b) =>
    a.timestamp.getTime() - b.timestamp.getTime()
  );

  const triggerResponses = new Map<string, { count: number; timestamps: Date[] }>();

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1]!;

    // Is current a trigger?
    if (triggers.includes(current.eventType)) {
      const gapSeconds = (next.timestamp.getTime() - current.timestamp.getTime()) / 1000;

      // Response within 60 seconds
      if (gapSeconds > 0 && gapSeconds < 60) {
        const key = `${current.eventType}:${next.activityCategory || next.eventType}`;
        if (!triggerResponses.has(key)) {
          triggerResponses.set(key, { count: 0, timestamps: [] });
        }
        const data = triggerResponses.get(key)!;
        data.count++;
        data.timestamps.push(current.timestamp);
      }
    }
  }

  for (const [key, data] of triggerResponses) {
    if (data.count >= minOccurrences) {
      const [trigger, response] = key.split(':');
      const confidence = Math.min(1, data.count / 10);

      patterns.push({
        patternType: 'trigger_response',
        description: `${trigger} triggers ${response}`,
        occurrences: data.timestamps,
        confidence,
      });
    }
  }

  return patterns;
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

/**
 * Save a detected pattern to the database
 */
export function savePattern(pattern: PatternCandidate): string {
  const id = uuid();
  const now = new Date();

  execute(`
    INSERT INTO behavioral_patterns (
      id, pattern_type, description, detected_at,
      time_signature, occurrence_times, habit_strength,
      observation_count, confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    pattern.patternType,
    pattern.description,
    now.toISOString(),
    pattern.timeSignature ? JSON.stringify(pattern.timeSignature) : null,
    JSON.stringify(pattern.occurrences.map(d => d.toISOString())),
    pattern.confidence,  // Use confidence as initial habit strength
    pattern.occurrences.length,
    pattern.confidence,
  ]);

  return id;
}

/**
 * Get all patterns from database
 */
export function getPatterns(options?: {
  patternType?: PatternType;
  minConfidence?: number;
  limit?: number;
}): BehavioralPattern[] {
  let sql = 'SELECT * FROM behavioral_patterns WHERE 1=1';
  const params: unknown[] = [];

  if (options?.patternType) {
    sql += ' AND pattern_type = ?';
    params.push(options.patternType);
  }

  if (options?.minConfidence) {
    sql += ' AND confidence >= ?';
    params.push(options.minConfidence);
  }

  sql += ' ORDER BY confidence DESC, detected_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = query<{
    id: string;
    pattern_type: string;
    description: string;
    detected_at: string;
    time_signature: string | null;
    occurrence_times: string | null;
    habit_strength: number;
    observation_count: number;
    last_observed: string | null;
    next_predicted: string | null;
    confidence: number;
  }>(sql, params);

  return rows.map(row => ({
    id: row.id,
    patternType: row.pattern_type as PatternType,
    description: row.description || undefined,
    detectedAt: new Date(row.detected_at),
    timeSignature: row.time_signature ? JSON.parse(row.time_signature) : undefined,
    occurrenceTimes: row.occurrence_times ? JSON.parse(row.occurrence_times) : undefined,
    habitStrength: row.habit_strength,
    observationCount: row.observation_count,
    lastObserved: row.last_observed ? new Date(row.last_observed) : undefined,
    nextPredicted: row.next_predicted ? new Date(row.next_predicted) : undefined,
    confidence: row.confidence,
  }));
}

/**
 * Update pattern with new observation
 */
export function recordPatternObservation(patternId: string): void {
  execute(`
    UPDATE behavioral_patterns
    SET
      observation_count = observation_count + 1,
      last_observed = CURRENT_TIMESTAMP,
      habit_strength = MIN(1.0, habit_strength + 0.05),
      confidence = MIN(1.0, confidence + 0.02)
    WHERE id = ?
  `, [patternId]);
}

/**
 * Decay pattern strength over time (call periodically)
 */
export function decayPatternStrength(decayFactor: number = 0.99): void {
  execute(`
    UPDATE behavioral_patterns
    SET habit_strength = habit_strength * ?
    WHERE habit_strength > 0.01
  `, [decayFactor]);
}

/**
 * Delete weak patterns
 */
export function pruneWeakPatterns(minStrength: number = 0.1): number {
  const result = execute(`
    DELETE FROM behavioral_patterns
    WHERE habit_strength < ?
  `, [minStrength]);

  return result.changes;
}

// ============================================================
// HELPERS
// ============================================================

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

/**
 * Calculate habit strength based on consistency
 */
export function calculateHabitStrength(
  occurrences: Date[],
  expectedInterval: 'daily' | 'weekly' | 'monthly'
): number {
  if (occurrences.length < 2) return 0;

  const sorted = [...occurrences].sort((a, b) => a.getTime() - b.getTime());

  // Calculate gaps
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i]!.getTime() - sorted[i - 1]!.getTime());
  }

  // Expected gap in ms
  const expectedGap = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  }[expectedInterval];

  // Calculate consistency (how close to expected)
  let consistencySum = 0;
  for (const gap of gaps) {
    const deviation = Math.abs(gap - expectedGap) / expectedGap;
    const consistency = Math.max(0, 1 - deviation);
    consistencySum += consistency;
  }

  return consistencySum / gaps.length;
}
