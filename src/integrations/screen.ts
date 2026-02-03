// Screen Memory Integration
// Strategy Reference: Integration Hooks
//
// Connects Skippy's screen capture (screen_memory.rs) to peanut-core's knowledge graph.
// Extracts entities and facts from OCR text.

import { v4 as uuid } from 'uuid';
import { execute, query } from '../db/connection';
import type { Entity, ExtractedEntity, ExtractedFact } from '../types';

// ============================================================
// TYPES (matching Skippy's ScreenMemoryEntry)
// ============================================================

export interface ScreenMemoryEntry {
  id: string;
  capturedAt: Date;
  appName: string;
  windowTitle: string;
  ocrText: string;
  screenshotPath?: string;
}

export interface ExtractedScreenContext {
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
  topics: string[];
  activityType: 'browsing' | 'document' | 'chat' | 'code' | 'email' | 'unknown';
  contextType: 'work' | 'personal' | 'unknown';
}

// ============================================================
// APP → CONTEXT MAPPING
// ============================================================

const APP_CONTEXT_MAP: Record<string, { activity: ExtractedScreenContext['activityType']; context: ExtractedScreenContext['contextType'] }> = {
  // Browsers
  'Safari': { activity: 'browsing', context: 'unknown' },
  'Google Chrome': { activity: 'browsing', context: 'unknown' },
  'Firefox': { activity: 'browsing', context: 'unknown' },
  'Arc': { activity: 'browsing', context: 'unknown' },

  // Development
  'Visual Studio Code': { activity: 'code', context: 'work' },
  'VS Code': { activity: 'code', context: 'work' },
  'Code': { activity: 'code', context: 'work' },
  'Xcode': { activity: 'code', context: 'work' },
  'Terminal': { activity: 'code', context: 'work' },
  'iTerm': { activity: 'code', context: 'work' },
  'iTerm2': { activity: 'code', context: 'work' },
  'Cursor': { activity: 'code', context: 'work' },

  // Communication
  'Slack': { activity: 'chat', context: 'work' },
  'Discord': { activity: 'chat', context: 'personal' },
  'Messages': { activity: 'chat', context: 'personal' },
  'WhatsApp': { activity: 'chat', context: 'personal' },
  'Telegram': { activity: 'chat', context: 'personal' },
  'Microsoft Teams': { activity: 'chat', context: 'work' },
  'Zoom': { activity: 'chat', context: 'work' },

  // Email
  'Mail': { activity: 'email', context: 'unknown' },
  'Gmail': { activity: 'email', context: 'unknown' },
  'Outlook': { activity: 'email', context: 'work' },
  'Superhuman': { activity: 'email', context: 'work' },

  // Documents
  'Microsoft Word': { activity: 'document', context: 'work' },
  'Pages': { activity: 'document', context: 'unknown' },
  'Google Docs': { activity: 'document', context: 'unknown' },
  'Notion': { activity: 'document', context: 'work' },
  'Obsidian': { activity: 'document', context: 'personal' },
  'Notes': { activity: 'document', context: 'personal' },
  'Preview': { activity: 'document', context: 'unknown' },
};

// ============================================================
// INGESTION
// ============================================================

/**
 * Ingest a screen capture entry into peanut-core
 */
