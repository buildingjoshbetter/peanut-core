// Citation Generation for Response Synthesis
// Strategy Reference: Part 3
//
// Generates citations linking assertions to their sources.
// E.g., "[email from Jake, Jan 15]" style references.

import { query } from '../db/connection';

// ============================================================
// TYPES
// ============================================================

export interface Citation {
  id: string;
  text: string;           // The formatted citation text
  sourceType: string;     // 'email', 'imessage', 'manual', etc.
  sourceId: string;       // Original source ID
  timestamp?: Date;
  entityNames: string[];  // People/entities involved
  confidence: number;
}

export interface CitedAssertion {
  fact: string;           // The assertion text
  citations: Citation[];
}

export type CitationStyle = 'inline' | 'footnote' | 'parenthetical';

// ============================================================
// CITATION GENERATION
// ============================================================

/**
 * Generate citation for an assertion
 */
export function generateCitation(
  assertionId: string,
  style: CitationStyle = 'inline'
): Citation | null {
  // Get assertion with source info
  const rows = query<{
    id: string;
    predicate: string;
    object_text: string | null;
    confidence: number;
    source_type: string;
    source_id: string;
    source_timestamp: string | null;
  }>(`
    SELECT * FROM assertions WHERE id = ?
  `, [assertionId]);

  if (rows.length === 0) return null;

  const assertion = rows[0]!;

  // Get source details
  const sourceDetails = getSourceDetails(assertion.source_type, assertion.source_id);

  // Format citation text based on style
  const citationText = formatCitation(
    assertion.source_type,
    sourceDetails,
    assertion.source_timestamp ? new Date(assertion.source_timestamp) : undefined,
    style
  );

  return {
    id: assertionId,
    text: citationText,
    sourceType: assertion.source_type,
    sourceId: assertion.source_id,
    timestamp: assertion.source_timestamp ? new Date(assertion.source_timestamp) : undefined,
    entityNames: sourceDetails.entityNames,
    confidence: assertion.confidence,
  };
}

/**
 * Get details about a source
 */
function getSourceDetails(
  sourceType: string,
  sourceId: string
): { description: string; entityNames: string[] } {
  switch (sourceType) {
    case 'gmail':
    case 'email': {
      const msgRows = query<{
        sender_entity_id: string | null;
        subject: string | null;
        timestamp: string;
      }>(`
        SELECT sender_entity_id, subject, timestamp FROM messages WHERE id = ?
      `, [sourceId]);

      if (msgRows.length === 0) {
        return { description: 'email', entityNames: [] };
      }

      const msg = msgRows[0]!;
      const entityNames: string[] = [];

      // Get sender name
      if (msg.sender_entity_id) {
        const entityRows = query<{ canonical_name: string }>(`
          SELECT canonical_name FROM entities WHERE id = ?
        `, [msg.sender_entity_id]);

        if (entityRows.length > 0) {
          entityNames.push(entityRows[0]!.canonical_name);
        }
      }

      const subject = msg.subject ? `: "${truncate(msg.subject, 30)}"` : '';
      return {
        description: `email${subject}`,
        entityNames,
      };
    }

    case 'imessage':
    case 'message': {
      const msgRows = query<{
        sender_entity_id: string | null;
        timestamp: string;
      }>(`
        SELECT sender_entity_id, timestamp FROM messages WHERE id = ?
      `, [sourceId]);

      if (msgRows.length === 0) {
        return { description: 'message', entityNames: [] };
      }

      const msg = msgRows[0]!;
      const entityNames: string[] = [];

      if (msg.sender_entity_id) {
        const entityRows = query<{ canonical_name: string }>(`
          SELECT canonical_name FROM entities WHERE id = ?
        `, [msg.sender_entity_id]);

        if (entityRows.length > 0) {
          entityNames.push(entityRows[0]!.canonical_name);
        }
      }

      return {
        description: 'message',
        entityNames,
      };
    }

    case 'manual':
      return { description: 'manually added', entityNames: [] };

    case 'calendar':
      return { description: 'calendar event', entityNames: [] };

    case 'screen':
      return { description: 'screen capture', entityNames: [] };

    default:
      return { description: sourceType, entityNames: [] };
  }
}

