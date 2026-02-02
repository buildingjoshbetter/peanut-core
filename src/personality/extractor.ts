// Personality/Style Extraction from messages

import { getDb } from '../db/connection';
import type { StyleProfile, RecipientStyleProfile, RelationshipType } from '../types';

/**
 * Count emojis in text
 */
function countEmojis(text: string): number {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]/gu;
  const matches = text.match(emojiRegex);
  return matches?.length ?? 0;
}

/**
 * Calculate formality score based on linguistic markers
 * 0 = very casual, 1 = very formal
 */
function calculateFormality(text: string): number {
  const lowerText = text.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  let formalScore = 0.5;  // Start neutral

  // Formal markers
  const formalPatterns = [
    /\bdear\b/i,
    /\bsincerely\b/i,
    /\bregards\b/i,
    /\bthank you\b/i,
    /\bplease\b/i,
    /\bi would\b/i,
    /\bi am\b/i,
    /\bper your\b/i,
    /\bas per\b/i,
    /\bkindly\b/i,
    /\baccordingly\b/i,
  ];

  // Informal markers
  const informalPatterns = [
    /\bhey\b/i,
    /\bhi\b/i,
    /\byeah\b/i,
    /\byep\b/i,
    /\bnope\b/i,
    /\bgonna\b/i,
    /\bwanna\b/i,
    /\blol\b/i,
    /\bhaha\b/i,
    /\bomg\b/i,
    /\bbtw\b/i,
    /!{2,}/,  // Multiple exclamation marks
    /\bi'm\b/i,  // Contractions
    /\bdon't\b/i,
    /\bcan't\b/i,
    /\bwon't\b/i,
  ];

  for (const pattern of formalPatterns) {
    if (pattern.test(text)) formalScore += 0.05;
  }

  for (const pattern of informalPatterns) {
    if (pattern.test(text)) formalScore -= 0.05;
  }

  // Emoji presence suggests informality
  const emojiCount = countEmojis(text);
  formalScore -= emojiCount * 0.02;

  // ALL CAPS sections suggest informality
  const capsRatio = (text.match(/[A-Z]{3,}/g)?.length ?? 0) / Math.max(wordCount, 1);
  formalScore -= capsRatio * 0.1;

  return Math.max(0, Math.min(1, formalScore));
}

/**
 * Calculate verbosity score
 * 0 = very terse, 1 = very elaborate
 */
function calculateVerbosity(messageLength: number, avgLength: number): number {
  if (avgLength === 0) return 0.5;
  const ratio = messageLength / avgLength;

  // Normalize around 1.0
  return Math.max(0, Math.min(1, 0.5 + (ratio - 1) * 0.25));
}

/**
 * Extract greeting patterns from messages
 */
function extractGreetings(texts: string[]): string[] {
  const greetings: Map<string, number> = new Map();

  const greetingPatterns = [
    /^(hey|hi|hello|dear|good morning|good afternoon|good evening|yo|sup|heya)[,!\s]*/i,
  ];

  for (const text of texts) {
    const firstLine = text.split('\n')[0] || '';
    for (const pattern of greetingPatterns) {
      const match = firstLine.match(pattern);
      if (match) {
        const greeting = match[0].trim().replace(/[,!]$/, '');
        greetings.set(greeting, (greetings.get(greeting) || 0) + 1);
      }
    }
  }

  // Return top greetings
  return Array.from(greetings.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g]) => g);
}

/**
 * Extract signoff patterns from messages
 */
function extractSignoffs(texts: string[]): string[] {
  const signoffs: Map<string, number> = new Map();

  const signoffPatterns = [
    /(thanks|thank you|cheers|best|regards|sincerely|love|xo|xoxo|ttyl|later|peace|take care)[,!\s]*$/im,
    /^(thanks|best|cheers|regards|sincerely|love)[,!\s]*$/im,
  ];

  for (const text of texts) {
    const lines = text.split('\n').filter(l => l.trim());
    const lastLines = lines.slice(-3);

    for (const line of lastLines) {
      for (const pattern of signoffPatterns) {
        const match = line.match(pattern);
        if (match) {
          const signoff = match[0].trim().replace(/[,!]$/, '');
          signoffs.set(signoff, (signoffs.get(signoff) || 0) + 1);
        }
      }
    }
  }

  return Array.from(signoffs.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s]) => s);
}

/**
 * Extract signature phrases (repeated unusual phrases)
 */
