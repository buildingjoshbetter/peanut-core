// Ingestion pipeline - orchestrates normalization, entity resolution, and storage

import { v4 as uuidv4 } from 'uuid';
import { getDb, transaction } from '../db/connection';
import type { NormalizedMessage, IngestResult, Entity } from '../types';
import type { GmailMessage, IMessageMessage, BatchIngestResult } from './types';
import { normalizeGmailBatch } from './gmail';
import { normalizeIMessageBatch } from './imessage';

/**
 * Find or create an entity from an identifier (email or phone)
 */
export function findOrCreateEntity(
  identifier: { email?: string; phone?: string; name?: string }
): string {
  const db = getDb();

  // Try to find by email first
  if (identifier.email) {
    const existing = db.prepare(`
      SELECT entity_id FROM entity_attributes
      WHERE attribute_type = 'email' AND attribute_value = ?
    `).get(identifier.email) as { entity_id: string } | undefined;

    if (existing) {
      return existing.entity_id;
    }
  }

  // Try to find by phone
  if (identifier.phone) {
    const existing = db.prepare(`
      SELECT entity_id FROM entity_attributes
      WHERE attribute_type = 'phone' AND attribute_value = ?
    `).get(identifier.phone) as { entity_id: string } | undefined;

    if (existing) {
      return existing.entity_id;
    }
  }

  // Create new entity
  const entityId = uuidv4();
  const canonicalName = identifier.name || identifier.email || identifier.phone || 'Unknown';

  db.prepare(`
    INSERT INTO entities (id, canonical_name, entity_type)
    VALUES (?, ?, 'person')
  `).run(entityId, canonicalName);

  // Add email attribute
  if (identifier.email) {
    db.prepare(`
      INSERT INTO entity_attributes (id, entity_id, attribute_type, attribute_value)
      VALUES (?, ?, 'email', ?)
    `).run(uuidv4(), entityId, identifier.email);
  }

  // Add phone attribute
  if (identifier.phone) {
    db.prepare(`
      INSERT INTO entity_attributes (id, entity_id, attribute_type, attribute_value)
      VALUES (?, ?, 'phone', ?)
    `).run(uuidv4(), entityId, identifier.phone);
  }

  // Add name as alias if we have email or phone as the canonical
  if (identifier.name && (identifier.email || identifier.phone)) {
    db.prepare(`
      INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value)
      VALUES (?, ?, 'alias', ?)
    `).run(uuidv4(), entityId, identifier.name);
  }

  return entityId;
}

/**
 * Store a normalized message in the database
 */
