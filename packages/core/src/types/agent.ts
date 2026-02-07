export type AgentRole = 'coordinator' | 'worker';

export type AgentStatus = 'online' | 'offline' | 'busy';

export interface Agent {
  id: string;
  workflow_id: string | null;
  name: string;
  runtime: string;
  role: AgentRole;
  status: AgentStatus;
  capabilities: string | null;
  current_task_id: string | null;
  workspace_path: string | null;
  last_heartbeat: number | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}
