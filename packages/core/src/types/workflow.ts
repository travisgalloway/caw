export type WorkflowStatus =
  | 'planning'
  | 'ready'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'abandoned';

export interface Workflow {
  id: string;
  repository_id: string | null;
  name: string;
  source_type: string;
  source_ref: string | null;
  source_content: string | null;
  status: WorkflowStatus;
  initial_plan: string | null;
  plan_summary: string | null;
  created_at: number;
  updated_at: number;
  max_parallel_tasks: number;
  auto_create_workspaces: number;
  config: string | null;
  locked_by_session_id: string | null;
  locked_at: number | null;
}

export interface WorkflowLockInfo {
  locked: boolean;
  session_id: string | null;
  locked_at: number | null;
  session_pid: number | null;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  status: WorkflowStatus;
  created_at: number;
  updated_at: number;
}