export async function ingestScreenContext(entry: ScreenMemoryEntry): Promise<{
  extractedContext: ExtractedScreenContext;
  entitiesCreated: number;
  factsCreated: number;
}> {
  // 1. Determine activity and context type from app
  const appInfo = APP_CONTEXT_MAP[entry.appName] || { activity: 'unknown' as const, context: 'unknown' as const };

  // 2. Extract entities from OCR text
  const entities = extractEntitiesFromOcr(entry.ocrText, entry.appName);

  // 3. Extract topics
  const topics = extractTopics(entry.ocrText + ' ' + entry.windowTitle);

  // 4. Infer context from window title
  let contextType = appInfo.context;
  if (contextType === 'unknown') {
    contextType = inferContextFromTitle(entry.windowTitle);
  }

  const extractedContext: ExtractedScreenContext = {
    entities,
    facts: [],  // Facts would need LLM extraction
    topics,
    activityType: appInfo.activity,
    contextType,
  };

  // 5. Store in screen_captures table
  execute(`
    INSERT OR REPLACE INTO screen_captures (
      id, timestamp, app, window_title, screenshot_path,
      ocr_text, entities, activity_type, context_type,
      ocr_complete, embedding_complete
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    entry.id,
    entry.capturedAt.toISOString(),
    entry.appName,
    entry.windowTitle,
    entry.screenshotPath || null,
    entry.ocrText,
    JSON.stringify(entities.map(e => e.name)),
    appInfo.activity,
    contextType,
    true,
    false,
  ]);

  // 6. Create entities in knowledge graph
  let entitiesCreated = 0;
  for (const extracted of entities) {
    const created = await createOrUpdateEntity(extracted, entry.id);
    if (created) entitiesCreated++;
  }

  return {
    extractedContext,
    entitiesCreated,
    factsCreated: 0,
  };
}

/**
 * Extract entities from OCR text
 */
export function extractEntitiesFromOcr(ocrText: string, appName: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  // 1. Extract email addresses
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = ocrText.match(emailPattern) || [];
  for (const email of emails) {
    const namePart = email.split('@')[0]!;
    const name = namePart
      .replace(/[._]/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    entities.push({
      name,
      type: 'person',
      attributes: { email },
      confidence: 0.7,
    });
  }

  // 2. Extract URLs (for org entities)
  const urlPattern = /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+)\.[a-zA-Z]{2,}/g;
  const urls = ocrText.match(urlPattern) || [];
  const seenDomains = new Set<string>();
  for (const url of urls) {
    const match = url.match(/https?:\/\/(?:www\.)?([a-zA-Z0-9-]+)\./);
    if (match && match[1]) {
      const domain = match[1];
      if (!seenDomains.has(domain) && domain.length > 2) {
        seenDomains.add(domain);
        entities.push({
          name: domain.charAt(0).toUpperCase() + domain.slice(1),
          type: 'org',
          attributes: { website: url },
          confidence: 0.5,
        });
      }
    }
  }

  // 3. Extract names from chat/email context
  if (['Slack', 'Messages', 'Discord', 'Mail', 'Gmail'].includes(appName)) {
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:\s+(?:wrote|said|sent|replied|commented|mentioned))?\b/g;
    const names = ocrText.match(namePattern) || [];
    const seenNames = new Set<string>();

    for (const name of names.slice(0, 5)) {  // Limit to avoid noise
      const cleanName = name.replace(/\s+(wrote|said|sent|replied|commented|mentioned)$/i, '').trim();
      if (cleanName.length > 2 && cleanName.length < 50 && !seenNames.has(cleanName.toLowerCase())) {
        seenNames.add(cleanName.toLowerCase());
        entities.push({
          name: cleanName,
          type: 'person',
          attributes: {},
          confidence: 0.4,
        });
      }
    }
  }

  // 4. Extract company names from code/work context
  if (['code', 'document'].includes(APP_CONTEXT_MAP[appName]?.activity || '')) {
    // Look for common patterns like "Copyright 2024 Company" or "Company Inc"
    const companyPattern = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:Inc|LLC|Corp|Ltd|Company|Co)\b/g;
    const companies = ocrText.match(companyPattern) || [];
    for (const company of companies.slice(0, 3)) {
      entities.push({
        name: company.replace(/\s+(?:Inc|LLC|Corp|Ltd|Company|Co)$/i, '').trim(),
        type: 'org',
        attributes: {},
        confidence: 0.6,
      });
    }
  }

  return deduplicateEntities(entities);
}

/**
 * Deduplicate entities by name similarity
 */
function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const seen = new Map<string, ExtractedEntity>();

  for (const entity of entities) {
    const key = entity.name.toLowerCase();
    const existing = seen.get(key);

    if (!existing || entity.confidence > existing.confidence) {
      seen.set(key, entity);
    }
  }

  return Array.from(seen.values());
}

/**
 * Extract topics from text
 */
function extractTopics(text: string): string[] {
  const words = text.toLowerCase().split(/\W+/);
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'but',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'this', 'that', 'it']);

  const wordCounts = new Map<string, number>();
  for (const word of words) {
    if (word.length < 3 || stopWords.has(word)) continue;
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }

  return Array.from(wordCounts.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

/**
 * Infer context type from window title
 */
function inferContextFromTitle(title: string): 'work' | 'personal' | 'unknown' {
  const lowerTitle = title.toLowerCase();

  // Work indicators
  const workIndicators = [
    'slack', 'jira', 'confluence', 'github', 'gitlab', 'linear',
    'figma', 'notion', 'asana', 'trello', 'monday', 'zoom',
    'meeting', 'standup', 'sprint', 'pull request', 'pr #',
  ];

  // Personal indicators
  const personalIndicators = [
    'youtube', 'netflix', 'spotify', 'twitter', 'facebook', 'instagram',
    'reddit', 'news', 'shopping', 'amazon', 'ebay',
  ];

  for (const indicator of workIndicators) {
    if (lowerTitle.includes(indicator)) return 'work';
  }

  for (const indicator of personalIndicators) {
    if (lowerTitle.includes(indicator)) return 'personal';
  }

  return 'unknown';
}

/**
 * Create or update entity in database
 */
async function createOrUpdateEntity(extracted: ExtractedEntity, sourceId: string): Promise<boolean> {
  // Check if entity already exists (by email or name)
  let existingId: string | null = null;

  if (extracted.attributes.email) {
    const rows = query<{ entity_id: string }>(`
      SELECT entity_id FROM entity_attributes
      WHERE attribute_type = 'email' AND attribute_value = ?
    `, [extracted.attributes.email]);

    if (rows.length > 0) {
      existingId = rows[0]!.entity_id;
    }
  }

  if (!existingId) {
    const rows = query<{ id: string }>(`
      SELECT id FROM entities
      WHERE LOWER(canonical_name) = LOWER(?)
    `, [extracted.name]);

    if (rows.length > 0) {
      existingId = rows[0]!.id;
    }
  }

  if (existingId) {
    // Update existing entity with new attributes
    for (const [attrType, attrValue] of Object.entries(extracted.attributes)) {
      execute(`
        INSERT OR IGNORE INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [uuid(), existingId, attrType, attrValue, extracted.confidence]);
    }
    return false;
  }

  // Create new entity
  const entityId = uuid();
  execute(`
    INSERT INTO entities (id, canonical_name, entity_type, created_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [entityId, extracted.name, extracted.type]);

  // Add attributes
  for (const [attrType, attrValue] of Object.entries(extracted.attributes)) {
    execute(`
      INSERT INTO entity_attributes (id, entity_id, attribute_type, attribute_value, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [uuid(), entityId, attrType, attrValue, extracted.confidence]);
  }

  return true;
}

