// iMessage ingestion

import type { IMessageMessage } from './types';
import type { NormalizedMessage } from '../types';

/**
 * Convert Core Data timestamp to JavaScript Date
 * Core Data uses seconds since 2001-01-01
 */
function coreDataToDate(timestamp: number): Date {
  // Core Data epoch: January 1, 2001
  const coreDataEpoch = 978307200; // Unix timestamp of 2001-01-01
  return new Date((coreDataEpoch + timestamp) * 1000);
}

/**
 * Normalize phone number to consistent format
 */
function normalizePhone(phone: string): string {
  // Remove all non-digit characters except leading +
  const hasPlus = phone.startsWith('+');
  const digits = phone.replace(/\D/g, '');

  // Add country code if missing (assume US)
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return hasPlus ? `+${digits}` : digits;
}

/**
 * Determine if identifier is email or phone
 */
function parseIdentifier(id: string): { phone?: string; email?: string } {
  if (id.includes('@')) {
    return { email: id.toLowerCase().trim() };
  } else {
    return { phone: normalizePhone(id) };
  }
}

/**
 * Normalize an iMessage to our standard format
 */
export function normalizeIMessage(
  raw: IMessageMessage,
  userPhone?: string,
  userEmail?: string
): NormalizedMessage {
  // Determine sender
  let sender: { phone?: string; email?: string; name?: string };

  if (raw.is_from_me) {
    sender = {
      phone: userPhone,
      email: userEmail,
    };
  } else {
    sender = {
      phone: raw.sender_phone ? normalizePhone(raw.sender_phone) : undefined,
      email: raw.sender_email?.toLowerCase(),
    };
  }

  // Determine recipients
  const recipients: Array<{ phone?: string; email?: string; type: 'to' | 'cc' | 'bcc' }> = [];

  if (raw.is_from_me) {
    // User sent this - recipients are the chat participants
    if (raw.participants) {
      for (const p of raw.participants) {
        const parsed = p.phone ? { phone: normalizePhone(p.phone) } : { email: p.email?.toLowerCase() };
        recipients.push({ ...parsed, type: 'to' });
      }
    } else if (raw.sender_phone || raw.sender_email) {
      // Fallback: the "sender" field is actually the other party
      recipients.push({
        phone: raw.sender_phone ? normalizePhone(raw.sender_phone) : undefined,
        email: raw.sender_email?.toLowerCase(),
        type: 'to',
      });
    }
  } else {
    // Someone else sent this - user is the recipient
    recipients.push({
      phone: userPhone,
      email: userEmail,
      type: 'to',
    });
  }

  return {
    id: `imessage:${raw.guid}`,
    sourceType: 'imessage',
    sourceId: raw.guid,
    threadId: raw.chat_id,

    sender,
    recipients,

    bodyText: raw.text || '',

    timestamp: coreDataToDate(raw.date),
    isFromUser: raw.is_from_me,
  };
}

/**
 * Normalize a batch of iMessages
 */
export function normalizeIMessageBatch(
  messages: IMessageMessage[],
  userPhone?: string,
  userEmail?: string
): NormalizedMessage[] {
  return messages.map(msg => normalizeIMessage(msg, userPhone, userEmail));
}
