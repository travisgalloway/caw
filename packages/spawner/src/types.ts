import type { ChildProcess, SpawnOptions } from 'node:child_process';

export type PermissionMode = 'bypassPermissions' | 'acceptEdits';

export interface SpawnerConfig {
  workflowId: string;
  maxAgents: number;
  model: string;
  permissionMode: PermissionMode;
  maxTurns: number;
  maxBudgetUsd?: number;
  mcpServerUrl: string;
  cwd: string;
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
}

export interface AgentHandle {
  agentId: string;
  taskId: string;
  sessionId: string | null;
  status: 'starting' | 'running' | 'completed' | 'failed' | 'aborted';
  startedAt: number;
  completedAt: number | null;
  retryCount: number;
  error: string | null;
}

export interface SpawnResult {
  success: boolean;
  agentHandles: AgentHandle[];
  error?: string;
}

export interface SuspendResult {
  success: boolean;
  agentsStopped: number;
  tasksReleased: number;
  error?: string;
}

export interface ResumeResult {
  success: boolean;
  agentsSpawned: number;
  tasksAvailable: number;
  error?: string;
}

export interface ExecutionStatus {
  workflowId: string;
  status: 'idle' | 'running' | 'suspended' | 'completed' | 'failed';
  agents: AgentHandle[];
  progress: {
    totalTasks: number;
    completed: number;
    inProgress: number;
    failed: number;
    remaining: number;
  };
  startedAt: number | null;
  suspendedAt: number | null;
}

export interface SpawnerMetadata {
  spawner_id: string;
  max_agents: number;
  model: string;
  permission_mode: string;
  started_at: number;
  suspended_at: number | null;
}

export type SpawnerEvent =
  | 'agent_started'
  | 'agent_completed'
  | 'agent_failed'
  | 'agent_retrying'
  | 'workflow_all_complete'
  | 'workflow_stalled'
  | 'workflow_failed';

export interface SpawnerEventData {
  agent_started: { agentId: string; taskId: string };
  agent_completed: { agentId: string; taskId: string; result: string };
  agent_failed: { agentId: string; taskId: string; error: string };
  agent_retrying: { agentId: string; taskId: string; attempt: number };
  workflow_all_complete: { workflowId: string };
  workflow_stalled: { workflowId: string; reason: string };
  workflow_failed: { workflowId: string; error: string };
}
