import type { DatabaseType } from '../db/connection';
import type { Task, TaskStatus } from '../types/task';
import type { Workflow } from '../types/workflow';

// --- Parameter / Result types ---

export interface EnrichedTask extends Task {
  can_parallelize: boolean;
  parallel_with: string[];
  dependencies_completed: string[];
}

export interface NextTasksResult {
  tasks: EnrichedTask[];
  max_parallel: number;
  recommended_count: number;
  workflow_status: string;
  all_complete: boolean;
}

export interface ProgressResult {
  total_tasks: number;
  by_status: Record<string, number>;
  completed_sequence: number;
  current_sequence: number;
  blocked_tasks: BlockedTaskInfo[];
  parallel_groups: Record<string, ParallelGroupStats>;
  estimated_remaining: number;
}

export interface BlockedTaskInfo {
  id: string;
  name: string;
  blocked_by: string[];
}

export interface ParallelGroupStats {
  task_count: number;
  completed: number;
}

export interface DependencyCheckResult {
  satisfied: boolean;
  pending: DependencyInfo[];
  completed: DependencyInfo[];
}

export interface DependencyInfo {
  id: string;
  name: string;
  status?: TaskStatus;
  outcome?: string | null;
}

// --- Service functions ---

export function getNextTasks(
  db: DatabaseType,
  workflowId: string,
  includeFailed = false,
): NextTasksResult {
  const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId) as
    | Workflow
    | undefined;

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const allTasks = db
    .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence, name')
    .all(workflowId) as Task[];

  // Check if all tasks are completed/skipped
  const allComplete =
    allTasks.length > 0 &&
    allTasks.every((t) => t.status === 'completed' || t.status === 'skipped');

  // Find eligible tasks: pending + unblocked, optionally failed
  const statusConditions = ["'pending'"];
  if (includeFailed) {
    statusConditions.push("'failed'");
  }

  const candidateTasks = db
    .prepare(
      `SELECT t.* FROM tasks t
       WHERE t.workflow_id = ?
         AND t.status IN (${statusConditions.join(', ')})
         AND t.assigned_agent_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM task_dependencies td
           JOIN tasks dep ON dep.id = td.depends_on_id
           WHERE td.task_id = t.id
             AND td.dependency_type = 'blocks'
             AND dep.status NOT IN ('completed', 'skipped')
         )
       ORDER BY t.sequence, t.name`,
    )
    .all(workflowId) as Task[];

  // Enrich each task
  const enrichedTasks: EnrichedTask[] = candidateTasks.map((task) => {
    // Find parallel_with: other task IDs in the same parallel_group
    let parallelWith: string[] = [];
    if (task.parallel_group) {
      parallelWith = allTasks
        .filter((t) => t.parallel_group === task.parallel_group && t.id !== task.id)
        .map((t) => t.id);
    }

    // Find completed dependencies
    const completedDeps = db
      .prepare(
        `SELECT dep.name FROM task_dependencies td
         JOIN tasks dep ON dep.id = td.depends_on_id
         WHERE td.task_id = ?
           AND dep.status IN ('completed', 'skipped')`,
      )
      .all(task.id) as { name: string }[];

    return {
      ...task,
      can_parallelize: !!task.parallel_group,
      parallel_with: parallelWith,
      dependencies_completed: completedDeps.map((d) => d.name),
    };
  });

  const recommendedCount = Math.min(enrichedTasks.length, workflow.max_parallel_tasks);

  return {
    tasks: enrichedTasks,
    max_parallel: workflow.max_parallel_tasks,
    recommended_count: recommendedCount,
    workflow_status: workflow.status,
    all_complete: allComplete,
  };
}

