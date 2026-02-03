// Personality Mirroring - Generate prompts that match user's style

import { getDb } from '../db/connection';
import type { StyleProfile, RecipientStyleProfile } from '../types';
import { analyzeUserStyle, analyzeRecipientStyle } from './extractor';
import { 
  calculateEngagementScore, 
  recordDraftEdited,
  type EngagementSignal 
} from '../engagement/tracker';
import { 
  applyAdaptation,
  detectVentMode,
  calculateLearningRate 
} from '../engagement/adaptation';

/**
 * Blend two style profiles based on mirror level
 * mirrorLevel: 0 = all user style, 1 = all recipient style
 */
function blendStyles(
  userStyle: StyleProfile,
  recipientStyle: RecipientStyleProfile | null,
  mirrorLevel: number
): {
  formality: number;
  warmth: number;
  emojiDensity: number;
  verbosity: number;
} {
  if (!recipientStyle) {
    return {
      formality: userStyle.formality,
      warmth: 0.5,
      emojiDensity: userStyle.emojiDensity,
      verbosity: userStyle.verbosity,
    };
  }

  // Blend based on mirror level
  const blend = (userVal: number, recipientVal: number) =>
    userVal * (1 - mirrorLevel) + recipientVal * mirrorLevel;

  return {
    formality: blend(userStyle.formality, recipientStyle.formality),
    warmth: blend(0.5, recipientStyle.warmth),
    emojiDensity: blend(userStyle.emojiDensity, recipientStyle.emojiUsage),
    verbosity: userStyle.verbosity,  // Keep user's verbosity
  };
}

/**
 * Generate style descriptors based on metrics
 */
function getStyleDescriptors(style: {
  formality: number;
  warmth: number;
  emojiDensity: number;
  verbosity: number;
}): string[] {
  const descriptors: string[] = [];

  // Formality
  if (style.formality > 0.7) {
    descriptors.push('Use formal, professional language');
    descriptors.push('Avoid contractions (use "I am" instead of "I\'m")');
  } else if (style.formality > 0.5) {
    descriptors.push('Use a polite but relaxed tone');
  } else if (style.formality > 0.3) {
    descriptors.push('Use casual, conversational language');
    descriptors.push('Contractions are fine');
  } else {
    descriptors.push('Use very casual, informal language');
    descriptors.push('Keep it brief and friendly');
  }

  // Warmth
  if (style.warmth > 0.7) {
    descriptors.push('Be warm and personable');
    descriptors.push('Express genuine interest in the recipient');
  } else if (style.warmth > 0.5) {
    descriptors.push('Be friendly but professional');
  } else {
    descriptors.push('Keep it straightforward and to the point');
  }

  // Emoji
  if (style.emojiDensity > 0.5) {
    descriptors.push('Feel free to use emojis to express tone');
  } else if (style.emojiDensity > 0.1) {
    descriptors.push('Occasional emojis are okay');
  } else {
    descriptors.push('Avoid emojis');
  }

  // Verbosity
  if (style.verbosity > 0.7) {
    descriptors.push('Provide detailed, thorough responses');
  } else if (style.verbosity < 0.3) {
    descriptors.push('Keep messages concise and to the point');
  }

  return descriptors;
}

/**
 * Generate a system prompt for AI drafting that mirrors user's style
 */
