const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface ApiResponse<T> {
  data: T;
  meta?: { total?: number; page?: number; limit?: number };
}

interface ApiError {
  error: { code: string; message: string };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, init);

  if (!res.ok) {
    const error = (await res.json()) as ApiError;
    throw new Error(error.error?.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<ApiResponse<T>>;
}

// --- Workflows ---

export interface WorkflowSummary {
  id: string;
  name: string;
  status: string;
  source_type: string;
  created_at: number;
  updated_at: number;
}

export interface Workflow {
  id: string;
  name: string;
  source_type: string;
  source_ref: string | null;
  source_content: string | null;
  status: string;
  initial_plan: string | null;
  plan_summary: string | null;
  created_at: number;
  updated_at: number;
  max_parallel_tasks: number;
  auto_create_workspaces: number;
  config: string | null;
  locked_by_session_id: string | null;
  locked_at: number | null;
  tasks: Task[];
}

export interface Task {
  id: string;
  workflow_id: string;
  name: string;
  description: string | null;
  status: string;
  plan: string | null;
  outcome: string | null;
  outcome_detail: string | null;
  sequence: number;
  parallel_group: string | null;
  assigned_agent_id: string | null;
  claimed_at: number | null;
  workspace_id: string | null;
  repository_id: string | null;
  context: string | null;
  created_at: number;
  updated_at: number;
}

export interface Agent {
  id: string;
  workflow_id: string | null;
  name: string;
  runtime: string;
  role: string;
  status: string;
  capabilities: string | null;
  current_task_id: string | null;
  workspace_path: string | null;
  last_heartbeat: number;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  sender_id: string | null;
  recipient_id: string;
  message_type: string;
  subject: string | null;
  body: string;
  priority: string;
  status: string;
  workflow_id: string | null;
  task_id: string | null;
  reply_to_id: string | null;
  thread_id: string;
  created_at: number;
  read_at: number | null;
  expires_at: number | null;
}

export interface ProgressResult {
  total_tasks: number;
  by_status: Record<string, number>;
  completed_sequence: number;
  current_sequence: number;
  blocked_tasks: Array<{ id: string; name: string; blocked_by: string[] }>;
  parallel_groups: Record<string, { task_count: number; completed: number }>;
  estimated_remaining: number;
}

export interface Workspace {
  id: string;
  workflow_id: string;
  repository_id: string | null;
  path: string;
  branch: string;
  base_branch: string | null;
  status: string;
  merge_commit: string | null;
  created_at: number;
  updated_at: number;
}

export type TaskDependencyType = 'blocks' | 'informs';

export interface TaskDependency {
  task_id: string;
  depends_on_id: string;
  dependency_type: TaskDependencyType;
}

export interface WorkflowDependencies {
  tasks: Task[];
  dependencies: TaskDependency[];
}

export interface TaskDependencies {
  dependencies: TaskDependency[];
  dependents: TaskDependency[];
}

export interface StatsSummary {
  active_workflows: number;
  online_agents: number;
  unread_messages: number;
  completed_today: number;
}

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'fail';
  message: string;
}

export interface DiagnosticsResponse {
  checks: DiagnosticCheck[];
  allPassed: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  template: string;
  version: number;
  created_at: number;
  updated_at: number;
}

export interface ConfigResponse {
  config: Record<string, unknown>;
  diagnostics: {
    dbPath: string;
    repoConfigPath: string | null;
    globalConfigPath: string;
    warnings: string[];
  };
}

export interface Checkpoint {
  id: string;
  task_id: string;
  type: string;
  summary: string;
  detail: string | null;
  files_changed: string | null;
  tokens_used: number | null;
  created_at: number;
}

export interface Repository {
  id: string;
  name: string;
  path: string;
  added_at: number;
}

