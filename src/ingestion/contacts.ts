// Contact Ingestion
// Strategy Reference: Part 3 - Data Sources
//
// Seeds the entity graph from contacts before messages arrive.
// Merges with existing entities by email/phone.

import { v4 as uuid } from 'uuid';
import { getDb } from '../db/connection';
import { nameSimilarity } from '../entity/matcher';

// ============================================================
// TYPES
// ============================================================

export interface ContactInput {
  /** External source ID (e.g., Google Contacts ID, Apple Contacts ID) */
  sourceId: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Email addresses */
  emails: string[];
  /** Phone numbers */
  phones: string[];
  /** Company/organization */
  company?: string;
  /** Job title */
  title?: string;
  /** Notes about the contact */
  notes?: string;
  /** Birthday */
  birthday?: Date;
  /** Profile photo URL */
  photoUrl?: string;
  /** Custom labels (e.g., "VIP", "Family") */
  labels?: string[];
}

export interface ContactIngestResult {
  /** The entity ID (new or existing) */
  entityId: string;
  /** Whether a new entity was created */
  created: boolean;
  /** Whether an existing entity was updated */
  updated: boolean;
  /** Merge info if merged with existing entity */
  mergedWith?: string;
}

export interface BatchContactIngestResult {
  /** Total contacts received */
  totalReceived: number;
  /** New entities created */
  entitiesCreated: number;
  /** Existing entities updated */
  entitiesUpdated: number;
  /** Contacts merged with existing entities */
  entitiesMerged: number;
  /** Errors encountered */
  errors: Array<{ sourceId: string; error: string }>;
}

// ============================================================
// INGESTION
// ============================================================

/**
 * Ingest a single contact
 */
export function ingestContact(contact: ContactInput): ContactIngestResult {
  const db = getDb();

  // Build canonical name
  const canonicalName = buildCanonicalName(contact);

  // Try to find existing entity by email
  for (const email of contact.emails) {
    const existing = db.prepare(`
      SELECT entity_id FROM entity_attributes
      WHERE attribute_type = 'email' AND LOWER(attribute_value) = LOWER(?)
    `).get(email) as { entity_id: string } | undefined;

    if (existing) {
      updateEntity(existing.entity_id, contact);
      return {
        entityId: existing.entity_id,
        created: false,
        updated: true,
        mergedWith: existing.entity_id,
      };
    }
  }

  // Try to find existing entity by phone
  for (const phone of contact.phones) {
    const normalized = normalizePhone(phone);
    const existing = db.prepare(`
      SELECT entity_id FROM entity_attributes
      WHERE attribute_type = 'phone' AND REPLACE(REPLACE(REPLACE(attribute_value, '-', ''), ' ', ''), '(', '') LIKE ?
    `).get(`%${normalized}%`) as { entity_id: string } | undefined;

    if (existing) {
      updateEntity(existing.entity_id, contact);
      return {
        entityId: existing.entity_id,
        created: false,
        updated: true,
        mergedWith: existing.entity_id,
      };
    }
  }

  // Try to find by name similarity (high threshold)
  if (canonicalName && canonicalName !== 'Unknown') {
    const candidates = db.prepare(`
      SELECT id, canonical_name FROM entities
      WHERE entity_type = 'person'
    `).all() as Array<{ id: string; canonical_name: string }>;

    for (const candidate of candidates) {
      const similarity = nameSimilarity(canonicalName, candidate.canonical_name);
      if (similarity > 0.9) {
        // Very high match - likely same person
        updateEntity(candidate.id, contact);
        return {
          entityId: candidate.id,
          created: false,
          updated: true,
          mergedWith: candidate.id,
        };
      }
    }
  }

  // Create new entity
  const entityId = uuid();

  db.prepare(`
    INSERT INTO entities (id, canonical_name, entity_type, created_at, updated_at)
    VALUES (?, ?, 'person', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(entityId, canonicalName);

  // Add attributes
  addContactAttributes(entityId, contact);

  return {
    entityId,
    created: true,
    updated: false,
  };
}

/**
 * Ingest multiple contacts
 */
export function ingestContactBatch(contacts: ContactInput[]): BatchContactIngestResult {
  const result: BatchContactIngestResult = {
    totalReceived: contacts.length,
    entitiesCreated: 0,
    entitiesUpdated: 0,
    entitiesMerged: 0,
    errors: [],
  };

  for (const contact of contacts) {
    try {
      const ingestResult = ingestContact(contact);

      if (ingestResult.created) {
        result.entitiesCreated++;
      } else if (ingestResult.updated) {
        result.entitiesUpdated++;
        if (ingestResult.mergedWith) {
          result.entitiesMerged++;
        }
      }
    } catch (error) {
      const err = error as Error;
      result.errors.push({
        sourceId: contact.sourceId,
        error: err.message,
      });
    }
  }

  return result;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Build canonical name from contact
 */
function buildCanonicalName(contact: ContactInput): string {
  if (contact.firstName && contact.lastName) {
    return `${contact.firstName} ${contact.lastName}`;
  }
  if (contact.firstName) return contact.firstName;
  if (contact.lastName) return contact.lastName;
  if (contact.emails.length > 0) {
    // Extract name from email
    const email = contact.emails[0]!;
    const localPart = email.split('@')[0]!;
    return localPart
      .replace(/[._]/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return 'Unknown';
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);  // Last 10 digits
}

/**
 * Update an existing entity with contact info
 */
function updateEntity(entityId: string, contact: ContactInput): void {
  const db = getDb();

  // Update canonical name if we have a better one
  const canonicalName = buildCanonicalName(contact);
  if (canonicalName !== 'Unknown') {
    const existing = db.prepare('SELECT canonical_name FROM entities WHERE id = ?')
      .get(entityId) as { canonical_name: string } | undefined;

    if (existing && (existing.canonical_name === 'Unknown' || !existing.canonical_name.includes(' '))) {
      // Upgrade name if current is less complete
      db.prepare(`
        UPDATE entities SET canonical_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(canonicalName, entityId);
    }
  }

  // Add new attributes
  addContactAttributes(entityId, contact);
}