export function storeMessage(message: NormalizedMessage): {
  stored: boolean;
  messageId: string;
  senderEntityId?: string;
  recipientEntityIds: string[];
  entitiesCreated: number;
} {
  const db = getDb();

  // Check for duplicate
  const existing = db.prepare(`
    SELECT id FROM messages WHERE source_type = ? AND source_id = ?
  `).get(message.sourceType, message.sourceId) as { id: string } | undefined;

  if (existing) {
    return {
      stored: false,
      messageId: existing.id,
      recipientEntityIds: [],
      entitiesCreated: 0,
    };
  }

  let entitiesCreated = 0;
  const countBefore = (db.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number }).count;

  // Resolve sender entity
  let senderEntityId: string | undefined;
  if (message.sender.email || message.sender.phone) {
    senderEntityId = findOrCreateEntity(message.sender);
  }

  // Resolve recipient entities
  const recipientEntityIds: string[] = [];
  for (const recipient of message.recipients) {
    if (recipient.email || recipient.phone) {
      const entityId = findOrCreateEntity(recipient);
      recipientEntityIds.push(entityId);
    }
  }

  const countAfter = (db.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number }).count;
  entitiesCreated = countAfter - countBefore;

  // Store message
  const messageId = message.id;
  db.prepare(`
    INSERT INTO messages (
      id, source_type, source_id, thread_id,
      sender_entity_id, recipient_entity_ids,
      subject, body_text, body_html,
      timestamp, is_from_user
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    message.sourceType,
    message.sourceId,
    message.threadId ?? null,
    senderEntityId ?? null,
    JSON.stringify(recipientEntityIds),
    message.subject ?? null,
    message.bodyText,
    message.bodyHtml ?? null,
    message.timestamp.toISOString(),
    message.isFromUser ? 1 : 0
  );

  // Create or update graph edges between sender and recipients
  if (senderEntityId) {
    for (const recipientId of recipientEntityIds) {
      if (recipientId !== senderEntityId) {
        // Upsert edge
        db.prepare(`
          INSERT INTO graph_edges (id, from_entity_id, to_entity_id, edge_type, evidence_count, last_evidence_at)
          VALUES (?, ?, ?, 'communicates_with', 1, ?)
          ON CONFLICT(from_entity_id, to_entity_id, edge_type) DO UPDATE SET
            evidence_count = evidence_count + 1,
            last_evidence_at = excluded.last_evidence_at,
            strength = MIN(1.0, strength + 0.1)
        `).run(
          uuidv4(),
          senderEntityId,
          recipientId,
          message.timestamp.toISOString()
        );
      }
    }
  }

  return {
    stored: true,
    messageId,
    senderEntityId,
    recipientEntityIds,
    entitiesCreated,
  };
}

/**
 * Ingest a batch of normalized messages
 */
export function ingestNormalizedMessages(messages: NormalizedMessage[]): IngestResult {
  const result: IngestResult = {
    messagesIngested: 0,
    entitiesCreated: 0,
    entitiesMerged: 0,  // TODO: Implement merging in entity resolution
    assertionsCreated: 0,
    errors: [],
  };

  return transaction(() => {
    for (const message of messages) {
      try {
        const storeResult = storeMessage(message);

        if (storeResult.stored) {
          result.messagesIngested++;
          result.entitiesCreated += storeResult.entitiesCreated;
        }
        // Skip count not tracked in IngestResult - duplicates are silently skipped
      } catch (error) {
        const err = error as Error;
        result.errors.push({
          sourceId: message.sourceId,
          error: err.message,
        });
      }
    }

    return result;
  });
}

/**
 * Ingest Gmail messages
 */
export function ingestGmailMessages(
  messages: GmailMessage[],
  userEmail?: string
): BatchIngestResult {
  const normalized = normalizeGmailBatch(messages, userEmail);
  const result = ingestNormalizedMessages(normalized);

  return {
    sourceType: 'gmail',
    totalReceived: messages.length,
    successCount: result.messagesIngested,
    skipCount: messages.length - result.messagesIngested - result.errors.length,
    errorCount: result.errors.length,
    errors: result.errors,
    entitiesCreated: result.entitiesCreated,
    entitiesMerged: result.entitiesMerged,
  };
}

/**
 * Ingest iMessage messages
 */
export function ingestIMessages(
  messages: IMessageMessage[],
  userPhone?: string,
  userEmail?: string
): BatchIngestResult {
  const normalized = normalizeIMessageBatch(messages, userPhone, userEmail);
  const result = ingestNormalizedMessages(normalized);

  return {
    sourceType: 'imessage',
    totalReceived: messages.length,
    successCount: result.messagesIngested,
    skipCount: messages.length - result.messagesIngested - result.errors.length,
    errorCount: result.errors.length,
    errors: result.errors,
    entitiesCreated: result.entitiesCreated,
    entitiesMerged: result.entitiesMerged,
  };
}

/**
 * Get messages that haven't been processed yet
 */
export function getUnprocessedMessages(limit: number = 100): Array<{
  id: string;
  bodyText: string;
  senderEntityId?: string;
}> {
  const db = getDb();

  const rows = db.prepare(`
    SELECT id, body_text, sender_entity_id
    FROM messages
    WHERE processed = 0
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: string;
    body_text: string;
    sender_entity_id?: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    bodyText: row.body_text,
    senderEntityId: row.sender_entity_id,
  }));
}

/**
 * Mark messages as processed
 */
export function markMessagesProcessed(messageIds: string[]): void {
  if (messageIds.length === 0) return;

  const db = getDb();
  const placeholders = messageIds.map(() => '?').join(',');

  db.prepare(`
    UPDATE messages SET processed = 1 WHERE id IN (${placeholders})
  `).run(...messageIds);
}
