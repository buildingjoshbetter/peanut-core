// Goals Tracking Module
// Strategy Reference: Part 11
//
// Manages user goals with hierarchy, progress tracking, and commitment linking.

import { v4 as uuid } from 'uuid';
import { getDb, query, execute } from '../db/connection';
import type { Goal, GoalType, GoalStatus } from '../types';

// ============================================================
// INPUT TYPES
// ============================================================

export interface CreateGoalInput {
  description: string;
  goalType?: GoalType;
  parentGoalId?: string;
  relatedEntities?: string[];
  targetDate?: Date;
}

export interface UpdateGoalInput {
  description?: string;
  goalType?: GoalType;
  status?: GoalStatus;
  parentGoalId?: string;
  relatedEntities?: string[];
  targetDate?: Date;
}

export interface GoalWithChildren extends Goal {
  children: GoalWithChildren[];
  commitmentCount: number;
  progress: number;  // 0-1
}

export interface GoalProgress {
  goalId: string;
  status: GoalStatus;
  totalSubgoals: number;
  completedSubgoals: number;
  linkedCommitments: number;
  completedCommitments: number;
  progress: number;  // 0-1
}

// ============================================================
// CRUD OPERATIONS
// ============================================================

/**
 * Create a new goal
 */
export function createGoal(input: CreateGoalInput): string {
  const id = uuid();
  const now = new Date();

  execute(`
    INSERT INTO goals (
      id, description, goal_type, status, parent_goal_id,
      related_entities, created_at, target_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    input.description,
    input.goalType || 'short_term',
    'active',
    input.parentGoalId || null,
    input.relatedEntities ? JSON.stringify(input.relatedEntities) : null,
    now.toISOString(),
    input.targetDate?.toISOString() || null,
  ]);

  return id;
}

/**
 * Get a goal by ID
 */
export function getGoal(id: string): Goal | null {
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
    SELECT * FROM goals WHERE id = ?
  `, [id]);

  if (rows.length === 0) return null;

  const row = rows[0]!;
  return {
    id: row.id,
    description: row.description,
    goalType: row.goal_type as GoalType,
    status: row.status as GoalStatus,
    parentGoalId: row.parent_goal_id || undefined,
    relatedEntities: row.related_entities ? JSON.parse(row.related_entities) : undefined,
    createdAt: new Date(row.created_at),
    targetDate: row.target_date ? new Date(row.target_date) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  };
}

/**
 * Update a goal
 */
export function updateGoal(id: string, updates: UpdateGoalInput): void {
  const goal = getGoal(id);
  if (!goal) {
    throw new Error(`Goal not found: ${id}`);
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.goalType !== undefined) {
    fields.push('goal_type = ?');
    values.push(updates.goalType);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
    if (updates.status === 'completed') {
      fields.push('completed_at = ?');
      values.push(new Date().toISOString());
    }
  }
  if (updates.parentGoalId !== undefined) {
    fields.push('parent_goal_id = ?');
    values.push(updates.parentGoalId || null);
  }
  if (updates.relatedEntities !== undefined) {
    fields.push('related_entities = ?');
    values.push(JSON.stringify(updates.relatedEntities));
  }
  if (updates.targetDate !== undefined) {
    fields.push('target_date = ?');
    values.push(updates.targetDate?.toISOString() || null);
  }

  if (fields.length === 0) return;

  values.push(id);
  execute(`
    UPDATE goals SET ${fields.join(', ')} WHERE id = ?
  `, values);
}

/**
 * Delete a goal
 */
export function deleteGoal(id: string): void {
  // First, update children to have no parent
  execute(`
    UPDATE goals SET parent_goal_id = NULL WHERE parent_goal_id = ?
  `, [id]);

  // Then delete the goal
  execute(`
    DELETE FROM goals WHERE id = ?
  `, [id]);
}

/**
 * Complete a goal
 */
export function completeGoal(id: string): void {
  updateGoal(id, { status: 'completed' });
}

/**
 * Abandon a goal
 */
export function abandonGoal(id: string): void {
  updateGoal(id, { status: 'abandoned' });
}

// ============================================================
// QUERY OPERATIONS
// ============================================================

/**
 * Get all active goals
 */