export function getProgress(db: DatabaseType, workflowId: string): ProgressResult {
  const workflow = db.prepare('SELECT id FROM workflows WHERE id = ?').get(workflowId) as
    | Pick<Workflow, 'id'>
    | undefined;

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const allTasks = db
    .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence, name')
    .all(workflowId) as Task[];

  // Count by status
  const byStatus: Record<string, number> = {};
  for (const task of allTasks) {
    byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
  }

  // Find completed_sequence: highest sequence where all tasks at or below are done
  let completedSequence = 0;
  const tasksBySequence = new Map<number, Task[]>();
  for (const task of allTasks) {
    const existing = tasksBySequence.get(task.sequence) ?? [];
    existing.push(task);
    tasksBySequence.set(task.sequence, existing);
  }

  const sequences = [...tasksBySequence.keys()].sort((a, b) => a - b);
  for (const seq of sequences) {
    const tasksAtSeq = tasksBySequence.get(seq) ?? [];
    const allDone = tasksAtSeq.every((t) => t.status === 'completed' || t.status === 'skipped');
    if (allDone) {
      completedSequence = seq;
    } else {
      break;
    }
  }

  // Find current_sequence: lowest sequence with non-completed tasks
  let currentSequence = 0;
  for (const seq of sequences) {
    const tasksAtSeq = tasksBySequence.get(seq) ?? [];
    const hasIncomplete = tasksAtSeq.some(
      (t) => t.status !== 'completed' && t.status !== 'skipped',
    );
    if (hasIncomplete) {
      currentSequence = seq;
      break;
    }
  }

  // Find blocked tasks
  const blockedTasks: BlockedTaskInfo[] = [];
  for (const task of allTasks) {
    if (task.status === 'completed' || task.status === 'skipped') continue;

    const unsatisfied = db
      .prepare(
        `SELECT dep.name FROM task_dependencies td
         JOIN tasks dep ON dep.id = td.depends_on_id
         WHERE td.task_id = ?
           AND td.dependency_type = 'blocks'
           AND dep.status NOT IN ('completed', 'skipped')`,
      )
      .all(task.id) as { name: string }[];

    if (unsatisfied.length > 0) {
      blockedTasks.push({
        id: task.id,
        name: task.name,
        blocked_by: unsatisfied.map((d) => d.name),
      });
    }
  }

  // Parallel group stats
  const parallelGroups: Record<string, ParallelGroupStats> = {};
  for (const task of allTasks) {
    if (!task.parallel_group) continue;

    if (!parallelGroups[task.parallel_group]) {
      parallelGroups[task.parallel_group] = { task_count: 0, completed: 0 };
    }

    parallelGroups[task.parallel_group].task_count++;
    if (task.status === 'completed' || task.status === 'skipped') {
      parallelGroups[task.parallel_group].completed++;
    }
  }

  // Estimated remaining
  const terminalStatuses: TaskStatus[] = ['completed', 'skipped'];
  const estimatedRemaining = allTasks.filter((t) => !terminalStatuses.includes(t.status)).length;

  return {
    total_tasks: allTasks.length,
    by_status: byStatus,
    completed_sequence: completedSequence,
    current_sequence: currentSequence,
    blocked_tasks: blockedTasks,
    parallel_groups: parallelGroups,
    estimated_remaining: estimatedRemaining,
  };
}

export function checkDependencies(db: DatabaseType, taskId: string): DependencyCheckResult {
  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId) as
    | Pick<Task, 'id'>
    | undefined;

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const blockingDeps = db
    .prepare(
      `SELECT dep.id, dep.name, dep.status, dep.outcome
       FROM task_dependencies td
       JOIN tasks dep ON dep.id = td.depends_on_id
       WHERE td.task_id = ?
         AND td.dependency_type = 'blocks'`,
    )
    .all(taskId) as { id: string; name: string; status: TaskStatus; outcome: string | null }[];

  const pending: DependencyInfo[] = [];
  const completed: DependencyInfo[] = [];

  for (const dep of blockingDeps) {
    if (dep.status === 'completed' || dep.status === 'skipped') {
      completed.push({ id: dep.id, name: dep.name, outcome: dep.outcome });
    } else {
      pending.push({ id: dep.id, name: dep.name, status: dep.status });
    }
  }

  return {
    satisfied: pending.length === 0,
    pending,
    completed,
  };
}
