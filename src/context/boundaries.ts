// Context Boundaries Manager
// Strategy Reference: Part 8, lines 619-668
//
// Manages work/personal/family context boundaries and visibility policies.

import { v4 as uuid } from 'uuid';
import { getDb, query, execute, queryOne } from '../db/connection';
import type { ContextBoundary, ActiveContext } from '../types';

/**
 * Get all defined context boundaries
 */
export function getAllContexts(): ContextBoundary[] {
  return query<{
    id: string;
    context_name: string;
    visibility_policy: string | null;
    classification_signals: string | null;
    formality_floor: number | null;
    professionalism_required: number;
    humor_allowed: number;
  }>(`
    SELECT id, context_name, visibility_policy, classification_signals,
           formality_floor, professionalism_required, humor_allowed
    FROM context_boundaries
  `).map(row => ({
    id: row.id,
    contextName: row.context_name,
    visibilityPolicy: row.visibility_policy ? JSON.parse(row.visibility_policy) : undefined,
    classificationSignals: row.classification_signals ? JSON.parse(row.classification_signals) : undefined,
    formalityFloor: row.formality_floor ?? 0.5,
    professionalismRequired: row.professionalism_required === 1,
    humorAllowed: row.humor_allowed === 1,
  }));
}

/**
 * Get a specific context by name
 */
export function getContext(contextName: string): ContextBoundary | undefined {
  const row = queryOne<{
    id: string;
    context_name: string;
    visibility_policy: string | null;
    classification_signals: string | null;
    formality_floor: number | null;
    professionalism_required: number;
    humor_allowed: number;
  }>(`
    SELECT id, context_name, visibility_policy, classification_signals,
           formality_floor, professionalism_required, humor_allowed
    FROM context_boundaries
    WHERE context_name = ?
  `, [contextName]);

  if (!row) return undefined;

  return {
    id: row.id,
    contextName: row.context_name,
    visibilityPolicy: row.visibility_policy ? JSON.parse(row.visibility_policy) : undefined,
    classificationSignals: row.classification_signals ? JSON.parse(row.classification_signals) : undefined,
    formalityFloor: row.formality_floor ?? 0.5,
    professionalismRequired: row.professionalism_required === 1,
    humorAllowed: row.humor_allowed === 1,
  };
}

/**
 * Create a new context boundary
 */
export function createContext(context: Omit<ContextBoundary, 'id'>): ContextBoundary {
  const id = `ctx_${context.contextName.toLowerCase().replace(/\s+/g, '_')}`;

  execute(`
    INSERT INTO context_boundaries
    (id, context_name, visibility_policy, classification_signals,
     formality_floor, professionalism_required, humor_allowed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    context.contextName,
    context.visibilityPolicy ? JSON.stringify(context.visibilityPolicy) : null,
    context.classificationSignals ? JSON.stringify(context.classificationSignals) : null,
    context.formalityFloor,
    context.professionalismRequired ? 1 : 0,
    context.humorAllowed ? 1 : 0,
  ]);

  return { id, ...context };
}

/**
 * Associate an entity with a context
 */
export function addEntityToContext(
  entityId: string,
  contextId: string,
  confidence: number = 1.0
): void {
  execute(`
    INSERT OR REPLACE INTO entity_context_membership
    (entity_id, context_id, confidence)
    VALUES (?, ?, ?)
  `, [entityId, contextId, confidence]);
}

/**
 * Get contexts for an entity
 */
export function getEntityContexts(entityId: string): Array<{
  contextId: string;
  contextName: string;
  confidence: number;
}> {
  return query<{
    context_id: string;
    context_name: string;
    confidence: number;
  }>(`
    SELECT ecm.context_id, cb.context_name, ecm.confidence
    FROM entity_context_membership ecm
    JOIN context_boundaries cb ON ecm.context_id = cb.id
    WHERE ecm.entity_id = ?
    ORDER BY ecm.confidence DESC
  `, [entityId]).map(row => ({
    contextId: row.context_id,
    contextName: row.context_name,
    confidence: row.confidence,
  }));
}

/**
 * Get the current active context for a session
 */
export function getActiveContext(sessionId: string): ActiveContext | undefined {
  const row = queryOne<{
    session_id: string;
    current_context: string | null;
    detected_at: string | null;
    signals: string | null;
    confidence: number | null;
    active_persona: string | null;
    style_adjustments: string | null;
  }>(`
    SELECT session_id, current_context, detected_at, signals,
           confidence, active_persona, style_adjustments
    FROM active_context
    WHERE session_id = ?
  `, [sessionId]);

  if (!row || !row.current_context) return undefined;

  return {
    sessionId: row.session_id,
    currentContext: row.current_context,
    detectedAt: row.detected_at ? new Date(row.detected_at) : new Date(),
    signals: row.signals ? JSON.parse(row.signals) : {},
    confidence: row.confidence ?? 0.5,
    activePersona: row.active_persona || undefined,
    styleAdjustments: row.style_adjustments ? JSON.parse(row.style_adjustments) : undefined,
  };
}

/**
 * Set the active context for a session
 */
export function setActiveContext(
  sessionId: string,
  contextName: string,
  signals: Record<string, unknown> = {},
  confidence: number = 1.0
): void {
  const context = getContext(contextName);
  if (!context) {
    throw new Error(`Unknown context: ${contextName}`);
  }

  // Calculate style adjustments based on context rules
  const styleAdjustments: Record<string, number> = {
    formalityFloor: context.formalityFloor,
  };

  execute(`
    INSERT OR REPLACE INTO active_context
    (session_id, current_context, detected_at, signals, confidence, style_adjustments)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
  `, [
    sessionId,
    contextName,
    JSON.stringify(signals),
    confidence,
    JSON.stringify(styleAdjustments),
  ]);
}

/**
 * Check if a context can see data from another context
 */
export function canSeeContext(viewerContext: string, dataContext: string): boolean {
  if (viewerContext === dataContext) return true;

  const viewer = getContext(viewerContext);
  if (!viewer?.visibilityPolicy) return false;

  return viewer.visibilityPolicy[dataContext] === true;
}

/**
 * Get formality floor for current context
 */
export function getContextFormalityFloor(contextName: string): number {
  const context = getContext(contextName);
  return context?.formalityFloor ?? 0.5;
}

/**
 * Check if professionalism is required in current context
 */
export function isProfessionalismRequired(contextName: string): boolean {
  const context = getContext(contextName);
  return context?.professionalismRequired ?? false;
}