export function getActiveGoals(): Goal[] {
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
    ORDER BY target_date ASC NULLS LAST, created_at ASC
  `, []);

  return rows.map(row => ({
    id: row.id,
    description: row.description,
    goalType: row.goal_type as GoalType,
    status: row.status as GoalStatus,
    parentGoalId: row.parent_goal_id || undefined,
    relatedEntities: row.related_entities ? JSON.parse(row.related_entities) : undefined,
    createdAt: new Date(row.created_at),
    targetDate: row.target_date ? new Date(row.target_date) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  }));
}

/**
 * Get goals by type
 */
export function getGoalsByType(goalType: GoalType): Goal[] {
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
    WHERE goal_type = ? AND status = 'active'
    ORDER BY target_date ASC NULLS LAST
  `, [goalType]);

  return rows.map(row => ({
    id: row.id,
    description: row.description,
    goalType: row.goal_type as GoalType,
    status: row.status as GoalStatus,
    parentGoalId: row.parent_goal_id || undefined,
    relatedEntities: row.related_entities ? JSON.parse(row.related_entities) : undefined,
    createdAt: new Date(row.created_at),
    targetDate: row.target_date ? new Date(row.target_date) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  }));
}

/**
 * Get child goals
 */
export function getChildGoals(parentId: string): Goal[] {
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
    WHERE parent_goal_id = ?
    ORDER BY created_at ASC
  `, [parentId]);

  return rows.map(row => ({
    id: row.id,
    description: row.description,
    goalType: row.goal_type as GoalType,
    status: row.status as GoalStatus,
    parentGoalId: row.parent_goal_id || undefined,
    relatedEntities: row.related_entities ? JSON.parse(row.related_entities) : undefined,
    createdAt: new Date(row.created_at),
    targetDate: row.target_date ? new Date(row.target_date) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  }));
}

/**
 * Get goal hierarchy (tree structure)
 */
export function getGoalHierarchy(rootId?: string): GoalWithChildren[] {
  // Get all goals
  const allGoals = query<{
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
    ORDER BY created_at ASC
  `, []);

  // Get commitment counts per goal
  const commitmentCounts = query<{
    goal_id: string;
    total: number;
    completed: number;
  }>(`
    SELECT
      g.id as goal_id,
      COUNT(gc.commitment_id) as total,
      SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM goals g
    LEFT JOIN goal_commitments gc ON g.id = gc.goal_id
    LEFT JOIN commitments c ON gc.commitment_id = c.id
    GROUP BY g.id
  `, []);

  const commitmentMap = new Map<string, { total: number; completed: number }>();
  for (const cc of commitmentCounts) {
    commitmentMap.set(cc.goal_id, { total: cc.total, completed: cc.completed });
  }

  // Build goal map
  const goalMap = new Map<string, GoalWithChildren>();
  for (const row of allGoals) {
    const cc = commitmentMap.get(row.id) || { total: 0, completed: 0 };
    goalMap.set(row.id, {
      id: row.id,
      description: row.description,
      goalType: row.goal_type as GoalType,
      status: row.status as GoalStatus,
      parentGoalId: row.parent_goal_id || undefined,
      relatedEntities: row.related_entities ? JSON.parse(row.related_entities) : undefined,
      createdAt: new Date(row.created_at),
      targetDate: row.target_date ? new Date(row.target_date) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      children: [],
      commitmentCount: cc.total,
      progress: 0,
    });
  }

  // Build tree
  const roots: GoalWithChildren[] = [];
  for (const goal of goalMap.values()) {
    if (goal.parentGoalId) {
      const parent = goalMap.get(goal.parentGoalId);
      if (parent) {
        parent.children.push(goal);
      } else {
        roots.push(goal);
      }
    } else {
      roots.push(goal);
    }
  }

  // Calculate progress recursively
  function calculateProgress(goal: GoalWithChildren): number {
    if (goal.status === 'completed') return 1;
    if (goal.status === 'abandoned') return 0;

    if (goal.children.length === 0) {
      // Leaf node - use commitment progress
      const cc = commitmentMap.get(goal.id);
      if (cc && cc.total > 0) {
        return cc.completed / cc.total;
      }
      return 0;
    }

    // Non-leaf - average of children progress
    let totalProgress = 0;
    for (const child of goal.children) {
      child.progress = calculateProgress(child);
      totalProgress += child.progress;
    }
    return goal.children.length > 0 ? totalProgress / goal.children.length : 0;
  }

  for (const root of roots) {
    root.progress = calculateProgress(root);
  }

  // Filter to specific root if requested
  if (rootId) {
    const root = goalMap.get(rootId);
    return root ? [root] : [];
  }

  return roots;
}

/**
 * Get progress for a specific goal
 */
