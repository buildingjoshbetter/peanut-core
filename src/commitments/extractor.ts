// Commitment Extractor
// Strategy Reference: Part 11
//
// Extracts commitments (promises, asks, deadlines) from message text.

import type { CommitmentType } from '../types';

export interface ExtractedCommitment {
  type: CommitmentType;
  description: string;
  owner?: string;       // Who made/owns the commitment (name reference)
  counterparty?: string; // Who it's to/from (name reference)
  dueDate?: Date;
  confidence: number;
}

// Patterns for commitment detection
const PROMISE_PATTERNS = [
  /\bI('ll| will| am going to)\s+(.+?)(?:\.|$)/gi,
  /\bI promise(?:d)?\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
  /\bI('m| am) committed to\s+(.+?)(?:\.|$)/gi,
  /\bcount on me\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
  /\bI('ve| have) got\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
];

const ASK_PATTERNS = [
  /\bcan you\s+(.+?)\??(?:\.|$)/gi,
  /\bcould you\s+(.+?)\??(?:\.|$)/gi,
  /\bwould you\s+(.+?)\??(?:\.|$)/gi,
  /\bwill you\s+(.+?)\??(?:\.|$)/gi,
  /\bplease\s+(.+?)(?:\.|$)/gi,
  /\bI need you to\s+(.+?)(?:\.|$)/gi,
  /\bI('d| would) like you to\s+(.+?)(?:\.|$)/gi,
];

const DEADLINE_PATTERNS = [
  /\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
  /\bby\s+(tomorrow|today|tonight|this week|next week|end of (?:the )?(?:day|week|month))/gi,
  /\bby\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/gi,
  /\bby\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}/gi,
  /\bdue\s+(?:by\s+)?(.+?)(?:\.|$)/gi,
  /\bASAP\b/gi,
  /\burgent(?:ly)?\b/gi,
];

const DECISION_PATTERNS = [
  /\bI('ve| have) decided to\s+(.+?)(?:\.|$)/gi,
  /\bdecision:\s*(.+?)(?:\.|$)/gi,
  /\blet's go with\s+(.+?)(?:\.|$)/gi,
  /\bI('m| am) going with\s+(.+?)(?:\.|$)/gi,
];

/**
 * Extract commitments from message text
 */
export function extractCommitments(
  text: string,
  isFromUser: boolean = true
): ExtractedCommitment[] {
  const commitments: ExtractedCommitment[] = [];
  const normalizedText = text.trim();

  // Extract promises
  for (const pattern of PROMISE_PATTERNS) {
    pattern.lastIndex = 0;  // Reset regex state
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const lastMatch = match[match.length - 1];
      if (!lastMatch) continue;
      const description = lastMatch.trim();
      if (description.length > 3 && description.length < 200) {
        commitments.push({
          type: 'promise',
          description: `Will ${description}`,
          owner: isFromUser ? undefined : 'sender',
          counterparty: isFromUser ? 'recipient' : undefined,
          dueDate: extractDateFromContext(normalizedText, match.index),
          confidence: 0.7,
        });
      }
    }
  }

  // Extract asks
  for (const pattern of ASK_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const lastMatch = match[match.length - 1];
      if (!lastMatch) continue;
      const description = lastMatch.trim();
      if (description.length > 3 && description.length < 200) {
        commitments.push({
          type: 'ask',
          description: description,
          owner: isFromUser ? 'recipient' : 'sender',
          counterparty: isFromUser ? undefined : 'recipient',
          dueDate: extractDateFromContext(normalizedText, match.index),
          confidence: 0.6,
        });
      }
    }
  }

  // Extract decisions
  for (const pattern of DECISION_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const lastMatch = match[match.length - 1];
      if (!lastMatch) continue;
      const description = lastMatch.trim();
      if (description.length > 3 && description.length < 200) {
        commitments.push({
          type: 'decision',
          description: description,
          confidence: 0.8,
        });
      }
    }
  }

  // Check for deadline indicators and boost confidence
  for (const pattern of DEADLINE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(normalizedText)) {
      // Boost confidence of recent commitments
      for (const c of commitments) {
        c.confidence = Math.min(1.0, c.confidence + 0.1);
      }

      // Add standalone deadline if no other commitments found
      if (commitments.length === 0) {
        const match = normalizedText.match(/(?:by|due)\s+(.+?)(?:\.|,|$)/i);
        if (match && match[1]) {
          const dueDate = parseDeadline(match[1]);
          if (dueDate) {
            commitments.push({
              type: 'deadline',
              description: `Deadline: ${match[1]}`,
              dueDate,
              confidence: 0.5,
            });
          }
        }
      }
      break;
    }
  }

  // Deduplicate similar commitments
  return deduplicateCommitments(commitments);
}

/**
 * Extract date from surrounding context
 */
function extractDateFromContext(text: string, matchIndex: number): Date | undefined {
  // Look at text around the match for deadline indicators
  const contextStart = Math.max(0, matchIndex - 50);
  const contextEnd = Math.min(text.length, matchIndex + 100);
  const context = text.slice(contextStart, contextEnd);

  // Check for common deadline patterns
  const deadlineMatch = context.match(/by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|this week|next week|end of (?:the )?(?:day|week|month)|ASAP|\d{1,2}[\/\-]\d{1,2})/i);

  if (deadlineMatch && deadlineMatch[1]) {
    return parseDeadline(deadlineMatch[1]);
  }

  return undefined;
}

