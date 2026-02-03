// Context Assembly for Response Synthesis
// Strategy Reference: Part 3
//
// Gathers all relevant context for response generation:
// - Entity information
// - Recent interactions
// - Commitments and deadlines
// - Screen context (from Skippy)

import { query } from '../db/connection';
import type { Entity, Assertion, Commitment, Goal } from '../types';
import { getGoalProgress } from '../goals/tracker';

// ============================================================
// TYPES
// ============================================================

export interface ContextBundle {
  /** Entity being discussed/addressed */
  primaryEntity?: EntityContext;
  /** Related entities */
  relatedEntities: EntityContext[];
  /** Relevant assertions about entities */
  relevantFacts: AssertionContext[];
  /** Open commitments involving these entities */
  commitments: CommitmentContext[];
  /** Related goals */
  goals: GoalContext[];
  /** Recent screen context (if available) */
  screenContext?: ScreenContext;
  /** Calendar context */
  calendarContext?: CalendarContext;
  /** Conversation context */
  conversationContext?: ConversationContext;
  /** Assembled at */
  assembledAt: Date;
  /** Time to assemble (ms) */
  assemblyTimeMs: number;
}

export interface EntityContext {
  entity: Entity;
  attributes: Record<string, string>;
  relationshipToUser?: string;
  lastInteraction?: Date;
  interactionCount: number;
  sentiment?: number;
}

export interface AssertionContext {
  assertion: Assertion;
  sourceDescription: string;
  age: string;  // "2 days ago", "3 weeks ago"
  confidence: number;
}

export interface CommitmentContext {
  commitment: Commitment;
  isOverdue: boolean;
  daysUntilDue?: number;
  ownerName?: string;
  counterpartyName?: string;
}

export interface GoalContext {
  goal: Goal;
  progress: number;
  isOverdue: boolean;
}

export interface ScreenContext {
  recentApps: string[];
  recentTitles: string[];
  relevantOcrText?: string;
}

export interface CalendarContext {
  upcomingEvents: Array<{
    title: string;
    startsIn: string;  // "in 30 minutes"
    attendees: string[];
  }>;
  recentEvents: Array<{
    title: string;
    wasAt: string;  // "2 hours ago"
    attendees: string[];
  }>;
}

export interface ConversationContext {
  threadLength: number;
  lastMessageAge: string;
  topicsDiscussed: string[];
  unresolved: string[];
}

// ============================================================
// CONTEXT ASSEMBLY
// ============================================================

/**
 * Assemble complete context for a response
 */
export function assembleContext(options: {
  entityIds?: string[];
  query?: string;
  threadId?: string;
  includeScreen?: boolean;
  includeCalendar?: boolean;
  limit?: number;
}): ContextBundle {
  const startTime = Date.now();
  const limit = options.limit || 10;

  const bundle: ContextBundle = {
    relatedEntities: [],
    relevantFacts: [],
    commitments: [],
    goals: [],
    assembledAt: new Date(),
    assemblyTimeMs: 0,
  };

  // Get primary entity if specified
  if (options.entityIds && options.entityIds.length > 0) {
    const primaryId = options.entityIds[0]!;
    bundle.primaryEntity = getEntityContext(primaryId);

    // Get related entities
    for (const id of options.entityIds.slice(1)) {
      const ctx = getEntityContext(id);
      if (ctx) {
        bundle.relatedEntities.push(ctx);
      }
    }
  }

  // Get relevant facts
  if (options.entityIds) {
    bundle.relevantFacts = getRelevantFacts(options.entityIds, limit);
  } else if (options.query) {
    bundle.relevantFacts = searchFacts(options.query, limit);
  }

  // Get commitments
  if (options.entityIds) {
    bundle.commitments = getCommitmentsContext(options.entityIds);
  }

  // Get goals
  if (options.entityIds) {
    bundle.goals = getGoalsContext(options.entityIds);
  }

  // Get conversation context if thread specified
  if (options.threadId) {
    bundle.conversationContext = getConversationContext(options.threadId);
  }

  bundle.assemblyTimeMs = Date.now() - startTime;
  return bundle;
}