function extractSignaturePhrases(texts: string[]): string[] {
  const phrases: Map<string, number> = new Map();

  // Look for 2-4 word phrases that appear multiple times
  for (const text of texts) {
    const words = text.toLowerCase().split(/\s+/);

    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join(' ');

        // Skip common phrases
        if (isCommonPhrase(phrase)) continue;

        phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
      }
    }
  }

  // Return phrases that appear multiple times but aren't too common
  return Array.from(phrases.entries())
    .filter(([_, count]) => count >= 2 && count <= texts.length * 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([p]) => p);
}

function isCommonPhrase(phrase: string): boolean {
  const common = [
    'i am', 'i have', 'i will', 'i would', 'i think',
    'it is', 'it was', 'that is', 'this is',
    'the the', 'a the', 'in the', 'on the', 'at the',
    'of the', 'to the', 'for the', 'and the',
    'thank you', 'thanks for', 'let me know',
  ];
  return common.includes(phrase);
}

/**
 * Analyze user's messages to build style profile
 */
export function analyzeUserStyle(userId?: string): StyleProfile {
  const db = getDb();

  // Get user's sent messages
  const messages = db.prepare(`
    SELECT body_text FROM messages
    WHERE is_from_user = 1
    ORDER BY timestamp DESC
    LIMIT 500
  `).all() as Array<{ body_text: string }>;

  if (messages.length === 0) {
    return getDefaultStyleProfile();
  }

  const texts = messages.map(m => m.body_text).filter(Boolean);

  // Calculate metrics
  const totalLength = texts.reduce((sum, t) => sum + t.length, 0);
  const avgLength = totalLength / texts.length;

  const formalityScores = texts.map(t => calculateFormality(t));
  const avgFormality = formalityScores.reduce((a, b) => a + b, 0) / formalityScores.length;

  const emojiCounts = texts.map(t => countEmojis(t));
  const avgEmojiDensity = emojiCounts.reduce((a, b) => a + b, 0) / totalLength * 100;

  const verbosityScores = texts.map(t => calculateVerbosity(t.length, avgLength));
  const avgVerbosity = verbosityScores.reduce((a, b) => a + b, 0) / verbosityScores.length;

  const greetings = extractGreetings(texts);
  const signoffs = extractSignoffs(texts);
  const signaturePhrases = extractSignaturePhrases(texts);

  const profile: StyleProfile = {
    formality: avgFormality,
    verbosity: avgVerbosity,
    emojiDensity: avgEmojiDensity,
    avgMessageLength: Math.round(avgLength),
    greetingPatterns: greetings,
    signoffPatterns: signoffs,
    signaturePhrases: signaturePhrases,
    interactionCount: messages.length,
    updatedAt: new Date(),
  };

  // Save to database
  db.prepare(`
    UPDATE user_style SET
      formality = ?,
      verbosity = ?,
      emoji_density = ?,
      avg_message_length = ?,
      greeting_patterns = ?,
      signoff_patterns = ?,
      signature_phrases = ?,
      interaction_count = ?,
      updated_at = datetime('now')
    WHERE id = 'default'
  `).run(
    profile.formality,
    profile.verbosity,
    profile.emojiDensity,
    profile.avgMessageLength,
    JSON.stringify(profile.greetingPatterns),
    JSON.stringify(profile.signoffPatterns),
    JSON.stringify(profile.signaturePhrases),
    profile.interactionCount
  );

  return profile;
}

function getDefaultStyleProfile(): StyleProfile {
  return {
    formality: 0.5,
    verbosity: 0.5,
    emojiDensity: 0,
    avgMessageLength: 0,
    greetingPatterns: [],
    signoffPatterns: [],
    signaturePhrases: [],
    interactionCount: 0,
    updatedAt: new Date(),
  };
}

/**
 * Analyze messages to a specific recipient
 */