/**
 * Parse deadline text into a Date
 */
function parseDeadline(text: string): Date | undefined {
  const now = new Date();
  const lowerText = text.toLowerCase().trim();

  // Day of week
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = days.findIndex(d => lowerText.startsWith(d));
  if (dayIndex !== -1) {
    const targetDate = new Date(now);
    const currentDay = now.getDay();
    let daysToAdd = dayIndex - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7;  // Next occurrence
    targetDate.setDate(now.getDate() + daysToAdd);
    targetDate.setHours(17, 0, 0, 0);  // End of business day
    return targetDate;
  }

  // Relative terms
  if (lowerText === 'today' || lowerText === 'tonight') {
    const date = new Date(now);
    date.setHours(23, 59, 0, 0);
    return date;
  }

  if (lowerText === 'tomorrow') {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(17, 0, 0, 0);
    return date;
  }

  if (lowerText === 'this week' || lowerText === 'end of week' || lowerText === 'end of the week') {
    const date = new Date(now);
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
    date.setDate(now.getDate() + daysUntilFriday);
    date.setHours(17, 0, 0, 0);
    return date;
  }

  if (lowerText === 'next week') {
    const date = new Date(now);
    date.setDate(now.getDate() + 7);
    date.setHours(17, 0, 0, 0);
    return date;
  }

  if (lowerText === 'end of month' || lowerText === 'end of the month') {
    const date = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    date.setHours(17, 0, 0, 0);
    return date;
  }

  if (lowerText === 'end of day' || lowerText === 'end of the day' || lowerText === 'eod') {
    const date = new Date(now);
    date.setHours(17, 0, 0, 0);
    return date;
  }

  if (lowerText === 'asap') {
    const date = new Date(now);
    date.setHours(date.getHours() + 4);  // 4 hours from now
    return date;
  }

  // Try to parse as date string
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return undefined;
}

/**
 * Remove duplicate or very similar commitments
 */
function deduplicateCommitments(commitments: ExtractedCommitment[]): ExtractedCommitment[] {
  const seen = new Set<string>();
  return commitments.filter(c => {
    const key = `${c.type}:${c.description.toLowerCase().slice(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * LLM prompt for commitment extraction (for use with Ollama/etc)
 */
export const COMMITMENT_EXTRACTION_PROMPT = `Extract commitments from this message.

Look for:
- Promises: "I'll...", "I will...", "I promise..."
- Asks: "Can you...", "Would you...", "Please..."
- Deadlines: "by Friday", "before the meeting", "ASAP"
- Decisions: "I've decided...", "let's go with..."

For each commitment, return:
{
  "commitments": [
    {
      "type": "promise" | "ask" | "deadline" | "decision",
      "description": "what the commitment is",
      "owner": "who made/owns it (or null if user)",
      "counterparty": "who it's to/from (or null)",
      "due_date": "ISO date string or null",
      "confidence": 0.0 to 1.0
    }
  ]
}

If no commitments found, return {"commitments": []}

Message:
`;
