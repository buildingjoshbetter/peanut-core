// Onboarding Analysis Orchestration
// Strategy Reference: "First impression magic"
//
// After initial data sync, runs comprehensive analysis to enable
// immediate personalization on first use.

import { query, execute } from '../db/connection';
import { analyzeUserStyle, analyzeRecipientStyle } from '../personality/extractor';
import { analyzeAllRecipients } from '../personality/mirror';
import { detectPatterns, savePattern, getPatterns } from '../behavioral/patterns';
import { buildRhythmMatrix, saveRhythms } from '../behavioral/rhythms';
import { runValueExtraction } from '../cognitive/values';
import { buildCognitiveProfile } from '../cognitive/patterns';

// ============================================================
// TYPES
// ============================================================

export interface OnboardingConfig {
  /** Run user style analysis */
  runStyleAnalysis: boolean;
  /** Run behavioral pattern detection */
  runPatternDetection: boolean;
  /** Run daily rhythm analysis */
  runRhythmAnalysis: boolean;
  /** Run value extraction */
  runValueExtraction: boolean;
  /** Run cognitive profile building */
  runCognitiveProfile: boolean;
  /** Minimum messages required before running (default: 50) */
  minimumMessages: number;
}

export interface OnboardingProgress {
  /** Current phase */
  phase: 'initializing' | 'style' | 'recipients' | 'patterns' | 'rhythms' | 'values' | 'cognitive' | 'complete';
  /** Percent complete (0-100) */
  percentComplete: number;
  /** Current task description */
  currentTask: string;
  /** Phase-specific details */
  details?: string;
}

export interface OnboardingResult {
  /** Whether onboarding completed successfully */
  success: boolean;
  /** Total time taken in milliseconds */
  durationMs: number;
  /** Results from each phase */
  phases: {
    style: { completed: boolean; interactionCount: number };
    recipients: { completed: boolean; recipientsAnalyzed: number };
    patterns: { completed: boolean; patternsDetected: number };
    rhythms: { completed: boolean };
    values: { completed: boolean; valuesExtracted: number; valuesUpdated: number };
    cognitive: { completed: boolean };
  };
  /** Any errors encountered */
  errors: string[];
}

export interface OnboardingStatus {
  /** Whether onboarding has been completed */
  completed: boolean;
  /** When onboarding was completed */
  completedAt: Date | null;
  /** Whether there's enough data to run onboarding */
  hasEnoughData: boolean;
  /** Current message count */
  messageCount: number;
  /** Minimum messages required */
  minimumRequired: number;
  /** Summary of what's been analyzed */
  summary: {
    userStyleSet: boolean;
    recipientStylesCount: number;
    patternsDetected: number;
    valuesExtracted: number;
  };
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

const DEFAULT_CONFIG: OnboardingConfig = {
  runStyleAnalysis: true,
  runPatternDetection: true,
  runRhythmAnalysis: true,
  runValueExtraction: true,
  runCognitiveProfile: true,
  minimumMessages: 50,
};

// ============================================================
// MAIN ORCHESTRATION
// ============================================================

/**
 * Run comprehensive onboarding analysis
 */
export async function runOnboardingAnalysis(
  config?: Partial<OnboardingConfig>,
  onProgress?: (progress: OnboardingProgress) => void
): Promise<OnboardingResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  const errors: string[] = [];

  const result: OnboardingResult = {
    success: false,
    durationMs: 0,
    phases: {
      style: { completed: false, interactionCount: 0 },
      recipients: { completed: false, recipientsAnalyzed: 0 },
      patterns: { completed: false, patternsDetected: 0 },
      rhythms: { completed: false },
      values: { completed: false, valuesExtracted: 0, valuesUpdated: 0 },
      cognitive: { completed: false },
    },
    errors: [],
  };

