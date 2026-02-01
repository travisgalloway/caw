export type WorkspaceStatus = 'active' | 'merged' | 'abandoned';

export interface Workspace {
  id: string;
  workflow_id: string;
  path: string;
  branch: string;
  base_branch: string | null;
  status: WorkspaceStatus;
  merge_commit: string | null;
  created_at: number;
  updated_at: number;
}