/**
 * Get context for an entity
 */
function getEntityContext(entityId: string): EntityContext | undefined {
  const entityRows = query<{
    id: string;
    canonical_name: string;
    entity_type: string;
    created_at: string;
    updated_at: string;
    merge_history: string | null;
  }>(`
    SELECT * FROM entities WHERE id = ?
  `, [entityId]);

  if (entityRows.length === 0) return undefined;

  const entityRow = entityRows[0]!;
  const entity: Entity = {
    id: entityRow.id,
    canonicalName: entityRow.canonical_name,
    entityType: entityRow.entity_type as Entity['entityType'],
    createdAt: new Date(entityRow.created_at),
    updatedAt: new Date(entityRow.updated_at),
    mergeHistory: entityRow.merge_history ? JSON.parse(entityRow.merge_history) : [],
  };

  // Get attributes
  const attrRows = query<{
    attribute_type: string;
    attribute_value: string;
  }>(`
    SELECT attribute_type, attribute_value
    FROM entity_attributes
    WHERE entity_id = ?
  `, [entityId]);

  const attributes: Record<string, string> = {};
  for (const row of attrRows) {
    attributes[row.attribute_type] = row.attribute_value;
  }

  // Get interaction stats
  const statsRows = query<{
    count: number;
    last_interaction: string;
  }>(`
    SELECT
      COUNT(*) as count,
      MAX(timestamp) as last_interaction
    FROM messages
    WHERE sender_entity_id = ? OR recipient_entity_ids LIKE ?
  `, [entityId, `%${entityId}%`]);

  const stats = statsRows[0] || { count: 0, last_interaction: null };

  // Get relationship type from graph
  const relationshipRows = query<{ edge_type: string }>(`
    SELECT edge_type FROM graph_edges
    WHERE from_entity_id = ? OR to_entity_id = ?
    ORDER BY strength DESC
    LIMIT 1
  `, [entityId, entityId]);

  return {
    entity,
    attributes,
    relationshipToUser: relationshipRows[0]?.edge_type,
    lastInteraction: stats.last_interaction ? new Date(stats.last_interaction) : undefined,
    interactionCount: stats.count,
  };
}

/**
 * Get relevant facts for entities
 */
function getRelevantFacts(entityIds: string[], limit: number): AssertionContext[] {
  const placeholders = entityIds.map(() => '?').join(', ');

  const rows = query<{
    id: string;
    subject_entity_id: string | null;
    predicate: string;
    object_text: string | null;
    object_entity_id: string | null;
    confidence: number;
    source_type: string;
    source_id: string;
    source_timestamp: string | null;
    extracted_at: string;
  }>(`
    SELECT * FROM assertions
    WHERE subject_entity_id IN (${placeholders})
       OR object_entity_id IN (${placeholders})
    ORDER BY confidence DESC, extracted_at DESC
    LIMIT ?
  `, [...entityIds, ...entityIds, limit]);

  const now = Date.now();

  return rows.map(row => {
    const extractedAt = new Date(row.extracted_at);
    const ageMs = now - extractedAt.getTime();
    const age = formatAge(ageMs);

    return {
      assertion: {
        id: row.id,
        subjectEntityId: row.subject_entity_id ?? undefined,
        predicate: row.predicate,
        objectText: row.object_text ?? undefined,
        objectEntityId: row.object_entity_id ?? undefined,
        confidence: row.confidence,
        sourceType: row.source_type,
        sourceId: row.source_id,
        sourceTimestamp: row.source_timestamp ? new Date(row.source_timestamp) : undefined,
        extractedAt,
      },
      sourceDescription: `${row.source_type}`,
      age,
      confidence: row.confidence,
    };
  });
}

/**
 * Search facts by query
 */
