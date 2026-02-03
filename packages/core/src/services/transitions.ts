import type { TaskStatus } from '../types/task';
import type { WorkflowStatus } from '../types/workflow';

export const WORKFLOW_TRANSITIONS: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  planning: ['ready', 'abandoned'],
  ready: ['in_progress', 'abandoned'],
  in_progress: ['paused', 'completed', 'failed', 'abandoned'],
  paused: ['in_progress', 'abandoned'],
  failed: ['in_progress'],
  completed: [],
  abandoned: [],
};

export function isValidWorkflowTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  const allowed = WORKFLOW_TRANSITIONS[from];
  return allowed.includes(to);
}

export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ['planning'],
  blocked: ['planning'],
  planning: ['in_progress', 'completed'],
  in_progress: ['completed', 'paused', 'failed'],
  paused: ['in_progress'],
  failed: ['pending', 'skipped'],
  completed: [],
  skipped: [],
};

export function isValidTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}
