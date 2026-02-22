import type { DatabaseType } from '../db/connection';
import type { Checkpoint } from '../types/checkpoint';
import type { Task } from '../types/task';
import type { Workflow } from '../types/workflow';
import { compressCheckpoints, compressFileList, compressText } from '../utils/compress';
import { estimateObjectTokens } from '../utils/tokens';
import * as checkpointService from './checkpoint.service';

// --- Types ---

export interface LoadContextOptions {
  include?: {
    workflow?: boolean;
    current_task?: boolean;
    prior_tasks?: boolean;
    siblings?: boolean;
    dependencies?: boolean;
    all_checkpoints?: boolean;
  };
  max_tokens?: number;
}

export interface WorkflowContext {
  id: string;
  name: string;
  status: string;
  source_summary: string | null;
  plan_summary: string | null;
}

export interface CurrentTaskContext {
  id: string;
  name: string;
  description: string | null;
  status: string;
  sequence: number;
  plan: string | null;
  context: string | null;
  checkpoints: Checkpoint[];
}

export interface PriorTaskContext {
  id: string;
  name: string;
  status: string;
  outcome: string | null;
}

export interface SiblingTaskContext {
  id: string;
  name: string;
  status: string;
  outcome: string | null;
}

export interface DependencyOutcomeContext {
  id: string;
  name: string;
  outcome: string | null;
}

export interface LoadContextResult {
  workflow: WorkflowContext | undefined;
  current_task: CurrentTaskContext | undefined;
  prior_tasks: PriorTaskContext[] | undefined;
  sibling_tasks: SiblingTaskContext[] | undefined;
  dependency_outcomes: DependencyOutcomeContext[] | undefined;
  token_estimate: number;
}

// --- Budget constants ---

const DEFAULT_MAX_TOKENS = 8000;
const RECENT_CHECKPOINT_COUNT = 5;

const BUDGET_WORKFLOW = 0.15;
const BUDGET_CURRENT_TASK = 0.55;
const BUDGET_PRIOR_TASKS = 0.2;
const BUDGET_SIBLINGS_DEPS = 0.1;

// --- Internal helpers ---

interface IncludeFlags {
  workflow: boolean;
  current_task: boolean;
  prior_tasks: boolean;
  siblings: boolean;
  dependencies: boolean;
  all_checkpoints: boolean;
}

function resolveIncludeDefaults(include?: LoadContextOptions['include']): IncludeFlags {
  return {
    workflow: include?.workflow ?? true,
    current_task: include?.current_task ?? true,
    prior_tasks: include?.prior_tasks ?? true,
    siblings: include?.siblings ?? true,
    dependencies: include?.dependencies ?? true,
    all_checkpoints: include?.all_checkpoints ?? false,
  };
}

function buildWorkflowContext(
  workflow: Workflow,
  _include: IncludeFlags,
  budget: number,
): WorkflowContext {
  return {
    id: workflow.id,
    name: workflow.name,
    status: workflow.status,
    source_summary: compressText(workflow.source_content, Math.floor(budget * 0.6)),
    plan_summary: workflow.plan_summary,
  };
}

function buildCurrentTaskContext(
  db: DatabaseType,
  task: Task,
  include: IncludeFlags,
  budget: number,
): CurrentTaskContext {
  let checkpoints = checkpointService.list(db, task.id);

  if (!include.all_checkpoints) {
    checkpoints = compressCheckpoints(checkpoints, RECENT_CHECKPOINT_COUNT);
  }

  // Compress file lists in each checkpoint
  checkpoints = checkpoints.map((cp) => ({
    ...cp,
    files_changed: compressFileList(cp.files_changed),
  }));

  // If checkpoints alone exceed budget, keep fewer
  let cpEstimate = estimateObjectTokens(checkpoints);
  const taskOverhead = 200; // rough estimate for task fields
  let recentCount = checkpoints.length;
  while (cpEstimate + taskOverhead > budget && recentCount > 1) {
    recentCount = Math.max(1, recentCount - 1);
    checkpoints = compressCheckpoints(checkpoints, recentCount);
    cpEstimate = estimateObjectTokens(checkpoints);
  }

  return {
    id: task.id,
    name: task.name,
    description: task.description,
    status: task.status,
    sequence: task.sequence,
    plan: task.plan,
    context: task.context,
    checkpoints,
  };
}