  // Check if we have enough data
  const messageCount = getMessageCount();
  if (messageCount < cfg.minimumMessages) {
    errors.push(`Not enough messages: ${messageCount}/${cfg.minimumMessages}`);
    result.errors = errors;
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Phase 1: User Style Analysis
  if (cfg.runStyleAnalysis) {
    onProgress?.({
      phase: 'style',
      percentComplete: 10,
      currentTask: 'Analyzing your communication style...',
    });

    try {
      const style = analyzeUserStyle();
      result.phases.style.completed = true;
      result.phases.style.interactionCount = style.interactionCount;
    } catch (error) {
      errors.push(`Style analysis failed: ${(error as Error).message}`);
    }
  }

  // Phase 2: Recipient Style Analysis
  if (cfg.runStyleAnalysis) {
    onProgress?.({
      phase: 'recipients',
      percentComplete: 25,
      currentTask: 'Learning how you communicate with different people...',
    });

    try {
      const count = analyzeAllRecipients();
      result.phases.recipients.completed = true;
      result.phases.recipients.recipientsAnalyzed = count;
    } catch (error) {
      errors.push(`Recipient analysis failed: ${(error as Error).message}`);
    }
  }

  // Phase 3: Pattern Detection
  if (cfg.runPatternDetection) {
    onProgress?.({
      phase: 'patterns',
      percentComplete: 45,
      currentTask: 'Detecting behavioral patterns...',
    });

    try {
      const events = getEventsForPatternDetection();
      const patterns = detectPatterns(events, { minOccurrences: 3, minConfidence: 0.5 });

      // Save new patterns
      let newPatterns = 0;
      for (const pattern of patterns) {
        const existing = getPatterns({ patternType: pattern.patternType, limit: 100 });
        const isDuplicate = existing.some(p => p.description === pattern.description);
        if (!isDuplicate) {
          savePattern(pattern);
          newPatterns++;
        }
      }

      result.phases.patterns.completed = true;
      result.phases.patterns.patternsDetected = newPatterns;
    } catch (error) {
      errors.push(`Pattern detection failed: ${(error as Error).message}`);
    }
  }

  // Phase 4: Rhythm Analysis
  if (cfg.runRhythmAnalysis) {
    onProgress?.({
      phase: 'rhythms',
      percentComplete: 60,
      currentTask: 'Building daily activity rhythms...',
    });

    try {
      const events = getEventsForRhythms();
      const matrix = buildRhythmMatrix(events);
      saveRhythms('default', matrix);
      result.phases.rhythms.completed = true;
    } catch (error) {
      errors.push(`Rhythm analysis failed: ${(error as Error).message}`);
    }
  }

  // Phase 5: Value Extraction
  if (cfg.runValueExtraction) {
    onProgress?.({
      phase: 'values',
      percentComplete: 75,
      currentTask: 'Understanding your values and priorities...',
    });

    try {
      const valueResult = runValueExtraction();
      result.phases.values.completed = true;
      result.phases.values.valuesExtracted = valueResult.newValuesFound;
      result.phases.values.valuesUpdated = valueResult.valuesUpdated;
    } catch (error) {
      errors.push(`Value extraction failed: ${(error as Error).message}`);
    }
  }

  // Phase 6: Cognitive Profile
  if (cfg.runCognitiveProfile) {
    onProgress?.({
      phase: 'cognitive',
      percentComplete: 90,
      currentTask: 'Building cognitive profile...',
    });

    try {
      buildCognitiveProfile();
      result.phases.cognitive.completed = true;
    } catch (error) {
      errors.push(`Cognitive profile failed: ${(error as Error).message}`);
    }
  }

  // Mark onboarding as complete
  markOnboardingComplete();

  onProgress?.({
    phase: 'complete',
    percentComplete: 100,
    currentTask: 'Onboarding complete!',
  });

  result.success = errors.length === 0;
  result.errors = errors;
  result.durationMs = Date.now() - startTime;

  return result;
}

/**
 * Check if onboarding is complete
 */
export function isOnboardingComplete(): boolean {
  const status = getOnboardingStatus();
  return status.completed;
}

/**
 * Get detailed onboarding status
 */
export function getOnboardingStatus(): OnboardingStatus {
  const messageCount = getMessageCount();
  const minimumRequired = DEFAULT_CONFIG.minimumMessages;

  // Check if onboarding marker exists
  const marker = query<{ completed_at: string }>(`
    SELECT completed_at FROM onboarding_status WHERE id = 'default' LIMIT 1
  `, []);

  // Get summary stats
  const userStyle = query<{ interaction_count: number }>(`
    SELECT interaction_count FROM user_style WHERE id = 'default'
  `, []);

  const recipientCount = query<{ count: number }>(`
    SELECT COUNT(*) as count FROM recipient_styles
  `, []);

  const patternCount = query<{ count: number }>(`
    SELECT COUNT(*) as count FROM behavioral_patterns
  `, []);

  const valueCount = query<{ count: number }>(`
    SELECT COUNT(*) as count FROM user_values
  `, []);

  return {
    completed: marker.length > 0,
    completedAt: marker.length > 0 ? new Date(marker[0]!.completed_at) : null,
    hasEnoughData: messageCount >= minimumRequired,
    messageCount,
    minimumRequired,
    summary: {
      userStyleSet: (userStyle[0]?.interaction_count ?? 0) > 0,
      recipientStylesCount: recipientCount[0]?.count ?? 0,
      patternsDetected: patternCount[0]?.count ?? 0,
      valuesExtracted: valueCount[0]?.count ?? 0,
    },
  };
}

// ============================================================
// HELPERS
// ============================================================

function getMessageCount(): number {
  const result = query<{ count: number }>('SELECT COUNT(*) as count FROM messages', []);
  return result[0]?.count ?? 0;
}

function getEventsForPatternDetection(): Array<{
  timestamp: Date;
  eventType: string;
  contextType?: string;
  activityCategory?: string;
}> {
  const rows = query<{
    event_type: string;
    timestamp: string;
    context_type: string | null;
  }>(`
    SELECT event_type, timestamp, context_type
    FROM events
    ORDER BY timestamp ASC
    LIMIT 1000
  `, []);

  return rows.map(row => ({
    timestamp: new Date(row.timestamp),
    eventType: row.event_type,
    contextType: row.context_type || undefined,
    activityCategory: row.event_type.startsWith('MESSAGE_') ? 'communication' : undefined,
  }));
}

function getEventsForRhythms(): Array<{
  timestamp: Date;
  activityType: string;
  contextType?: string;
}> {
  // Get last 30 days of events
  const rows = query<{
    event_type: string;
    timestamp: string;
    context_type: string | null;
  }>(`
    SELECT event_type, timestamp, context_type
    FROM events
    WHERE timestamp > datetime('now', '-30 days')
    ORDER BY timestamp ASC
  `, []);

  return rows.map(row => ({
    timestamp: new Date(row.timestamp),
    activityType: row.event_type.startsWith('MESSAGE_') ? 'communication' : 'other',
    contextType: row.context_type || undefined,
  }));
}

function markOnboardingComplete(): void {
  execute(`
    INSERT OR REPLACE INTO onboarding_status (id, completed_at)
    VALUES ('default', CURRENT_TIMESTAMP)
  `, []);
}

/**
 * Reset onboarding status (for re-running)
 */
export function resetOnboarding(): void {
  execute('DELETE FROM onboarding_status WHERE id = ?', ['default']);
}

/**
 * Ensure onboarding_status table exists
 */
export function ensureOnboardingTable(): void {
  execute(`
    CREATE TABLE IF NOT EXISTS onboarding_status (
      id TEXT PRIMARY KEY,
      completed_at DATETIME NOT NULL
    )
  `, []);
}
