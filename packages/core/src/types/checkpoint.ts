export type CheckpointType =
  | 'plan'
  | 'replan'
  | 'progress'
  | 'decision'
  | 'error'
  | 'recovery'
  | 'complete';

export interface Checkpoint {
  id: string;
  task_id: string;
  sequence: number;
  checkpoint_type: CheckpointType;
  summary: string;
  detail: string | null;
  files_changed: string | null;
  created_at: number;
}