export function analyzeRecipientStyle(recipientEntityId: string): RecipientStyleProfile | null {
  const db = getDb();

  // Get messages from user to this recipient
  const messages = db.prepare(`
    SELECT m.body_text, m.timestamp
    FROM messages m
    WHERE m.is_from_user = 1
      AND EXISTS (
        SELECT 1 FROM json_each(m.recipient_entity_ids)
        WHERE json_each.value = ?
      )
    ORDER BY m.timestamp DESC
    LIMIT 200
  `).all(recipientEntityId) as Array<{ body_text: string; timestamp: string }>;

  if (messages.length < 3) {
    return null;  // Not enough data
  }

  const texts = messages.map(m => m.body_text).filter(Boolean);

  // Calculate recipient-specific metrics
  const formalityScores = texts.map(t => calculateFormality(t));
  const avgFormality = formalityScores.reduce((a, b) => a + b, 0) / formalityScores.length;

  // Warmth: based on emotional language, exclamations, personal questions
  const warmthIndicators = texts.map(t => {
    let warmth = 0.5;
    if (/\bhow are you\b/i.test(t)) warmth += 0.1;
    if (/\bhope you're\b/i.test(t)) warmth += 0.1;
    if (/\bmiss you\b/i.test(t)) warmth += 0.15;
    if (/\blove\b/i.test(t)) warmth += 0.1;
    if (/!/.test(t)) warmth += 0.05;
    if (countEmojis(t) > 0) warmth += 0.1;
    return Math.min(1, warmth);
  });
  const avgWarmth = warmthIndicators.reduce((a, b) => a + b, 0) / warmthIndicators.length;

  const emojiCounts = texts.map(t => countEmojis(t));
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  const avgEmojiUsage = emojiCounts.reduce((a, b) => a + b, 0) / totalChars * 100;

  // Calculate average response time (if we have incoming messages too)
  // This would require more complex analysis

  // Get example messages
  const examples = texts.slice(0, 5);

  const profile: RecipientStyleProfile = {
    recipientEntityId,
    formality: avgFormality,
    warmth: avgWarmth,
    emojiUsage: avgEmojiUsage,
    exampleMessages: examples,
    messageCount: messages.length,
    updatedAt: new Date(),
  };

  // Save to database
  db.prepare(`
    INSERT INTO recipient_styles (
      recipient_entity_id, formality, warmth, emoji_usage,
      example_messages, message_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(recipient_entity_id) DO UPDATE SET
      formality = excluded.formality,
      warmth = excluded.warmth,
      emoji_usage = excluded.emoji_usage,
      example_messages = excluded.example_messages,
      message_count = excluded.message_count,
      updated_at = excluded.updated_at
  `).run(
    recipientEntityId,
    profile.formality,
    profile.warmth,
    profile.emojiUsage,
    JSON.stringify(profile.exampleMessages),
    profile.messageCount
  );

  return profile;
}

/**
 * Infer relationship type from communication patterns
 */
export function inferRelationshipType(recipientEntityId: string): RelationshipType | null {
  const db = getDb();

  // Get messaging patterns
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN m.is_from_user = 1 THEN 1 ELSE 0 END) as sent,
      AVG(LENGTH(m.body_text)) as avg_length
    FROM messages m
    WHERE m.sender_entity_id = ?
       OR EXISTS (
         SELECT 1 FROM json_each(m.recipient_entity_ids)
         WHERE json_each.value = ?
       )
  `).get(recipientEntityId, recipientEntityId) as {
    total: number;
    sent: number;
    avg_length: number;
  } | undefined;

  if (!stats || stats.total < 5) return null;

  // Check for work patterns
  const workPatterns = db.prepare(`
    SELECT COUNT(*) as count FROM messages m
    WHERE (m.sender_entity_id = ? OR EXISTS (
      SELECT 1 FROM json_each(m.recipient_entity_ids) WHERE json_each.value = ?
    ))
    AND (
      m.body_text LIKE '%meeting%'
      OR m.body_text LIKE '%deadline%'
      OR m.body_text LIKE '%project%'
      OR m.body_text LIKE '%report%'
    )
  `).get(recipientEntityId, recipientEntityId) as { count: number };

  // Check for personal patterns
  const personalPatterns = db.prepare(`
    SELECT COUNT(*) as count FROM messages m
    WHERE (m.sender_entity_id = ? OR EXISTS (
      SELECT 1 FROM json_each(m.recipient_entity_ids) WHERE json_each.value = ?
    ))
    AND (
      m.body_text LIKE '%love you%'
      OR m.body_text LIKE '%miss you%'
      OR m.body_text LIKE '%dinner%'
      OR m.body_text LIKE '%family%'
    )
  `).get(recipientEntityId, recipientEntityId) as { count: number };

  const workRatio = workPatterns.count / stats.total;
  const personalRatio = personalPatterns.count / stats.total;

  if (personalRatio > 0.2) return 'family';
  if (workRatio > 0.3) return 'colleague';
  if (stats.total > 50) return 'friend';
  return 'acquaintance';
}