function searchFacts(queryText: string, limit: number): AssertionContext[] {
  const rows = query<{
    id: string;
    subject_entity_id: string | null;
    predicate: string;
    object_text: string | null;
    object_entity_id: string | null;
    confidence: number;
    source_type: string;
    source_id: string;
    source_timestamp: string | null;
    extracted_at: string;
  }>(`
    SELECT * FROM assertions
    WHERE predicate LIKE ? OR object_text LIKE ?
    ORDER BY confidence DESC
    LIMIT ?
  `, [`%${queryText}%`, `%${queryText}%`, limit]);

  const now = Date.now();

  return rows.map(row => {
    const extractedAt = new Date(row.extracted_at);
    const ageMs = now - extractedAt.getTime();

    return {
      assertion: {
        id: row.id,
        subjectEntityId: row.subject_entity_id ?? undefined,
        predicate: row.predicate,
        objectText: row.object_text ?? undefined,
        objectEntityId: row.object_entity_id ?? undefined,
        confidence: row.confidence,
        sourceType: row.source_type,
        sourceId: row.source_id,
        sourceTimestamp: row.source_timestamp ? new Date(row.source_timestamp) : undefined,
        extractedAt,
      },
      sourceDescription: row.source_type,
      age: formatAge(ageMs),
      confidence: row.confidence,
    };
  });
}

/**
 * Get commitments involving entities
 */
function getCommitmentsContext(entityIds: string[]): CommitmentContext[] {
  const placeholders = entityIds.map(() => '?').join(', ');
  const now = new Date();

  const rows = query<{
    id: string;
    type: string;
    description: string;
    owner_entity_id: string | null;
    counterparty_entity_id: string | null;
    due_date: string | null;
    status: string;
    source_type: string | null;
    source_id: string | null;
    source_timestamp: string | null;
    created_at: string;
    completed_at: string | null;
    reminder_sent: number;
  }>(`
    SELECT * FROM commitments
    WHERE status = 'open'
      AND (owner_entity_id IN (${placeholders}) OR counterparty_entity_id IN (${placeholders}))
    ORDER BY due_date ASC NULLS LAST
  `, [...entityIds, ...entityIds]);

  return rows.map(row => {
    const dueDate = row.due_date ? new Date(row.due_date) : undefined;
    const isOverdue = dueDate ? dueDate < now : false;
    const daysUntilDue = dueDate
      ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    return {
      commitment: {
        id: row.id,
        type: row.type as Commitment['type'],
        description: row.description,
        ownerEntityId: row.owner_entity_id ?? undefined,
        counterpartyEntityId: row.counterparty_entity_id ?? undefined,
        dueDate,
        status: row.status as Commitment['status'],
        sourceType: row.source_type ?? undefined,
        sourceId: row.source_id ?? undefined,
        sourceTimestamp: row.source_timestamp ? new Date(row.source_timestamp) : undefined,
        createdAt: new Date(row.created_at),
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        reminderSent: Boolean(row.reminder_sent),
      },
      isOverdue,
      daysUntilDue,
    };
  });
}

/**
 * Get goals related to entities
 */
function getGoalsContext(entityIds: string[]): GoalContext[] {
  const now = new Date();

  // Get goals that mention these entities
  const rows = query<{
    id: string;
    description: string;
    goal_type: string;
    status: string;
    parent_goal_id: string | null;
    related_entities: string | null;
    created_at: string;
    target_date: string | null;
    completed_at: string | null;
  }>(`
    SELECT * FROM goals
    WHERE status = 'active'
    ORDER BY target_date ASC NULLS LAST
    LIMIT 10
  `, []);

  return rows
    .filter(row => {
      if (!row.related_entities) return false;
      const entities = JSON.parse(row.related_entities) as string[];
      return entityIds.some(id => entities.includes(id));
    })
    .map(row => {
      const targetDate = row.target_date ? new Date(row.target_date) : undefined;
      const isOverdue = targetDate ? targetDate < now : false;

      // Calculate actual progress using goals tracker
      const progressData = getGoalProgress(row.id);
      const progress = progressData?.progress ?? 0;

      return {
        goal: {
          id: row.id,
          description: row.description,
          goalType: row.goal_type as Goal['goalType'],
          status: row.status as Goal['status'],
          parentGoalId: row.parent_goal_id ?? undefined,
          relatedEntities: row.related_entities ? JSON.parse(row.related_entities) : undefined,
          createdAt: new Date(row.created_at),
          targetDate,
          completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        },
        progress,
        isOverdue,
      };
    });
}