// ============================================================
// SEARCH
// ============================================================

/**
 * Search screen captures
 */
export function searchScreenCaptures(options: {
  query?: string;
  app?: string;
  contextType?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}): Array<{
  id: string;
  timestamp: Date;
  app: string;
  windowTitle: string;
  ocrText: string;
  activityType: string;
  contextType: string;
}> {
  let sql = 'SELECT * FROM screen_captures WHERE 1=1';
  const params: unknown[] = [];

  if (options.query) {
    sql += ' AND (ocr_text LIKE ? OR window_title LIKE ?)';
    params.push(`%${options.query}%`, `%${options.query}%`);
  }

  if (options.app) {
    sql += ' AND app = ?';
    params.push(options.app);
  }

  if (options.contextType) {
    sql += ' AND context_type = ?';
    params.push(options.contextType);
  }

  if (options.fromDate) {
    sql += ' AND timestamp >= ?';
    params.push(options.fromDate.toISOString());
  }

  if (options.toDate) {
    sql += ' AND timestamp <= ?';
    params.push(options.toDate.toISOString());
  }

  sql += ' ORDER BY timestamp DESC';

  if (options.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = query<{
    id: string;
    timestamp: string;
    app: string;
    window_title: string;
    ocr_text: string;
    activity_type: string;
    context_type: string;
  }>(sql, params);

  return rows.map(row => ({
    id: row.id,
    timestamp: new Date(row.timestamp),
    app: row.app,
    windowTitle: row.window_title,
    ocrText: row.ocr_text,
    activityType: row.activity_type,
    contextType: row.context_type,
  }));
}

/**
 * Get recent screen context for LLM
 */
export function getRecentScreenContext(hours: number = 2): string {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - hours);

  const captures = searchScreenCaptures({
    fromDate: cutoff,
    limit: 20,
  });

  if (captures.length === 0) return '';

  const lines = ['Recent screen activity:'];
  const seenTitles = new Set<string>();

  for (const capture of captures) {
    const key = `${capture.app}:${capture.windowTitle}`;
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);

    const ago = formatAgo(capture.timestamp);
    lines.push(`- ${ago}: ${capture.app} - "${capture.windowTitle}"`);
  }

  return lines.join('\n');
}

function formatAgo(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
