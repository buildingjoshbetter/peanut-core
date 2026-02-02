// Personality Mirroring - Generate prompts that match user's style

import { getDb } from '../db/connection';
import type { StyleProfile, RecipientStyleProfile } from '../types';
import { analyzeUserStyle, analyzeRecipientStyle } from './extractor';

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
