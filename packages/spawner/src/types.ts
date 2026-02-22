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
  branch?: string;
  issueContext?: string;
  /** Use Claude Code's native --worktree flag instead of caw-managed worktrees. */
  ephemeralWorktree?: boolean;
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
  | 'agent_query'
  | 'workflow_all_complete'
  | 'workflow_awaiting_merge'
  | 'workflow_stalled'
  | 'workflow_failed';

export interface SpawnerEventData {
  agent_started: { agentId: string; taskId: string };
  agent_completed: { agentId: string; taskId: string; result: string };
  agent_failed: { agentId: string; taskId: string; error: string };
  agent_retrying: { agentId: string; taskId: string; attempt: number };
  agent_query: { agentId: string; taskId: string; message: string };
  workflow_all_complete: { workflowId: string };
  workflow_awaiting_merge: { workflowId: string; prUrls: string[] };
  workflow_stalled: { workflowId: string; reason: string };
  workflow_failed: { workflowId: string; error: string };
}

export interface WorkflowRunnerReporter {
  onAgentStarted?(data: SpawnerEventData['agent_started']): void;
  onAgentCompleted?(data: SpawnerEventData['agent_completed']): void;
  onAgentFailed?(data: SpawnerEventData['agent_failed']): void;
  onAgentRetrying?(data: SpawnerEventData['agent_retrying']): void;
  onAgentQuery?(data: SpawnerEventData['agent_query']): void;
  onWorkflowStalled?(data: SpawnerEventData['workflow_stalled']): void;
  onWorkflowFailed?(data: SpawnerEventData['workflow_failed']): void;
  onWorkflowComplete?(data: SpawnerEventData['workflow_all_complete']): void;
  onWorkflowAwaitingMerge?(data: SpawnerEventData['workflow_awaiting_merge']): void;
}

export type PostCompletionHook = (workflowId: string, prUrls: string[]) => Promise<void>;

export interface WorkflowRunnerOptions {
  spawnerConfig: SpawnerConfig;
  reporter?: WorkflowRunnerReporter;
  postCompletionHook?: PostCompletionHook;
  detach?: boolean;
}

export type WorkflowRunnerResult =
  | { outcome: 'completed' }
  | { outcome: 'awaiting_merge'; prUrls: string[] }
  | { outcome: 'failed'; error: string }
  | { outcome: 'stalled'; reason: string }
  | { outcome: 'detached' };
