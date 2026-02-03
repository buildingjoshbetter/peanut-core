// Background Processing Worker
// Strategy Reference: Event Log as Spine
//
// Continuously processes data to keep the knowledge graph current.
// - Processes unprocessed messages → events
// - Updates behavioral patterns
// - Updates daily rhythms
// - Generates predictions

import { v4 as uuid } from 'uuid';
import { execute, query } from '../db/connection';
import { detectPatterns, savePattern, recordPatternObservation, getPatterns } from '../behavioral/patterns';
import { buildRhythmMatrix, saveRhythms } from '../behavioral/rhythms';
import { generatePredictions, getPendingPredictions, savePrediction } from '../behavioral/predictions';

// ============================================================
// TYPES
// ============================================================

export interface WorkerConfig {
  /** Processing interval in milliseconds (default: 30000 = 30 seconds) */
  processingIntervalMs: number;
  /** Number of items to process per cycle (default: 50) */
  batchSize: number;
  /** Enable pattern detection (default: true) */
  enablePatternDetection: boolean;
  /** Enable rhythm updates (default: true) */
  enableRhythmUpdates: boolean;
  /** Enable prediction generation (default: true) */
  enablePredictions: boolean;
}

export interface WorkerStatus {
  running: boolean;
  lastCycleAt: Date | null;
  cycleCount: number;
  errorsInLastCycle: number;
  messagesProcessed: number;
  eventsCreated: number;
  patternsDetected: number;
}

export interface ProcessingResult {
  messagesProcessed: number;
  eventsCreated: number;
  patternsDetected: number;
  rhythmsUpdated: boolean;
  predictionsGenerated: number;
  errors: string[];
}

// ============================================================
// WORKER STATE
// ============================================================

const DEFAULT_CONFIG: WorkerConfig = {
  processingIntervalMs: 30000,
  batchSize: 50,
  enablePatternDetection: true,
  enableRhythmUpdates: true,
  enablePredictions: true,
};

let workerConfig: WorkerConfig = { ...DEFAULT_CONFIG };
let workerInterval: ReturnType<typeof setInterval> | null = null;
let workerStatus: WorkerStatus = {
  running: false,
  lastCycleAt: null,
  cycleCount: 0,
  errorsInLastCycle: 0,
  messagesProcessed: 0,
  eventsCreated: 0,
  patternsDetected: 0,
};

// ============================================================
// WORKER CONTROL
// ============================================================

/**
 * Start the background processing worker
 */
export function startProcessingWorker(config?: Partial<WorkerConfig>): void {
  if (workerInterval) {
    console.log('[Worker] Already running');
    return;
  }

  workerConfig = { ...DEFAULT_CONFIG, ...config };
  workerStatus.running = true;

  console.log(`[Worker] Starting with ${workerConfig.processingIntervalMs}ms interval`);

  // Run immediately on start
  triggerProcessingCycle().catch(err => {
    console.error('[Worker] Error in initial cycle:', err);
  });

  // Then run on interval
  workerInterval = setInterval(() => {
    triggerProcessingCycle().catch(err => {
      console.error('[Worker] Error in cycle:', err);
    });
  }, workerConfig.processingIntervalMs);
}

/**
 * Stop the background processing worker
 */
export function stopProcessingWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  workerStatus.running = false;
  console.log('[Worker] Stopped');
}

/**
 * Get current worker status
 */
export function getWorkerStatus(): WorkerStatus {
  return { ...workerStatus };
}

/**
 * Manually trigger a processing cycle
 */