function buildPriorTasksContext(
  db: DatabaseType,
  task: Task,
  _include: IncludeFlags,
  _budget: number,
): PriorTaskContext[] {
  // When context_from is set, load only the specified tasks' outcomes
  // instead of all prior tasks
  if (task.context_from) {
    const contextFromIds: string[] = JSON.parse(task.context_from);
    if (contextFromIds.length > 0) {
      const placeholders = contextFromIds.map(() => '?').join(', ');
      const rows = db
        .prepare(
          `SELECT id, name, outcome, status FROM tasks WHERE id IN (${placeholders}) ORDER BY sequence ASC`,
        )
        .all(...contextFromIds) as PriorTaskContext[];
      return rows;
    }
  }

  const rows = db
    .prepare(
      'SELECT id, name, outcome, status FROM tasks WHERE workflow_id = ? AND sequence < ? ORDER BY sequence ASC',
    )
    .all(task.workflow_id, task.sequence) as PriorTaskContext[];

  return rows;
}

function buildSiblingTasksContext(
  db: DatabaseType,
  task: Task,
  _include: IncludeFlags,
  _budget: number,
): SiblingTaskContext[] | undefined {
  if (!task.parallel_group) {
    return undefined;
  }

  const rows = db
    .prepare(
      'SELECT id, name, status, outcome FROM tasks WHERE workflow_id = ? AND parallel_group = ? AND id != ? ORDER BY sequence ASC',
    )
    .all(task.workflow_id, task.parallel_group, task.id) as SiblingTaskContext[];

  return rows.length > 0 ? rows : undefined;
}

function buildDependencyOutcomesContext(
  db: DatabaseType,
  task: Task,
  _budget: number,
): DependencyOutcomeContext[] {
  const rows = db
    .prepare(
      'SELECT t.id, t.name, t.outcome FROM task_dependencies td JOIN tasks t ON t.id = td.depends_on_id WHERE td.task_id = ?',
    )
    .all(task.id) as DependencyOutcomeContext[];

  return rows;
}

// --- Main function ---