export function generateMirrorPrompt(
  recipientEntityId?: string,
  mirrorLevel: number = 0.7
): string {
  // Get user style
  const userStyle = analyzeUserStyle();

  // Get recipient style if provided
  const recipientStyle = recipientEntityId
    ? analyzeRecipientStyle(recipientEntityId)
    : null;

  // Blend styles
  const blendedStyle = blendStyles(userStyle, recipientStyle, mirrorLevel);

  // Get descriptors
  const descriptors = getStyleDescriptors(blendedStyle);

  // Build prompt
  let prompt = 'You are drafting a message on behalf of the user. Match their communication style:\n\n';

  // Add descriptors
  for (const desc of descriptors) {
    prompt += `- ${desc}\n`;
  }

  // Add greetings and signoffs
  if (userStyle.greetingPatterns.length > 0) {
    const greetings = userStyle.greetingPatterns.slice(0, 3).join('", "');
    prompt += `\nTypical greetings: "${greetings}"\n`;
  }

  if (userStyle.signoffPatterns.length > 0) {
    const signoffs = userStyle.signoffPatterns.slice(0, 3).join('", "');
    prompt += `Typical sign-offs: "${signoffs}"\n`;
  }

  // Add signature phrases if any
  if (userStyle.signaturePhrases.length > 0) {
    const phrases = userStyle.signaturePhrases.slice(0, 3).join('", "');
    prompt += `Phrases the user often uses: "${phrases}"\n`;
  }

  // Add recipient context if available
  if (recipientStyle) {
    prompt += '\nContext for this recipient:\n';
    prompt += `- ${recipientStyle.messageCount} previous messages exchanged\n`;

    if (recipientStyle.relationshipType) {
      prompt += `- Relationship: ${recipientStyle.relationshipType}\n`;
    }

    if (recipientStyle.exampleMessages.length > 0) {
      prompt += '\nExamples of how the user writes to this person:\n';
      for (const example of recipientStyle.exampleMessages.slice(0, 2)) {
        const truncated = example.length > 150
          ? example.substring(0, 150) + '...'
          : example;
        prompt += `> ${truncated}\n`;
      }
    }
  }

  prompt += '\nWrite in a way that sounds naturally like the user.';

  return prompt;
}

/**
 * Calculate rapport score between AI response and user's expectations
 * Used for engagement tracking
 */
export function calculateRapportScore(
  aiDraft: string,
  userStyle: StyleProfile,
  recipientStyle?: RecipientStyleProfile
): number {
  let score = 0.5;  // Start neutral

  // Check formality match
  const draftFormality = calculateDraftFormality(aiDraft);
  const expectedFormality = recipientStyle?.formality ?? userStyle.formality;
  const formalityDiff = Math.abs(draftFormality - expectedFormality);
  score += (1 - formalityDiff) * 0.2;

  // Check length match
  const expectedLength = userStyle.avgMessageLength;
  if (expectedLength > 0) {
    const lengthRatio = aiDraft.length / expectedLength;
    if (lengthRatio > 0.5 && lengthRatio < 2) {
      score += 0.1;
    }
  }

  // Check emoji consistency
  const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(aiDraft);
  const shouldHaveEmoji = userStyle.emojiDensity > 0.2;
  if (hasEmoji === shouldHaveEmoji) {
    score += 0.1;
  }

  // Check greeting pattern match
  if (userStyle.greetingPatterns.length > 0) {
    const firstLine = aiDraft.split('\n')[0] || '';
    const matchesGreeting = userStyle.greetingPatterns.some(g =>
      firstLine.toLowerCase().includes(g.toLowerCase())
    );
    if (matchesGreeting) score += 0.1;
  }

  return Math.min(1, Math.max(0, score));
}