export function getGoalProgress(id: string): GoalProgress | null {
  const goal = getGoal(id);
  if (!goal) return null;

  // Count subgoals
  const subgoalCounts = query<{ total: number; completed: number }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM goals
    WHERE parent_goal_id = ?
  `, [id]);

  // Count linked commitments
  const commitmentCounts = query<{ total: number; completed: number }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM goal_commitments gc
    JOIN commitments c ON gc.commitment_id = c.id
    WHERE gc.goal_id = ?
  `, [id]);

  const sc = subgoalCounts[0] || { total: 0, completed: 0 };
  const cc = commitmentCounts[0] || { total: 0, completed: 0 };

  // Calculate progress
  let progress = 0;
  if (goal.status === 'completed') {
    progress = 1;
  } else if (goal.status === 'abandoned') {
    progress = 0;
  } else {
    const totalItems = sc.total + cc.total;
    const completedItems = sc.completed + cc.completed;
    progress = totalItems > 0 ? completedItems / totalItems : 0;
  }

  return {
    goalId: id,
    status: goal.status,
    totalSubgoals: sc.total,
    completedSubgoals: sc.completed,
    linkedCommitments: cc.total,
    completedCommitments: cc.completed,
    progress,
  };
}

// ============================================================
// COMMITMENT LINKING
// ============================================================

/**
 * Link a commitment to a goal
 */
export function linkCommitmentToGoal(commitmentId: string, goalId: string): void {
  // First check if goal_commitments table exists, create if not
  execute(`
    CREATE TABLE IF NOT EXISTS goal_commitments (
      goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      commitment_id TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
      linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (goal_id, commitment_id)
    )
  `, []);

  execute(`
    INSERT OR IGNORE INTO goal_commitments (goal_id, commitment_id)
    VALUES (?, ?)
  `, [goalId, commitmentId]);
}

/**
 * Unlink a commitment from a goal
 */
export function unlinkCommitmentFromGoal(commitmentId: string, goalId: string): void {
  execute(`
    DELETE FROM goal_commitments
    WHERE goal_id = ? AND commitment_id = ?
  `, [goalId, commitmentId]);
}

/**
 * Get all commitments linked to a goal
 */
export function getGoalCommitments(goalId: string): string[] {
  const rows = query<{ commitment_id: string }>(`
    SELECT commitment_id FROM goal_commitments
    WHERE goal_id = ?
  `, [goalId]);

  return rows.map(r => r.commitment_id);
}

/**
 * Get all goals linked to a commitment
 */
export function getCommitmentGoals(commitmentId: string): string[] {
  const rows = query<{ goal_id: string }>(`
    SELECT goal_id FROM goal_commitments
    WHERE commitment_id = ?
  `, [commitmentId]);

  return rows.map(r => r.goal_id);
}

// ============================================================
// ENTITY LINKING
// ============================================================

/**
 * Get goals related to an entity
 */
export function getGoalsForEntity(entityId: string): Goal[] {
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
    WHERE related_entities LIKE ?
    ORDER BY status ASC, created_at DESC
  `, [`%${entityId}%`]);

  return rows
    .filter(row => {
      if (!row.related_entities) return false;
      const entities = JSON.parse(row.related_entities) as string[];
      return entities.includes(entityId);
    })
    .map(row => ({
      id: row.id,
      description: row.description,
      goalType: row.goal_type as GoalType,
      status: row.status as GoalStatus,
      parentGoalId: row.parent_goal_id || undefined,
      relatedEntities: row.related_entities ? JSON.parse(row.related_entities) : undefined,
      createdAt: new Date(row.created_at),
      targetDate: row.target_date ? new Date(row.target_date) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    }));
}

// ============================================================
// DEADLINE TRACKING
// ============================================================

/**
 * Get goals with upcoming deadlines
 */
export function getUpcomingGoalDeadlines(days: number = 7): Goal[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

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
      AND target_date IS NOT NULL
      AND target_date <= ?
    ORDER BY target_date ASC
  `, [cutoff.toISOString()]);

  return rows.map(row => ({
    id: row.id,
    description: row.description,
    goalType: row.goal_type as GoalType,
    status: row.status as GoalStatus,
    parentGoalId: row.parent_goal_id || undefined,
    relatedEntities: row.related_entities ? JSON.parse(row.related_entities) : undefined,
    createdAt: new Date(row.created_at),
    targetDate: row.target_date ? new Date(row.target_date) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  }));
}

/**
 * Get overdue goals
 */
export function getOverdueGoals(): Goal[] {
  const now = new Date();

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
      AND target_date IS NOT NULL
      AND target_date < ?
    ORDER BY target_date ASC
  `, [now.toISOString()]);

  return rows.map(row => ({
    id: row.id,
    description: row.description,
    goalType: row.goal_type as GoalType,
    status: row.status as GoalStatus,
    parentGoalId: row.parent_goal_id || undefined,
    relatedEntities: row.related_entities ? JSON.parse(row.related_entities) : undefined,
    createdAt: new Date(row.created_at),
    targetDate: row.target_date ? new Date(row.target_date) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  }));
}