/**
 * Format citation text based on style
 */
function formatCitation(
  sourceType: string,
  sourceDetails: { description: string; entityNames: string[] },
  timestamp: Date | undefined,
  style: CitationStyle
): string {
  const dateStr = timestamp ? formatDate(timestamp) : '';
  const entityStr = sourceDetails.entityNames.length > 0
    ? `from ${sourceDetails.entityNames[0]}`
    : '';

  const parts = [sourceDetails.description, entityStr, dateStr].filter(Boolean);
  const content = parts.join(', ');

  switch (style) {
    case 'inline':
      return `[${content}]`;
    case 'footnote':
      return `[^${content}]`;
    case 'parenthetical':
      return `(${content})`;
    default:
      return `[${content}]`;
  }
}

/**
 * Format date for citation
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  // Format as "Jan 15"
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Truncate string
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// ============================================================
// BATCH OPERATIONS
// ============================================================

/**
 * Generate citations for multiple assertions
 */
export function generateCitations(
  assertionIds: string[],
  style: CitationStyle = 'inline'
): Map<string, Citation> {
  const citations = new Map<string, Citation>();

  for (const id of assertionIds) {
    const citation = generateCitation(id, style);
    if (citation) {
      citations.set(id, citation);
    }
  }

  return citations;
}

/**
 * Add citations to text containing assertion references
 */
export function addCitationsToText(
  text: string,
  assertionIds: string[],
  style: CitationStyle = 'inline'
): string {
  const citations = generateCitations(assertionIds, style);
  let result = text;

  // Replace assertion ID placeholders with citations
  for (const [id, citation] of citations) {
    const placeholder = `{{cite:${id}}}`;
    result = result.replace(placeholder, citation.text);
  }

  return result;
}

/**
 * Group assertions by source for cleaner citations
 */
export function groupBySource(
  assertionIds: string[]
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  const rows = query<{
    id: string;
    source_type: string;
    source_id: string;
  }>(`
    SELECT id, source_type, source_id FROM assertions
    WHERE id IN (${assertionIds.map(() => '?').join(', ')})
  `, assertionIds);

  for (const row of rows) {
    const key = `${row.source_type}:${row.source_id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(row.id);
  }

  return groups;
}

/**
 * Generate a summary citation for multiple assertions from same source
 */
export function generateGroupCitation(
  assertionIds: string[],
  style: CitationStyle = 'inline'
): Citation | null {
  if (assertionIds.length === 0) return null;

  // Get first assertion's source info
  const firstCitation = generateCitation(assertionIds[0]!, style);
  if (!firstCitation) return null;

  if (assertionIds.length === 1) return firstCitation;

  // Modify text to indicate multiple facts
  const baseText = firstCitation.text.slice(1, -1);  // Remove brackets
  const newText = `[${baseText}, ${assertionIds.length} facts]`;

  return {
    ...firstCitation,
    text: newText,
  };
}

/**
 * Verify citation still valid (source exists)
 */
export function verifyCitation(citation: Citation): boolean {
  const rows = query<{ id: string }>(`
    SELECT id FROM messages WHERE id = ?
    UNION
    SELECT id FROM assertions WHERE id = ?
  `, [citation.sourceId, citation.sourceId]);

  return rows.length > 0;
}

/**
 * Get all citations for an entity
 */
export function getCitationsForEntity(entityId: string): Citation[] {
  const rows = query<{ id: string }>(`
    SELECT id FROM assertions
    WHERE subject_entity_id = ? OR object_entity_id = ?
    ORDER BY source_timestamp DESC
    LIMIT 20
  `, [entityId, entityId]);

  const citations: Citation[] = [];
  for (const row of rows) {
    const citation = generateCitation(row.id);
    if (citation) {
      citations.push(citation);
    }
  }

  return citations;
}