/**
 * Get conversation context from thread
 */
function getConversationContext(threadId: string): ConversationContext {
  const messages = query<{
    id: string;
    timestamp: string;
    subject: string | null;
    body_text: string;
  }>(`
    SELECT id, timestamp, subject, body_text
    FROM messages
    WHERE thread_id = ?
    ORDER BY timestamp DESC
    LIMIT 20
  `, [threadId]);

  const now = Date.now();
  const lastMessage = messages[0];
  const lastMessageAge = lastMessage
    ? formatAge(now - new Date(lastMessage.timestamp).getTime())
    : 'unknown';

  // Extract topics (simple keyword extraction)
  const allText = messages.map(m => `${m.subject || ''} ${m.body_text}`).join(' ');
  const topics = extractTopics(allText);

  // Get unresolved contradictions from belief system
  const unresolvedRows = query<{ description: string }>(`
    SELECT
      'Conflicting info about ' || e.canonical_name || ': ' ||
      a1.predicate || ' differs between sources' as description
    FROM belief_contradictions bc
    JOIN assertions a1 ON bc.assertion1_id = a1.id
    LEFT JOIN entities e ON a1.subject_entity_id = e.id
    WHERE bc.resolution_status = 'unresolved'
    ORDER BY bc.detected_at DESC
    LIMIT 5
  `, []);

  const unresolved = unresolvedRows.map(r => r.description);

  return {
    threadLength: messages.length,
    lastMessageAge,
    topicsDiscussed: topics,
    unresolved,
  };
}

/**
 * Format age in human-readable form
 */
function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Extract topics from text (simple implementation)
 */
function extractTopics(text: string): string[] {
  const words = text.toLowerCase().split(/\W+/);
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
    'because', 'until', 'while', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our',
    'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their']);

  const wordCounts = new Map<string, number>();
  for (const word of words) {
    if (word.length < 3 || stopWords.has(word)) continue;
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }

  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * Format context bundle as text for LLM
 */
export function formatContextForLlm(bundle: ContextBundle): string {
  const sections: string[] = [];

  // Primary entity
  if (bundle.primaryEntity) {
    const e = bundle.primaryEntity;
    let section = `## About ${e.entity.canonicalName}\n`;
    if (e.relationshipToUser) section += `- Relationship: ${e.relationshipToUser}\n`;
    if (e.interactionCount > 0) section += `- Interactions: ${e.interactionCount}\n`;
    if (e.lastInteraction) section += `- Last contact: ${formatAge(Date.now() - e.lastInteraction.getTime())}\n`;

    for (const [key, value] of Object.entries(e.attributes)) {
      section += `- ${key}: ${value}\n`;
    }
    sections.push(section);
  }

  // Relevant facts
  if (bundle.relevantFacts.length > 0) {
    let section = '## Known Facts\n';
    for (const fact of bundle.relevantFacts.slice(0, 5)) {
      section += `- ${fact.assertion.predicate}: ${fact.assertion.objectText || 'N/A'} (${fact.age})\n`;
    }
    sections.push(section);
  }

  // Commitments
  if (bundle.commitments.length > 0) {
    let section = '## Open Commitments\n';
    for (const c of bundle.commitments.slice(0, 5)) {
      const dueStr = c.daysUntilDue !== undefined
        ? (c.isOverdue ? `OVERDUE by ${-c.daysUntilDue} days` : `due in ${c.daysUntilDue} days`)
        : 'no due date';
      section += `- [${c.commitment.type}] ${c.commitment.description} (${dueStr})\n`;
    }
    sections.push(section);
  }

  // Goals
  if (bundle.goals.length > 0) {
    let section = '## Related Goals\n';
    for (const g of bundle.goals.slice(0, 3)) {
      const status = g.isOverdue ? 'OVERDUE' : `${Math.round(g.progress * 100)}% complete`;
      section += `- ${g.goal.description} (${status})\n`;
    }
    sections.push(section);
  }

  return sections.join('\n');
}