export async function triggerProcessingCycle(): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    messagesProcessed: 0,
    eventsCreated: 0,
    patternsDetected: 0,
    rhythmsUpdated: false,
    predictionsGenerated: 0,
    errors: [],
  };

  try {
    // 1. Process unprocessed messages → create events
    const messageResult = await processUnprocessedMessages(workerConfig.batchSize);
    result.messagesProcessed = messageResult.processed;
    result.eventsCreated = messageResult.eventsCreated;
    if (messageResult.errors.length > 0) {
      result.errors.push(...messageResult.errors);
    }

    // 2. Process unprocessed events → detect patterns
    if (workerConfig.enablePatternDetection) {
      const patternResult = await processEventsForPatterns();
      result.patternsDetected = patternResult.patternsDetected;
    }

    // 3. Update daily rhythms
    if (workerConfig.enableRhythmUpdates) {
      await updateDailyRhythms();
      result.rhythmsUpdated = true;
    }

    // 4. Generate predictions
    if (workerConfig.enablePredictions) {
      const predResult = await generateNewPredictions();
      result.predictionsGenerated = predResult.generated;
    }

    // Update status
    workerStatus.lastCycleAt = new Date();
    workerStatus.cycleCount++;
    workerStatus.errorsInLastCycle = result.errors.length;
    workerStatus.messagesProcessed += result.messagesProcessed;
    workerStatus.eventsCreated += result.eventsCreated;
    workerStatus.patternsDetected += result.patternsDetected;

  } catch (error) {
    const err = error as Error;
    result.errors.push(err.message);
    workerStatus.errorsInLastCycle = 1;
  }

  return result;
}

// ============================================================
// PROCESSING FUNCTIONS
// ============================================================

/**
 * Process unprocessed messages and create events
 */
async function processUnprocessedMessages(batchSize: number): Promise<{
  processed: number;
  eventsCreated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processed = 0;
  let eventsCreated = 0;

  // Get unprocessed messages
  const messages = query<{
    id: string;
    source_type: string;
    thread_id: string | null;
    sender_entity_id: string | null;
    recipient_entity_ids: string;
    subject: string | null;
    timestamp: string;
    is_from_user: number;
    context_type: string | null;
  }>(`
    SELECT id, source_type, thread_id, sender_entity_id, recipient_entity_ids,
           subject, timestamp, is_from_user, context_type
    FROM messages
    WHERE processed = 0
    ORDER BY timestamp ASC
    LIMIT ?
  `, [batchSize]);

  for (const msg of messages) {
    try {
      // Determine event type
      const eventType = msg.is_from_user ? 'MESSAGE_SENT' : 'MESSAGE_RECEIVED';

      // Parse recipient entity IDs
      let entityIds: string[] = [];
      try {
        entityIds = JSON.parse(msg.recipient_entity_ids || '[]');
      } catch {
        entityIds = [];
      }
      if (msg.sender_entity_id) {
        entityIds.push(msg.sender_entity_id);
      }

      // Detect context type if not set
      const contextType = msg.context_type || detectContextType(msg.subject || '');

      // Create event
      const eventId = uuid();
      execute(`
        INSERT INTO events (
          id, event_type, timestamp, payload, context_type, entities, processed
        ) VALUES (?, ?, ?, ?, ?, ?, 0)
      `, [
        eventId,
        eventType,
        msg.timestamp,
        JSON.stringify({
          messageId: msg.id,
          sourceType: msg.source_type,
          threadId: msg.thread_id,
          subject: msg.subject,
        }),
        contextType,
        JSON.stringify(entityIds),
      ]);

      eventsCreated++;

      // Mark message as processed
      execute('UPDATE messages SET processed = 1 WHERE id = ?', [msg.id]);
      processed++;

    } catch (error) {
      const err = error as Error;
      errors.push(`Message ${msg.id}: ${err.message}`);
    }
  }

  return { processed, eventsCreated, errors };
}

/**
 * Process events and detect behavioral patterns
 */