export const api = {
  // Workflows
  async listWorkflows(params?: { status?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return request<WorkflowSummary[]>('GET', `/api/workflows${qs ? `?${qs}` : ''}`);
  },

  async getWorkflow(id: string) {
    return request<Workflow>('GET', `/api/workflows/${id}`);
  },

  async createWorkflow(params: {
    name: string;
    source_type: string;
    source_content?: string;
    source_ref?: string;
    max_parallel_tasks?: number;
    auto_create_workspaces?: boolean;
  }) {
    return request<Workflow>('POST', '/api/workflows', params);
  },

  async updateWorkflowStatus(id: string, status: string, reason?: string) {
    return request<Workflow>('PUT', `/api/workflows/${id}/status`, { status, reason });
  },

  async setWorkflowPlan(
    id: string,
    params: {
      tasks: Array<{
        name: string;
        description?: string;
        depends_on?: number[];
        parallel_group?: string;
        estimated_complexity?: string;
      }>;
      plan_summary?: string;
    },
  ) {
    return request<{ workflow_id: string; tasks_created: number }>(
      'PUT',
      `/api/workflows/${id}/plan`,
      params,
    );
  },

  async updateWorkflowConfig(id: string, config: Record<string, unknown>) {
    return request<Workflow>('PUT', `/api/workflows/${id}/config`, config);
  },

  async getWorkflowSummary(id: string, format?: 'json' | 'markdown') {
    const qs = format ? `?format=${format}` : '';
    return request<Record<string, unknown>>('GET', `/api/workflows/${id}/summary${qs}`);
  },

  async getWorkflowProgress(id: string) {
    return request<ProgressResult>('GET', `/api/workflows/${id}/progress`);
  },

  async getNextTasks(id: string) {
    return request<{ tasks: Task[]; all_complete: boolean }>(
      'GET',
      `/api/workflows/${id}/next-tasks`,
    );
  },

  async getWorkflowDependencies(id: string) {
    return request<WorkflowDependencies>('GET', `/api/workflows/${id}/dependencies`);
  },

  // Tasks
  async listTasks(workflowId: string) {
    return request<Task[]>('GET', `/api/workflows/${workflowId}/tasks`);
  },

  async getTask(id: string, checkpoints = false) {
    return request<Task>('GET', `/api/tasks/${id}${checkpoints ? '?checkpoints=true' : ''}`);
  },

  async getTaskDependencies(id: string) {
    return request<TaskDependencies>('GET', `/api/tasks/${id}/dependencies`);
  },

  async updateTaskStatus(
    id: string,
    status: string,
    params?: { outcome?: string; error?: string },
  ) {
    return request<Task>('PUT', `/api/tasks/${id}/status`, { status, ...params });
  },

  async setTaskPlan(
    id: string,
    params: {
      plan: string;
      context?: string;
    },
  ) {
    return request<Task>('PUT', `/api/tasks/${id}/plan`, params);
  },

  async listCheckpoints(taskId: string) {
    return request<Checkpoint[]>('GET', `/api/tasks/${taskId}/checkpoints`);
  },

  async addCheckpoint(
    taskId: string,
    params: {
      type: string;
      summary: string;
      detail?: string;
      files_changed?: string[];
      tokens_used?: number;
    },
  ) {
    return request<Checkpoint>('POST', `/api/tasks/${taskId}/checkpoints`, params);
  },

  async checkTaskDependencies(taskId: string) {
    return request<{ satisfied: boolean; pending: string[] }>(
      'GET',
      `/api/tasks/${taskId}/check-dependencies`,
    );
  },

  // Agents
  async listAgents(params?: {
    workflow_id?: string;
    status?: string;
    role?: string;
    runtime?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.workflow_id) query.set('workflow_id', params.workflow_id);
    if (params?.status) query.set('status', params.status);
    if (params?.role) query.set('role', params.role);
    if (params?.runtime) query.set('runtime', params.runtime);
    const qs = query.toString();
    return request<Agent[]>('GET', `/api/agents${qs ? `?${qs}` : ''}`);
  },

  async getAgent(id: string) {
    return request<Agent>('GET', `/api/agents/${id}`);
  },

  async registerAgent(params: {
    name: string;
    runtime: string;
    role: string;
    workflow_id?: string;
    capabilities?: string[];
    workspace_path?: string;
    metadata?: Record<string, unknown>;
  }) {
    return request<Agent>('POST', '/api/agents', params);
  },

  async updateAgent(
    id: string,
    params: {
      status?: string;
      current_task_id?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    return request<Agent>('PUT', `/api/agents/${id}`, params);
  },

  async sendHeartbeat(id: string) {
    return request<{ ok: boolean }>('PUT', `/api/agents/${id}/heartbeat`);
  },

  async unregisterAgent(id: string) {
    return request<{ success: boolean }>('DELETE', `/api/agents/${id}`);
  },

  // Messages
  async listMessages(params?: { limit?: number }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<Message[]>('GET', `/api/messages${qs ? `?${qs}` : ''}`);
  },

  async listAgentMessages(agentId: string) {
    return request<Message[]>('GET', `/api/agents/${agentId}/messages`);
  },

  async getUnreadCount() {
    return request<{ count: number }>('GET', '/api/messages/unread/count');
  },

  async markRead(messageIds: string[]) {
    return request<{ updated: number }>('PUT', '/api/messages/mark-read', {
      message_ids: messageIds,
    });
  },

  async sendMessage(params: {
    recipient_id: string;
    message_type: string;
    subject?: string;
    body: string;
    priority?: string;
    workflow_id?: string;
    task_id?: string;
    reply_to_id?: string;
  }) {
    return request<Message>('POST', '/api/messages', params);
  },

  async broadcastMessage(params: {
    message_type: string;
    subject?: string;
    body: string;
    priority?: string;
    workflow_id?: string;
    filter?: { role?: string; runtime?: string; status?: string };
  }) {
    return request<{ sent_to: string[] }>('POST', '/api/messages/broadcast', params);
  },

  async getMessage(id: string, markRead = false) {
    const qs = markRead ? '?mark_read=true' : '';
    return request<Message>('GET', `/api/messages/${id}${qs}`);
  },

  async getThread(threadId: string) {
    return request<Message[]>('GET', `/api/threads/${threadId}`);
  },

  async getAgentUnreadCount(agentId: string) {
    return request<{ count: number; by_priority: Record<string, number> }>(
      'GET',
      `/api/agents/${agentId}/messages/unread`,
    );
  },

  // Workspaces
  async listWorkspaces(workflowId: string) {
    return request<Workspace[]>('GET', `/api/workflows/${workflowId}/workspaces`);
  },

  async getWorkspace(id: string) {
    return request<Workspace>('GET', `/api/workspaces/${id}`);
  },

  async createWorkspace(
    workflowId: string,
    params: {
      path: string;
      branch: string;
      base_branch?: string;
      repository_id?: string;
    },
  ) {
    return request<Workspace>('POST', `/api/workflows/${workflowId}/workspaces`, params);
  },

  async updateWorkspace(
    id: string,
    params: {
      status?: string;
      merge_commit?: string;
      pr_url?: string;
      config?: Record<string, unknown>;
    },
  ) {
    return request<Workspace>('PUT', `/api/workspaces/${id}`, params);
  },

  // Task management
  async addTask(
    workflowId: string,
    params: {
      name: string;
      description?: string;
      parallel_group?: string;
      estimated_complexity?: string;
      depends_on?: string[];
    },
  ) {
    return request<{ task_id: string; sequence: number; workflow_id: string }>(
      'POST',
      `/api/workflows/${workflowId}/tasks`,
      params,
    );
  },

  async removeTask(workflowId: string, taskId: string) {
    return request<{
      removed_task_id: string;
      dependencies_rewired: number;
      tasks_renumbered: number;
    }>('DELETE', `/api/workflows/${workflowId}/tasks/${taskId}`);
  },

  // Claim / Release
  async claimTask(id: string, agentId: string) {
    return request<Task>('POST', `/api/tasks/${id}/claim`, { agent_id: agentId });
  },

  async releaseTask(id: string, agentId: string, reason?: string) {
    return request<Task>('POST', `/api/tasks/${id}/release`, { agent_id: agentId, reason });
  },

  // Lock
  async getLockInfo(workflowId: string) {
    return request<{ locked: boolean; session_id: string | null }>(
      'GET',
      `/api/workflows/${workflowId}/lock`,
    );
  },

  async lockWorkflow(id: string, sessionId: string) {
    return request<{ locked: boolean; session_id: string; locked_at: number }>(
      'POST',
      `/api/workflows/${id}/lock`,
      { session_id: sessionId },
    );
  },

  async unlockWorkflow(id: string, sessionId: string) {
    return request<{ success: boolean }>('POST', `/api/workflows/${id}/unlock`, {
      session_id: sessionId,
    });
  },

  // Stats
  async getStatsSummary() {
    return request<StatsSummary>('GET', '/api/stats/summary');
  },

  // Setup
  async getDiagnostics() {
    return request<DiagnosticsResponse>('GET', '/api/setup/diagnostics');
  },

  // Templates
  async listTemplates() {
    return request<WorkflowTemplate[]>('GET', '/api/templates');
  },

  async getTemplate(id: string) {
    return request<WorkflowTemplate>('GET', `/api/templates/${id}`);
  },

  async createTemplate(params: {
    name: string;
    description?: string;
    from_workflow_id?: string;
    template?: { tasks: Array<Record<string, unknown>>; variables?: string[] };
  }) {
    return request<WorkflowTemplate>('POST', '/api/templates', params);
  },

  async applyTemplate(
    id: string,
    params: {
      workflow_name: string;
      variables?: Record<string, string>;
      repo_paths?: string[];
      max_parallel?: number;
    },
  ) {
    return request<{ workflow_id: string }>('POST', `/api/templates/${id}/apply`, params);
  },

  // Config
  async getConfig() {
    return request<ConfigResponse>('GET', '/api/config');
  },

  async updateConfig(config: Record<string, unknown>) {
    return request<ConfigResponse>('PUT', '/api/config', config);
  },

  // Repositories
  async listRepositories() {
    return request<Repository[]>('GET', '/api/repositories');
  },

  async registerRepository(params: { name: string; path: string }) {
    return request<Repository>('POST', '/api/repositories', params);
  },

  async getRepository(id: string) {
    return request<Repository>('GET', `/api/repositories/${id}`);
  },

  // Execution
  async startExecution(workflowId: string, params?: { max_parallel?: number }) {
    return request<{ status: string }>('POST', `/api/workflows/${workflowId}/execute`, params);
  },

  async suspendExecution(workflowId: string) {
    return request<{ status: string }>('POST', `/api/workflows/${workflowId}/suspend`);
  },

  async resumeExecution(workflowId: string) {
    return request<{ status: string }>('POST', `/api/workflows/${workflowId}/resume`);
  },

  async getExecutionStatus(workflowId: string) {
    return request<{
      running: boolean;
      active_agents: number;
      elapsed_ms: number;
    }>('GET', `/api/workflows/${workflowId}/execution-status`);
  },

  // Sessions
  async registerSession() {
    return request<{ session_id: string }>('POST', '/api/sessions');
  },
};
