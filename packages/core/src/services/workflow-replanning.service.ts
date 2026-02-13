import type { DatabaseType } from '../db/connection';
import type { Task } from '../types/task';
import type { Workflow, WorkflowStatus } from '../types/workflow';
import { taskId } from '../utils/id';
import * as repositoryService from './repository.service';

// --- Allowed statuses for re-planning operations ---
const REPLAN_ALLOWED_STATUSES = new Set(['ready', 'in_progress', 'paused']);
const REMOVABLE_TASK_STATUSES = new Set(['pending', 'blocked', 'planning']);

// --- Parameter / Result types ---

export interface PlanTask {
  name: string;
  description?: string;
  parallel_group?: string;
  estimated_complexity?: string;
  files_likely_affected?: string[];
  depends_on?: string[];
  repository_path?: string;
}

export interface AddTaskParams {
  name: string;
  description?: string;
  parallel_group?: string;
  estimated_complexity?: string;
  files_likely_affected?: string[];
  depends_on?: string[];
  repository_path?: string;
  after_task?: string;
}

export interface AddTaskResult {
  task_id: string;
  sequence: number;
  workflow_id: string;
}

export interface RemoveTaskResult {
  removed_task_id: string;
  dependencies_rewired: number;
  tasks_renumbered: number;
}

export interface ReplanParams {
  summary: string;
  reason: string;
  tasks: PlanTask[];
}

export interface WorkflowReplanResult {
  workflow_id: string;
  tasks_added: number;
  tasks_removed: number;
  tasks_preserved: number;
  new_status: WorkflowStatus;
}

// --- Helpers ---

function requireReplanStatus(workflow: Workflow): void {
  if (!REPLAN_ALLOWED_STATUSES.has(workflow.status)) {
    throw new Error(
      `Cannot modify plan: workflow status is '${workflow.status}', must be ready, in_progress, or paused`,
    );
  }
}

function resolveTaskRef(
  db: DatabaseType,
  workflowId: string,
  ref: string,
  nameToIdMap?: Map<string, string>,
): string | null {
  if (ref.startsWith('tk_')) {
    const row = db
      .prepare('SELECT id FROM tasks WHERE id = ? AND workflow_id = ?')
      .get(ref, workflowId) as { id: string } | null;
    return row?.id ?? null;
  }
  if (nameToIdMap) {
    return nameToIdMap.get(ref) ?? null;
  }
  const row = db
    .prepare('SELECT id FROM tasks WHERE name = ? AND workflow_id = ?')
    .get(ref, workflowId) as { id: string } | null;
  return row?.id ?? null;
}

// --- Service functions ---