async function processEventsForPatterns(): Promise<{ patternsDetected: number }> {
  // Get recent unprocessed events
  const events = query<{
    id: string;
    event_type: string;
    timestamp: string;
    payload: string;
    context_type: string | null;
  }>(`
    SELECT id, event_type, timestamp, payload, context_type
    FROM events
    WHERE processed = 0
    ORDER BY timestamp ASC
    LIMIT 200
  `, []);

  if (events.length < 10) {
    // Not enough data for pattern detection
    return { patternsDetected: 0 };
  }

  // Convert to EventData format
  const eventData = events.map(e => {
    let payload: { appId?: string; windowTitle?: string } = {};
    try {
      payload = JSON.parse(e.payload);
    } catch {
      payload = {};
    }

    return {
      timestamp: new Date(e.timestamp),
      eventType: e.event_type,
      appId: payload.appId,
      windowTitle: payload.windowTitle,
      contextType: e.context_type || undefined,
      activityCategory: e.event_type.startsWith('MESSAGE_') ? 'communication' : undefined,
    };
  });

  // Detect patterns
  const patterns = detectPatterns(eventData, {
    minOccurrences: 3,
    minConfidence: 0.5,
  });

  let patternsDetected = 0;

  for (const pattern of patterns) {
    // Check if similar pattern exists
    const existing = getPatterns({
      patternType: pattern.patternType,
      minConfidence: 0.3,
      limit: 50,
    });

    const similar = existing.find(p =>
      p.description === pattern.description ||
      (p.timeSignature?.hourOfDay === pattern.timeSignature?.hourOfDay &&
       p.timeSignature?.dayOfWeek === pattern.timeSignature?.dayOfWeek)
    );

    if (similar) {
      // Update existing pattern
      recordPatternObservation(similar.id);
    } else {
      // Save new pattern
      savePattern(pattern);
      patternsDetected++;
    }
  }

  // Mark events as processed
  const eventIds = events.map(e => e.id);
  if (eventIds.length > 0) {
    const placeholders = eventIds.map(() => '?').join(',');
    execute(`UPDATE events SET processed = 1 WHERE id IN (${placeholders})`, eventIds);
  }

  return { patternsDetected };
}

/**
 * Update daily rhythms from recent events
 */
async function updateDailyRhythms(): Promise<void> {
  // Get events from last 7 days
  const events = query<{
    event_type: string;
    timestamp: string;
    context_type: string | null;
  }>(`
    SELECT event_type, timestamp, context_type
    FROM events
    WHERE timestamp > datetime('now', '-7 days')
    ORDER BY timestamp ASC
  `, []);

  if (events.length === 0) return;

  const activityEvents = events.map(e => ({
    timestamp: new Date(e.timestamp),
    activityType: e.event_type.startsWith('MESSAGE_') ? 'communication' : 'other',
    contextType: e.context_type || undefined,
  }));

  const matrix = buildRhythmMatrix(activityEvents);
  saveRhythms('default', matrix);
}

/**
 * Generate predictions based on patterns
 */
async function generateNewPredictions(): Promise<{ generated: number }> {
  let generated = 0;

  // Check for overdue predictions and mark them
  const pending = getPendingPredictions();
  const now = new Date();
  for (const pred of pending) {
    if (pred.predictedTime && new Date(pred.predictedTime) < now) {
      execute(`
        UPDATE predictions
        SET was_correct = 0,
            actual_time = CURRENT_TIMESTAMP
        WHERE id = ? AND was_correct IS NULL
      `, [pred.id]);
    }
  }

  // Generate new predictions based on current context
  const predictions = generatePredictions({
    currentTime: new Date(),
  });

  for (const pred of predictions) {
    savePrediction(pred);
    generated++;
  }

  return { generated };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Detect context type from message content
 */
function detectContextType(subject: string): 'work' | 'personal' | 'unknown' {
  const lower = subject.toLowerCase();

  const workIndicators = [
    'meeting', 'project', 'deadline', 'report', 'review',
    'sprint', 'standup', 'invoice', 'proposal', 'contract',
    're:', 'fwd:', 'action required', 'urgent',
  ];

  const personalIndicators = [
    'birthday', 'party', 'dinner', 'lunch', 'weekend',
    'vacation', 'holiday', 'family', 'kids', 'love',
  ];

  for (const indicator of workIndicators) {
    if (lower.includes(indicator)) return 'work';
  }

  for (const indicator of personalIndicators) {
    if (lower.includes(indicator)) return 'personal';
  }

  return 'unknown';
}