export function loadTaskContext(
  db: DatabaseType,
  taskId: string,
  options?: LoadContextOptions,
): LoadContextResult {
  const include = resolveIncludeDefaults(options?.include);
  const maxTokens = options?.max_tokens ?? DEFAULT_MAX_TOKENS;

  // Fetch task
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | null;
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // Fetch workflow
  const workflow = db
    .prepare('SELECT * FROM workflows WHERE id = ?')
    .get(task.workflow_id) as Workflow | null;
  if (!workflow) {
    throw new Error(`Workflow not found: ${task.workflow_id}`);
  }

  // Calculate per-section budgets
  const workflowBudget = Math.floor(maxTokens * BUDGET_WORKFLOW);
  const currentTaskBudget = Math.floor(maxTokens * BUDGET_CURRENT_TASK);
  const priorTasksBudget = Math.floor(maxTokens * BUDGET_PRIOR_TASKS);
  const siblingDepsBudget = Math.floor(maxTokens * BUDGET_SIBLINGS_DEPS);

  // Build sections
  const workflowCtx = include.workflow
    ? buildWorkflowContext(workflow, include, workflowBudget)
    : undefined;

  const currentTaskCtx = include.current_task
    ? buildCurrentTaskContext(db, task, include, currentTaskBudget)
    : undefined;

  let priorTasksCtx = include.prior_tasks
    ? buildPriorTasksContext(db, task, include, priorTasksBudget)
    : undefined;

  let siblingTasksCtx = include.siblings
    ? buildSiblingTasksContext(db, task, include, siblingDepsBudget)
    : undefined;

  let depOutcomesCtx = include.dependencies
    ? buildDependencyOutcomesContext(db, task, siblingDepsBudget)
    : undefined;

  // Calculate total token estimate
  const sections: { key: string; value: object | undefined }[] = [
    { key: 'workflow', value: workflowCtx },
    { key: 'current_task', value: currentTaskCtx },
    { key: 'prior_tasks', value: priorTasksCtx },
    { key: 'sibling_tasks', value: siblingTasksCtx },
    { key: 'dependency_outcomes', value: depOutcomesCtx },
  ];

  const sectionEstimates = new Map<string, number>();
  let totalEstimate = 0;

  for (const section of sections) {
    if (section.value) {
      const est = estimateObjectTokens(section.value);
      sectionEstimates.set(section.key, est);
      totalEstimate += est;
    }
  }

  // Single-pass rebalancing: if total exceeds budget, truncate largest section
  if (totalEstimate > maxTokens) {
    let largestKey = '';
    let largestSize = 0;
    for (const [key, size] of sectionEstimates) {
      if (size > largestSize) {
        largestSize = size;
        largestKey = key;
      }
    }

    if (largestKey === 'workflow' && workflowCtx) {
      const excess = totalEstimate - maxTokens;
      const newBudget = Math.max(100, workflowBudget - excess);
      workflowCtx.source_summary = compressText(
        workflow.source_content,
        Math.floor(newBudget * 0.6),
      );
    } else if (largestKey === 'current_task' && currentTaskCtx) {
      // Re-compress checkpoints more aggressively
      const excess = totalEstimate - maxTokens;
      const newCpBudget = Math.max(100, currentTaskBudget - excess);
      let cps = currentTaskCtx.checkpoints;
      let cpEst = estimateObjectTokens(cps);
      let rebalanceRecentCount = cps.length;
      while (cpEst > newCpBudget && rebalanceRecentCount > 1) {
        rebalanceRecentCount = Math.max(1, rebalanceRecentCount - 1);
        cps = compressCheckpoints(cps, rebalanceRecentCount);
        cpEst = estimateObjectTokens(cps);
      }
      currentTaskCtx.checkpoints = cps;
    } else if (largestKey === 'prior_tasks' && priorTasksCtx) {
      const excess = totalEstimate - maxTokens;
      const removeCount = Math.ceil(excess / Math.max(1, largestSize / priorTasksCtx.length));
      priorTasksCtx = priorTasksCtx.slice(Math.min(removeCount, priorTasksCtx.length - 1));
    } else if (largestKey === 'sibling_tasks' && siblingTasksCtx) {
      const excess = totalEstimate - maxTokens;
      const removeCount = Math.ceil(excess / Math.max(1, largestSize / siblingTasksCtx.length));
      siblingTasksCtx = siblingTasksCtx.slice(Math.min(removeCount, siblingTasksCtx.length - 1));
    } else if (largestKey === 'dependency_outcomes' && depOutcomesCtx) {
      const excess = totalEstimate - maxTokens;
      const removeCount = Math.ceil(excess / Math.max(1, largestSize / depOutcomesCtx.length));
      depOutcomesCtx = depOutcomesCtx.slice(Math.min(removeCount, depOutcomesCtx.length - 1));
    }

    // Recalculate total using current variable values (array sections may have been reassigned)
    const updatedSections: (object | undefined)[] = [
      workflowCtx,
      currentTaskCtx,
      priorTasksCtx,
      siblingTasksCtx,
      depOutcomesCtx,
    ];
    totalEstimate = 0;
    for (const section of updatedSections) {
      if (section) {
        totalEstimate += estimateObjectTokens(section);
      }
    }
  }

  return {
    workflow: workflowCtx,
    current_task: currentTaskCtx,
    prior_tasks: priorTasksCtx,
    sibling_tasks: siblingTasksCtx,
    dependency_outcomes: depOutcomesCtx,
    token_estimate: totalEstimate,
  };
}