/**
 * Add contact attributes to entity
 */
function addContactAttributes(entityId: string, contact: ContactInput): void {
  const db = getDb();

  // Add emails
  for (const email of contact.emails) {
    db.prepare(`
      INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
      VALUES (?, ?, 'email', ?, 0.95, CURRENT_TIMESTAMP)
    `).run(uuid(), entityId, email.toLowerCase());
  }

  // Add phones
  for (const phone of contact.phones) {
    db.prepare(`
      INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
      VALUES (?, ?, 'phone', ?, 0.95, CURRENT_TIMESTAMP)
    `).run(uuid(), entityId, phone);
  }

  // Add company
  if (contact.company) {
    db.prepare(`
      INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
      VALUES (?, ?, 'company', ?, 0.9, CURRENT_TIMESTAMP)
    `).run(uuid(), entityId, contact.company);
  }

  // Add title
  if (contact.title) {
    db.prepare(`
      INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
      VALUES (?, ?, 'title', ?, 0.9, CURRENT_TIMESTAMP)
    `).run(uuid(), entityId, contact.title);
  }

  // Add birthday
  if (contact.birthday) {
    db.prepare(`
      INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
      VALUES (?, ?, 'birthday', ?, 0.95, CURRENT_TIMESTAMP)
    `).run(uuid(), entityId, contact.birthday.toISOString().slice(0, 10));
  }

  // Add photo URL
  if (contact.photoUrl) {
    db.prepare(`
      INSERT OR REPLACE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
      VALUES (?, ?, 'photo_url', ?, 0.95, CURRENT_TIMESTAMP)
    `).run(uuid(), entityId, contact.photoUrl);
  }

  // Add labels
  if (contact.labels && contact.labels.length > 0) {
    for (const label of contact.labels) {
      db.prepare(`
        INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
        VALUES (?, ?, 'label', ?, 0.9, CURRENT_TIMESTAMP)
      `).run(uuid(), entityId, label);
    }
  }

  // Add notes
  if (contact.notes) {
    db.prepare(`
      INSERT OR REPLACE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
      VALUES (?, ?, 'notes', ?, 0.9, CURRENT_TIMESTAMP)
    `).run(uuid(), entityId, contact.notes);
  }

  // Add first/last name as separate attributes
  if (contact.firstName) {
    db.prepare(`
      INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
      VALUES (?, ?, 'first_name', ?, 0.95, CURRENT_TIMESTAMP)
    `).run(uuid(), entityId, contact.firstName);
  }

  if (contact.lastName) {
    db.prepare(`
      INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
      VALUES (?, ?, 'last_name', ?, 0.95, CURRENT_TIMESTAMP)
    `).run(uuid(), entityId, contact.lastName);
  }
}

/**
 * Get contacts that have been synced but need updates
 */
export function getContactsNeedingSync(olderThanDays: number = 30): Array<{
  entityId: string;
  canonicalName: string;
  lastUpdated: Date;
}> {
  const db = getDb();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const rows = db.prepare(`
    SELECT id, canonical_name, updated_at
    FROM entities
    WHERE entity_type = 'person'
      AND updated_at < ?
    ORDER BY updated_at ASC
    LIMIT 100
  `).all(cutoff.toISOString()) as Array<{
    id: string;
    canonical_name: string;
    updated_at: string;
  }>;

  return rows.map(row => ({
    entityId: row.id,
    canonicalName: row.canonical_name,
    lastUpdated: new Date(row.updated_at),
  }));
}

/**
 * Get entity attributes for export
 */
export function getContactAttributes(entityId: string): ContactInput | null {
  const db = getDb();

  const entity = db.prepare('SELECT canonical_name FROM entities WHERE id = ?')
    .get(entityId) as { canonical_name: string } | undefined;

  if (!entity) return null;

  const attributes = db.prepare(`
    SELECT attribute_type, attribute_value FROM entity_attributes WHERE entity_id = ?
  `).all(entityId) as Array<{ attribute_type: string; attribute_value: string }>;

  const contact: ContactInput = {
    sourceId: entityId,
    emails: [],
    phones: [],
    labels: [],
  };

  for (const attr of attributes) {
    switch (attr.attribute_type) {
      case 'email':
        contact.emails.push(attr.attribute_value);
        break;
      case 'phone':
        contact.phones.push(attr.attribute_value);
        break;
      case 'company':
        contact.company = attr.attribute_value;
        break;
      case 'title':
        contact.title = attr.attribute_value;
        break;
      case 'first_name':
        contact.firstName = attr.attribute_value;
        break;
      case 'last_name':
        contact.lastName = attr.attribute_value;
        break;
      case 'notes':
        contact.notes = attr.attribute_value;
        break;
      case 'photo_url':
        contact.photoUrl = attr.attribute_value;
        break;
      case 'label':
        contact.labels!.push(attr.attribute_value);
        break;
      case 'birthday':
        contact.birthday = new Date(attr.attribute_value);
        break;
    }
  }

  return contact;
}
