// Gmail message ingestion

import type { GmailMessage } from './types';
import type { NormalizedMessage } from '../types';

/**
 * Parse email address from header value like "John Doe <john@example.com>"
 */
function parseEmailAddress(headerValue: string): { name?: string; email: string } | null {
  if (!headerValue) return null;

  // Match "Name <email>" format
  const match = headerValue.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1]?.trim().replace(/^["']|["']$/g, ''),
      email: match[2]!.toLowerCase().trim(),
    };
  }

  // Plain email
  const emailMatch = headerValue.match(/^([^\s@]+@[^\s@]+\.[^\s@]+)$/);
  if (emailMatch) {
    return { email: emailMatch[1]!.toLowerCase().trim() };
  }

  // Try to extract email from anywhere in the string
  const anyEmailMatch = headerValue.match(/([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)/);
  if (anyEmailMatch) {
    return { email: anyEmailMatch[1]!.toLowerCase().trim() };
  }

  return null;
}

/**
 * Parse multiple addresses from To/Cc/Bcc headers
 */
function parseAddressList(headerValue: string): Array<{ name?: string; email: string }> {
  if (!headerValue) return [];

  // Split on comma, but be careful about commas in quoted names
  const addresses: Array<{ name?: string; email: string }> = [];

  // Simple split for now - could be improved for edge cases
  const parts = headerValue.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

  for (const part of parts) {
    const parsed = parseEmailAddress(part.trim());
    if (parsed) {
      addresses.push(parsed);
    }
  }

  return addresses;
}

/**
 * Extract header value by name (case-insensitive)
 */
function getHeader(headers: GmailMessage['payload']['headers'], name: string): string | undefined {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value;
}

/**
 * Decode base64url encoded content
 */
function decodeBase64Url(data: string): string {
  // Replace URL-safe chars with standard base64
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);

  try {
    return Buffer.from(padded, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * Extract plain text body from Gmail message payload
 */
function extractBody(payload: GmailMessage['payload']): { text: string; html?: string } {
  let textBody = '';
  let htmlBody = '';

  // Check direct body
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/plain') {
      textBody = decoded;
    } else if (payload.mimeType === 'text/html') {
      htmlBody = decoded;
    }
  }

  // Check parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.body?.data) {
        const decoded = decodeBase64Url(part.body.data);
        if (part.mimeType === 'text/plain' && !textBody) {
          textBody = decoded;
        } else if (part.mimeType === 'text/html' && !htmlBody) {
          htmlBody = decoded;
        }
      }
    }
  }

  // If we only have HTML, strip tags for text version
  if (!textBody && htmlBody) {
    textBody = htmlBody
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { text: textBody, html: htmlBody || undefined };
}

/**
 * Normalize a Gmail message to our standard format
 */
export function normalizeGmailMessage(
  raw: GmailMessage,
  userEmail?: string
): NormalizedMessage {
  const headers = raw.payload.headers;

  // Extract sender
  const fromHeader = getHeader(headers, 'From') || '';
  const sender = parseEmailAddress(fromHeader);

  // Extract recipients
  const toHeader = getHeader(headers, 'To') || '';
  const ccHeader = getHeader(headers, 'Cc') || '';
  const bccHeader = getHeader(headers, 'Bcc') || '';

  const toAddresses = parseAddressList(toHeader).map(a => ({ ...a, type: 'to' as const }));
  const ccAddresses = parseAddressList(ccHeader).map(a => ({ ...a, type: 'cc' as const }));
  const bccAddresses = parseAddressList(bccHeader).map(a => ({ ...a, type: 'bcc' as const }));

  // Extract body
  const { text, html } = extractBody(raw.payload);

  // Determine if from user
  const isFromUser = userEmail
    ? sender?.email?.toLowerCase() === userEmail.toLowerCase()
    : false;

  // Parse timestamp
  const timestamp = raw.internalDate
    ? new Date(parseInt(raw.internalDate, 10))
    : new Date();

  return {
    id: `gmail:${raw.id}`,
    sourceType: 'gmail',
    sourceId: raw.id,
    threadId: raw.threadId,

    sender: {
      email: sender?.email,
      name: sender?.name,
    },

    recipients: [
      ...toAddresses.map(a => ({ email: a.email, name: a.name, type: a.type })),
      ...ccAddresses.map(a => ({ email: a.email, name: a.name, type: a.type })),
      ...bccAddresses.map(a => ({ email: a.email, name: a.name, type: a.type })),
    ],

    subject: getHeader(headers, 'Subject'),
    bodyText: text,
    bodyHtml: html,

    timestamp,
    isFromUser,
  };
}

/**
 * Normalize a batch of Gmail messages
 */
export function normalizeGmailBatch(
  messages: GmailMessage[],
  userEmail?: string
): NormalizedMessage[] {
  return messages.map(msg => normalizeGmailMessage(msg, userEmail));
}
