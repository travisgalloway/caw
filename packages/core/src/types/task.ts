export type TaskStatus =
  | 'pending'
  | 'blocked'
  | 'planning'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'skipped';

export type TaskDependencyType = 'blocks' | 'informs';

export interface Task {
  id: string;
  workflow_id: string;
  name: string;
  description: string | null;
  status: TaskStatus;
  sequence: number;
  parallel_group: string | null;
  plan: string | null;
  plan_summary: string | null;
  context: string | null;
  outcome: string | null;
  outcome_detail: string | null;
  workspace_id: string | null;
  repository_id: string | null;
  assigned_agent_id: string | null;
  claimed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface TaskDependency {
  task_id: string;
  depends_on_id: string;
  dependency_type: TaskDependencyType;
}
