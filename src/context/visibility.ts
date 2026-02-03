// Context Visibility Rules
// Strategy Reference: Part 8, lines 643-648
//
// Applies visibility rules to filter search results and assertions
// based on the current context.

import { getDb, query } from '../db/connection';
import { getActiveContext, canSeeContext, getContext } from './boundaries';
import type { Assertion, SearchResult, Entity } from '../types';

/**
 * Filter search results by context visibility
 */
export function filterByContext<T extends SearchResult>(
  results: T[],
  sessionId: string
): T[] {
  const activeContext = getActiveContext(sessionId);
  if (!activeContext) {
    // No active context = return all results (permissive default)
    return results;
  }

  const viewerContext = activeContext.currentContext;

  return results.filter(result => {
    // Check if the result has a context
    if (result.type === 'assertion') {
      const assertion = result.data as Assertion & { contextId?: string };
      if (!assertion.contextId) return true;  // No context = visible

      // Check visibility scope
      const visibility = getAssertionVisibility(result.id);
      if (visibility === 'global') return true;
      if (visibility === 'private') return false;

      // Check context access
      return canSeeContext(viewerContext, assertion.contextId);
    }

    if (result.type === 'entity') {
      // Entities are visible if any of their contexts are visible
      const entity = result.data as Entity;
      const entityContexts = getEntityContextsForVisibility(entity.id);

      if (entityContexts.length === 0) return true;  // No contexts = visible

      return entityContexts.some(ctx =>
        canSeeContext(viewerContext, ctx.contextName)
      );
    }

    // Messages: check sender/recipient context
    if (result.type === 'message') {
      // Messages are generally visible, but we could filter by participant contexts
      return true;
    }

    return true;
  });
}

/**
 * Get assertion visibility scope
 */
function getAssertionVisibility(assertionId: string): 'private' | 'context_only' | 'global' {
  const row = getDb().prepare(`
    SELECT visibility_scope
    FROM assertion_visibility
    WHERE assertion_id = ?
  `).get(assertionId) as { visibility_scope: string } | undefined;

  return (row?.visibility_scope as 'private' | 'context_only' | 'global') ?? 'global';
}

/**
 * Get entity contexts for visibility checking
 */
function getEntityContextsForVisibility(entityId: string): Array<{
  contextName: string;
  confidence: number;
}> {
  return query<{
    context_name: string;
    confidence: number;
  }>(`
    SELECT cb.context_name, ecm.confidence
    FROM entity_context_membership ecm
    JOIN context_boundaries cb ON ecm.context_id = cb.id
    WHERE ecm.entity_id = ?
  `, [entityId]).map(row => ({
    contextName: row.context_name,
    confidence: row.confidence,
  }));
}

/**
 * Set visibility for an assertion
 */
export function setAssertionVisibility(
  assertionId: string,
  contextId: string,
  scope: 'private' | 'context_only' | 'global' = 'context_only'
): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO assertion_visibility
    (assertion_id, context_id, visibility_scope)
    VALUES (?, ?, ?)
  `).run(assertionId, contextId, scope);
}

/**
 * Apply context-appropriate style adjustments
 */
export function getStyleAdjustmentsForContext(contextName: string): {
  formalityFloor: number;
  professionalismRequired: boolean;
  humorAllowed: boolean;
} {
  const context = getContext(contextName);

  return {
    formalityFloor: context?.formalityFloor ?? 0.5,
    professionalismRequired: context?.professionalismRequired ?? false,
    humorAllowed: context?.humorAllowed ?? true,
  };
}

/**
 * Ensure style respects context boundaries
 */
export function enforceContextStyle(
  proposedStyle: { formality: number; humor: number },
  contextName: string
): { formality: number; humor: number } {
  const adjustments = getStyleAdjustmentsForContext(contextName);

  return {
    formality: Math.max(proposedStyle.formality, adjustments.formalityFloor),
    humor: adjustments.humorAllowed ? proposedStyle.humor : 0,
  };
}

/**
 * Check if information should be leaked between contexts
 * (Critical: This is the main privacy guard)
 */
export function shouldBlockCrossContextLeak(
  fromContext: string,
  toContext: string,
  sensitivityLevel: 'low' | 'medium' | 'high' = 'medium'
): boolean {
  // Same context = never block
  if (fromContext === toContext) return false;

  // Check explicit visibility policy
  if (canSeeContext(toContext, fromContext)) return false;

  // Block all cross-context leaks for high sensitivity
  if (sensitivityLevel === 'high') return true;

  // For medium sensitivity, block work <-> personal
  if (sensitivityLevel === 'medium') {
    const workContexts = ['work'];
    const personalContexts = ['personal', 'family', 'health'];

    const fromIsWork = workContexts.includes(fromContext);
    const toIsWork = workContexts.includes(toContext);
    const fromIsPersonal = personalContexts.includes(fromContext);
    const toIsPersonal = personalContexts.includes(toContext);

    // Block work -> personal or personal -> work
    if ((fromIsWork && toIsPersonal) || (fromIsPersonal && toIsWork)) {
      return true;
    }
  }

  // Low sensitivity = more permissive
  return false;
}