function calculateDraftFormality(text: string): number {
  let score = 0.5;

  // Formal indicators
  if (/\bdear\b/i.test(text)) score += 0.1;
  if (/\bsincerely\b/i.test(text)) score += 0.1;
  if (/\bregards\b/i.test(text)) score += 0.05;

  // Informal indicators
  if (/\bhey\b/i.test(text)) score -= 0.1;
  if (/!{2,}/.test(text)) score -= 0.1;
  if (/[\u{1F300}-\u{1F9FF}]/u.test(text)) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

/**
 * Get all recipient styles for user
 */
export function getAllRecipientStyles(): RecipientStyleProfile[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT * FROM recipient_styles
    ORDER BY message_count DESC
    LIMIT 50
  `).all() as Array<{
    recipient_entity_id: string;
    relationship_type: string | null;
    formality: number;
    warmth: number;
    emoji_usage: number;
    avg_response_time_hours: number | null;
    example_messages: string;
    message_count: number;
    updated_at: string;
  }>;

  return rows.map(row => ({
    recipientEntityId: row.recipient_entity_id,
    relationshipType: row.relationship_type as RecipientStyleProfile['relationshipType'],
    formality: row.formality,
    warmth: row.warmth,
    emojiUsage: row.emoji_usage,
    avgResponseTimeHours: row.avg_response_time_hours ?? undefined,
    exampleMessages: JSON.parse(row.example_messages || '[]'),
    messageCount: row.message_count,
    updatedAt: new Date(row.updated_at),
  }));
}

/**
 * Analyze all recipients and build style profiles
 */
export function analyzeAllRecipients(): number {
  const db = getDb();

  // Get all unique recipients the user has messaged
  const recipients = db.prepare(`
    SELECT DISTINCT json_each.value as recipient_id
    FROM messages m, json_each(m.recipient_entity_ids)
    WHERE m.is_from_user = 1
  `).all() as Array<{ recipient_id: string }>;

  let analyzed = 0;

  for (const { recipient_id } of recipients) {
    const profile = analyzeRecipientStyle(recipient_id);
    if (profile) analyzed++;
  }

  return analyzed;
}

// ============================================================
// ENGAGEMENT-DRIVEN ADAPTATION (Part 16: Integration)
// ============================================================

/**
 * Learn from user interaction with AI draft
 * This closes the engagement optimization loop from Part 16 of strategy
 * 
 * Call this after user edits a draft or responds to AI message
 */
export function learnFromInteraction(params: {
  recipientEntityId?: string;
  contextType?: 'work' | 'personal';
  aiDraftLength: number;
  userFinalLength: number;
  userResponseSentiment?: number;
  threadLength?: number;
  threadContinued?: boolean;
}): {
  learningApplied: boolean;
  reason?: string;
  engagementScore?: number;
  adaptations?: Array<{ dimension: string; change: number }>;
} {
  // Build engagement signal
  const editRatio = params.aiDraftLength > 0
    ? Math.abs(params.userFinalLength - params.aiDraftLength) / params.aiDraftLength
    : 0;

  const signal: EngagementSignal = {
    draftId: '', // Not needed for learning
    recipientEntityId: params.recipientEntityId,
    contextType: params.contextType,
    aiDraftLength: params.aiDraftLength,
    userFinalLength: params.userFinalLength,
    editRatio,
    userResponseSentiment: params.userResponseSentiment,
    threadLength: params.threadLength,
    threadContinued: params.threadContinued,
  };

  // Check for vent mode first
  if (params.userResponseSentiment !== undefined) {
    const ventCheck = detectVentMode(
      params.userResponseSentiment,
      params.threadLength ?? 0
    );

    if (ventCheck.isVenting) {
      return {
        learningApplied: false,
        reason: `Vent mode detected: ${ventCheck.signals.join(', ')}. Learning frozen to prevent model corruption.`,
      };
    }
  }

  // Calculate engagement score
  const engagement = calculateEngagementScore(signal);

  // Only learn if engagement is significantly different from neutral (0.5)
  // and we have sufficient signal confidence
  if (engagement.confidence < 0.3) {
    return {
      learningApplied: false,
      reason: 'Insufficient signal confidence for learning',
      engagementScore: engagement.overall,
    };
  }

  // Apply adaptation
  const adaptation = applyAdaptation(signal, {
    checkVentMode: true,
    sessionEngagement: engagement.overall,
  });

  // Also record the edit for tracking
  if (editRatio > 0) {
    recordDraftEdited('', params.userFinalLength, params.aiDraftLength);
  }

  return {
    learningApplied: adaptation.applied,
    reason: adaptation.reason,
    engagementScore: engagement.overall,
    adaptations: adaptation.changes.map(c => ({
      dimension: c.dimension,
      change: c.delta,
    })),
  };
}

/**
 * Generate mirror prompt with automatic learning enabled
 * 
 * This is the main entry point that combines prompt generation
 * with engagement-driven adaptation (Part 16, Phase 4)
 */
export function generateMirrorPromptWithLearning(
  recipientEntityId?: string,
  options: {
    mirrorLevel?: number;
    enableLearning?: boolean;
    previousInteraction?: {
      aiDraftLength: number;
      userFinalLength: number;
      sentiment?: number;
      threadLength?: number;
    };
  } = {}
): {
  prompt: string;
  learningResult?: ReturnType<typeof learnFromInteraction>;
} {
  // If we have previous interaction data, learn from it first
  let learningResult: ReturnType<typeof learnFromInteraction> | undefined;

  if (options.enableLearning && options.previousInteraction) {
    const db = getDb();
    
    // Get current interaction count to determine if learning is worthwhile
    const stats = db.prepare(`
      SELECT interaction_count FROM user_style WHERE id = 'default'
    `).get() as { interaction_count: number } | undefined;

    const interactionCount = stats?.interaction_count ?? 0;

    // Only learn after we have some baseline (10+ interactions)
    // This prevents early noise from corrupting the model
    if (interactionCount >= 10) {
      learningResult = learnFromInteraction({
        recipientEntityId,
        contextType: undefined, // Could be inferred from recipient
        aiDraftLength: options.previousInteraction.aiDraftLength,
        userFinalLength: options.previousInteraction.userFinalLength,
        userResponseSentiment: options.previousInteraction.sentiment,
        threadLength: options.previousInteraction.threadLength,
      });
    }
  }

  // Generate prompt with (potentially updated) style
  const prompt = generateMirrorPrompt(
    recipientEntityId,
    options.mirrorLevel ?? 0.7
  );

  return {
    prompt,
    learningResult,
  };
}

/**
 * Get learning statistics for monitoring
 */
export function getLearningStats(): {
  totalInteractions: number;
  currentLearningRate: number;
  averageEngagement: number;
  recentAdaptations: Array<{
    dimension: string;
    oldValue: number;
    newValue: number;
    timestamp: Date;
  }>;
  ventModeTriggered: number;
} {
  const db = getDb();

  // Get interaction count and learning rate
  const userStyle = db.prepare(`
    SELECT interaction_count FROM user_style WHERE id = 'default'
  `).get() as { interaction_count: number } | undefined;

  const totalInteractions = userStyle?.interaction_count ?? 0;
  const currentLearningRate = calculateLearningRate(totalInteractions);

  // Get average engagement from recent drafts
  const engagementStats = db.prepare(`
    SELECT AVG(1 - COALESCE(edit_ratio, 0.5)) as avg_engagement
    FROM engagement_events
    WHERE interaction_type = 'draft_edited'
      AND timestamp > datetime('now', '-30 days')
  `).get() as { avg_engagement: number | null };

  // Get recent adaptations from personality_evolution
  const adaptations = db.prepare(`
    SELECT dimension, old_value, new_value, timestamp
    FROM personality_evolution
    ORDER BY timestamp DESC
    LIMIT 10
  `).all() as Array<{
    dimension: string;
    old_value: number;
    new_value: number;
    timestamp: string;
  }>;

  // Count vent mode triggers
  const ventCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM engagement_events
    WHERE interaction_type = 'vent_mode_detected'
      AND timestamp > datetime('now', '-30 days')
  `).get() as { count: number };

  return {
    totalInteractions,
    currentLearningRate,
    averageEngagement: engagementStats.avg_engagement ?? 0.5,
    recentAdaptations: adaptations.map(a => ({
      dimension: a.dimension,
      oldValue: a.old_value,
      newValue: a.new_value,
      timestamp: new Date(a.timestamp),
    })),
    ventModeTriggered: ventCount.count,
  };
}