export function addTask(
  db: DatabaseType,
  workflowId: string,
  params: AddTaskParams,
): AddTaskResult {
  const run = db.transaction(() => {
    const workflow = db
      .prepare('SELECT * FROM workflows WHERE id = ?')
      .get(workflowId) as Workflow | null;
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
    requireReplanStatus(workflow);

    // Check for duplicate name
    const existing = db
      .prepare('SELECT id FROM tasks WHERE workflow_id = ? AND name = ?')
      .get(workflowId, params.name) as { id: string } | null;
    if (existing) {
      throw new Error(`Duplicate task name '${params.name}' in workflow`);
    }

    // Determine sequence position
    let sequence: number;
    if (params.after_task) {
      const afterId = resolveTaskRef(db, workflowId, params.after_task);
      if (!afterId) {
        throw new Error(`Task not found for after_task: '${params.after_task}'`);
      }
      const afterRow = db.prepare('SELECT sequence FROM tasks WHERE id = ?').get(afterId) as {
        sequence: number;
      };
      sequence = afterRow.sequence + 1;

      // Shift subsequent tasks
      db.prepare(
        'UPDATE tasks SET sequence = sequence + 1 WHERE workflow_id = ? AND sequence >= ?',
      ).run(workflowId, sequence);
    } else {
      const maxRow = db
        .prepare('SELECT COALESCE(MAX(sequence), 0) as max_seq FROM tasks WHERE workflow_id = ?')
        .get(workflowId) as { max_seq: number };
      sequence = maxRow.max_seq + 1;
    }

    const now = Date.now();
    const tId = taskId();

    // Build context
    const context: Record<string, unknown> = {};
    if (params.estimated_complexity) context.estimated_complexity = params.estimated_complexity;
    if (params.files_likely_affected) context.files_likely_affected = params.files_likely_affected;
    const contextJson = Object.keys(context).length > 0 ? JSON.stringify(context) : null;

    // Handle repository
    let repoId: string | null = null;
    if (params.repository_path) {
      const repo = repositoryService.register(db, { path: params.repository_path });
      repoId = repo.id;
      db.prepare(
        'INSERT OR IGNORE INTO workflow_repositories (workflow_id, repository_id, added_at) VALUES (?, ?, ?)',
      ).run(workflowId, repo.id, now);
    }

    // Insert task
    db.prepare(
      `INSERT INTO tasks
        (id, workflow_id, name, description, status, sequence, parallel_group, repository_id, context, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      tId,
      workflowId,
      params.name,
      params.description ?? null,
      'pending',
      sequence,
      params.parallel_group ?? null,
      repoId,
      contextJson,
      now,
      now,
    );

    // Insert dependencies (de-dup to avoid UNIQUE constraint errors)
    if (params.depends_on && params.depends_on.length > 0) {
      const insertDep = db.prepare(
        'INSERT INTO task_dependencies (task_id, depends_on_id, dependency_type) VALUES (?, ?, ?)',
      );
      const seenDepIds = new Set<string>();
      for (const depRef of params.depends_on) {
        if (depRef === params.name) {
          throw new Error(`Task '${params.name}' cannot depend on itself`);
        }
        const depId = resolveTaskRef(db, workflowId, depRef);
        if (!depId) {
          throw new Error(`Unknown dependency '${depRef}' in task '${params.name}'`);
        }
        if (seenDepIds.has(depId)) continue;
        seenDepIds.add(depId);
        insertDep.run(tId, depId, 'blocks');
      }
    }

    // Update workflow timestamp
    db.prepare('UPDATE workflows SET updated_at = ? WHERE id = ?').run(now, workflowId);

    return { task_id: tId, sequence, workflow_id: workflowId };
  });

  return run();
}

export function removeTask(
  db: DatabaseType,
  workflowId: string,
  taskIdToRemove: string,
): RemoveTaskResult {
  const run = db.transaction(() => {
    const workflow = db
      .prepare('SELECT * FROM workflows WHERE id = ?')
      .get(workflowId) as Workflow | null;
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
    requireReplanStatus(workflow);

    const task = db
      .prepare('SELECT * FROM tasks WHERE id = ? AND workflow_id = ?')
      .get(taskIdToRemove, workflowId) as Task | null;
    if (!task) {
      throw new Error(`Task not found: ${taskIdToRemove}`);
    }
    if (!REMOVABLE_TASK_STATUSES.has(task.status)) {
      throw new Error(
        `Cannot remove task: status is '${task.status}', must be pending, blocked, or planning`,
      );
    }
    if (task.assigned_agent_id) {
      throw new Error(`Cannot remove task: task is claimed by agent ${task.assigned_agent_id}`);
    }

    // Get dependencies of the removed task (what it depends on)
    const taskDeps = db
      .prepare('SELECT depends_on_id FROM task_dependencies WHERE task_id = ?')
      .all(taskIdToRemove) as { depends_on_id: string }[];

    // Get dependents of the removed task (what depends on it)
    const taskDependents = db
      .prepare('SELECT task_id FROM task_dependencies WHERE depends_on_id = ?')
      .all(taskIdToRemove) as { task_id: string }[];

    // Re-wire: for each dependent D × each dependency P, add edge D→P
    let rewired = 0;
    if (taskDeps.length > 0 && taskDependents.length > 0) {
      const insertDep = db.prepare(
        'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id, dependency_type) VALUES (?, ?, ?)',
      );
      for (const dependent of taskDependents) {
        for (const dep of taskDeps) {
          const { changes } = insertDep.run(dependent.task_id, dep.depends_on_id, 'blocks');
          rewired += changes;
        }
      }
    }

    // Delete all dependency edges
    db.prepare('DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_id = ?').run(
      taskIdToRemove,
      taskIdToRemove,
    );

    // Delete checkpoints for the task
    db.prepare('DELETE FROM checkpoints WHERE task_id = ?').run(taskIdToRemove);

    const removedSequence = task.sequence;

    // Delete the task
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskIdToRemove);

    // Renumber subsequent tasks
    const { changes: renumbered } = db
      .prepare('UPDATE tasks SET sequence = sequence - 1 WHERE workflow_id = ? AND sequence > ?')
      .run(workflowId, removedSequence);

    // Update workflow timestamp
    const now = Date.now();
    db.prepare('UPDATE workflows SET updated_at = ? WHERE id = ?').run(now, workflowId);

    return {
      removed_task_id: taskIdToRemove,
      dependencies_rewired: rewired,
      tasks_renumbered: renumbered,
    };
  });

  return run();
}

export function replan(
  db: DatabaseType,
  workflowId: string,
  params: ReplanParams,
): WorkflowReplanResult {
  const run = db.transaction(() => {
    const workflow = db
      .prepare('SELECT * FROM workflows WHERE id = ?')
      .get(workflowId) as Workflow | null;
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
    requireReplanStatus(workflow);

    // Fetch all tasks
    const allTasks = db
      .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
      .all(workflowId) as Task[];

    // Classify tasks
    const preserved: Task[] = [];
    const removable: Task[] = [];

    for (const t of allTasks) {
      if (!REMOVABLE_TASK_STATUSES.has(t.status) || t.assigned_agent_id) {
        preserved.push(t);
      } else {
        removable.push(t);
      }
    }

    // Validate no name collision between new tasks and preserved tasks
    const preservedNames = new Set(preserved.map((t) => t.name));
    const newTaskNames = new Set<string>();
    for (const t of params.tasks) {
      if (preservedNames.has(t.name)) {
        throw new Error(
          `Task name '${t.name}' conflicts with a preserved task that cannot be removed`,
        );
      }
      if (newTaskNames.has(t.name)) {
        throw new Error(`Duplicate task name '${t.name}' in replan`);
      }
      newTaskNames.add(t.name);
    }

    // Delete removable tasks + their deps + checkpoints
    for (const t of removable) {
      db.prepare('DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_id = ?').run(
        t.id,
        t.id,
      );
      db.prepare('DELETE FROM checkpoints WHERE task_id = ?').run(t.id);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(t.id);
    }

    // Build name→ID map from preserved tasks
    const nameToIdMap = new Map<string, string>();
    for (const t of preserved) {
      nameToIdMap.set(t.name, t.id);
    }

    // Determine starting sequence (after max preserved)
    const maxPreservedSeq =
      preserved.length > 0 ? Math.max(...preserved.map((t) => t.sequence)) : 0;

    const now = Date.now();
    const insertTask = db.prepare(
      `INSERT INTO tasks
        (id, workflow_id, name, description, status, sequence, parallel_group, repository_id, context, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertWR = db.prepare(
      'INSERT OR IGNORE INTO workflow_repositories (workflow_id, repository_id, added_at) VALUES (?, ?, ?)',
    );

    // Insert new tasks
    for (let i = 0; i < params.tasks.length; i++) {
      const t = params.tasks[i];
      const tId = taskId();
      nameToIdMap.set(t.name, tId);

      const context: Record<string, unknown> = {};
      if (t.estimated_complexity) context.estimated_complexity = t.estimated_complexity;
      if (t.files_likely_affected) context.files_likely_affected = t.files_likely_affected;
      const contextJson = Object.keys(context).length > 0 ? JSON.stringify(context) : null;

      let repoId: string | null = null;
      if (t.repository_path) {
        const repo = repositoryService.register(db, { path: t.repository_path });
        repoId = repo.id;
        insertWR.run(workflowId, repo.id, now);
      }

      insertTask.run(
        tId,
        workflowId,
        t.name,
        t.description ?? null,
        'pending',
        maxPreservedSeq + i + 1,
        t.parallel_group ?? null,
        repoId,
        contextJson,
        now,
        now,
      );
    }

    // Wire dependencies for new tasks (de-dup to avoid UNIQUE constraint errors)
    const insertDep = db.prepare(
      'INSERT INTO task_dependencies (task_id, depends_on_id, dependency_type) VALUES (?, ?, ?)',
    );
    for (const t of params.tasks) {
      if (!t.depends_on || t.depends_on.length === 0) continue;
      const tId = nameToIdMap.get(t.name) as string;
      const seenDepIds = new Set<string>();
      for (const depRef of t.depends_on) {
        if (depRef === t.name) {
          throw new Error(`Task '${t.name}' cannot depend on itself`);
        }
        const depId = nameToIdMap.get(depRef);
        if (!depId) {
          throw new Error(`Unknown dependency '${depRef}' in task '${t.name}'`);
        }
        if (seenDepIds.has(depId)) continue;
        seenDepIds.add(depId);
        insertDep.run(tId, depId, 'blocks');
      }
    }

    // Update workflow plan_summary and config
    const config = workflow.config ? JSON.parse(workflow.config) : {};
    const replanEntry = { summary: params.summary, reason: params.reason, timestamp: now };
    if (!Array.isArray(config.replan_history)) {
      config.replan_history = [];
    }
    config.replan_history.push(replanEntry);

    db.prepare(
      'UPDATE workflows SET plan_summary = ?, config = ?, updated_at = ? WHERE id = ?',
    ).run(params.summary, JSON.stringify(config), now, workflowId);

    return {
      workflow_id: workflowId,
      tasks_added: params.tasks.length,
      tasks_removed: removable.length,
      tasks_preserved: preserved.length,
      new_status: workflow.status,
    };
  });

  return run();
}
