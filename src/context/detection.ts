// Context Detection
// Strategy Reference: Part 8, lines 653-669
//
// Automatically detects the current context from signals like
// app, time of day, recipient, etc.

import { getContext, setActiveContext, getEntityContexts } from './boundaries';

interface ContextSignals {
  currentApp?: string;
  windowTitle?: string;
  timeOfDay?: number;  // Hour 0-23
  dayOfWeek?: number;  // 0=Monday, 6=Sunday
  recipientEntityId?: string;
  url?: string;
  recentTopics?: string[];
}

// App-to-context mapping
const APP_CONTEXT_MAP: Record<string, string> = {
  'com.apple.mail': 'work',
  'com.microsoft.outlook': 'work',
  'com.slack.slack': 'work',
  'com.tinyspeck.slackmacgap': 'work',
  'com.microsoft.teams': 'work',
  'com.apple.messages': 'personal',
  'com.facebook.messenger': 'personal',
  'com.whatsapp.whatsapp': 'personal',
  'com.apple.facetime': 'personal',
};

// Work hours (simplified)
const WORK_HOURS = {
  start: 9,   // 9 AM
  end: 18,    // 6 PM
  days: [0, 1, 2, 3, 4],  // Monday-Friday
};

// URL patterns
const WORK_URL_PATTERNS = [
  /github\.com/i,
  /gitlab\.com/i,
  /jira\..*\.com/i,
  /confluence\..*\.com/i,
  /slack\.com/i,
  /notion\.so/i,
  /figma\.com/i,
  /linear\.app/i,
];

const PERSONAL_URL_PATTERNS = [
  /facebook\.com/i,
  /instagram\.com/i,
  /twitter\.com/i,
  /x\.com/i,
  /youtube\.com/i,
  /netflix\.com/i,
  /amazon\.com/i,
];

/**
 * Detect context from signals
 */
export function detectContext(signals: ContextSignals): {
  context: string;
  confidence: number;
  signals: Record<string, unknown>;
} {
  const scores = {
    work: 0,
    personal: 0,
    family: 0,
  };

  const usedSignals: Record<string, unknown> = {};

  // App-based detection
  if (signals.currentApp) {
    const appContext = APP_CONTEXT_MAP[signals.currentApp];
    if (appContext && appContext in scores) {
      scores[appContext as keyof typeof scores] += 2;
      usedSignals.app = signals.currentApp;
    }
  }

  // Time-based detection
  if (signals.timeOfDay !== undefined && signals.dayOfWeek !== undefined) {
    const isWorkHours =
      signals.timeOfDay >= WORK_HOURS.start &&
      signals.timeOfDay < WORK_HOURS.end &&
      WORK_HOURS.days.includes(signals.dayOfWeek);

    if (isWorkHours) {
      scores.work += 1;
    } else {
      scores.personal += 0.5;
    }
    usedSignals.timeOfDay = signals.timeOfDay;
    usedSignals.dayOfWeek = signals.dayOfWeek;
  }

  // URL-based detection
  if (signals.url) {
    for (const pattern of WORK_URL_PATTERNS) {
      if (pattern.test(signals.url)) {
        scores.work += 1.5;
        usedSignals.url = signals.url;
        break;
      }
    }
    for (const pattern of PERSONAL_URL_PATTERNS) {
      if (pattern.test(signals.url)) {
        scores.personal += 1.5;
        usedSignals.url = signals.url;
        break;
      }
    }
  }

  // Recipient-based detection
  if (signals.recipientEntityId) {
    const recipientContexts = getEntityContexts(signals.recipientEntityId);
    for (const ctx of recipientContexts) {
      if (ctx.contextName in scores) {
        scores[ctx.contextName as keyof typeof scores] += ctx.confidence * 2;
        usedSignals.recipientContext = ctx.contextName;
      }
    }
  }

  // Window title heuristics
  if (signals.windowTitle) {
    const title = signals.windowTitle.toLowerCase();
    if (title.includes('slack') || title.includes('jira') || title.includes('confluence')) {
      scores.work += 1;
    }
    if (title.includes('messages') || title.includes('whatsapp')) {
      scores.personal += 1;
    }
  }

  // Find highest scoring context
  let maxContext: keyof typeof scores = 'personal';  // Default
  let maxScore = scores.personal;

  for (const [context, score] of Object.entries(scores) as Array<[keyof typeof scores, number]>) {
    if (score > maxScore) {
      maxScore = score;
      maxContext = context;
    }
  }

  // Calculate confidence (normalize to 0-1)
  const totalScore = scores.work + scores.personal + scores.family;
  const confidence = totalScore > 0 ? maxScore / totalScore : 0.5;

  return {
    context: maxContext,
    confidence,
    signals: usedSignals,
  };
}

/**
 * Auto-detect and set context for a session
 */
export function autoDetectContext(
  sessionId: string,
  signals: ContextSignals
): {
  context: string;
  confidence: number;
} {
  const detection = detectContext(signals);

  setActiveContext(
    sessionId,
    detection.context,
    detection.signals,
    detection.confidence
  );

  return {
    context: detection.context,
    confidence: detection.confidence,
  };
}

/**
 * Get context signals from the current environment
 */
export function getCurrentSignals(): ContextSignals {
  const now = new Date();
  return {
    timeOfDay: now.getHours(),
    dayOfWeek: (now.getDay() + 6) % 7,  // Convert Sunday=0 to Monday=0
  };
}
