const BASE_URL = '';

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

  async createWorkflow(params: { name: string; source_type: string; source_content?: string }) {
    return request<Workflow>('POST', '/api/workflows', params);
  },

  async updateWorkflowStatus(id: string, status: string, reason?: string) {
    return request<Workflow>('PUT', `/api/workflows/${id}/status`, { status, reason });
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

  // Tasks
  async listTasks(workflowId: string) {
    return request<Task[]>('GET', `/api/workflows/${workflowId}/tasks`);
  },

  async getTask(id: string, checkpoints = false) {
    return request<Task>('GET', `/api/tasks/${id}${checkpoints ? '?checkpoints=true' : ''}`);
  },

  async updateTaskStatus(
    id: string,
    status: string,
    params?: { outcome?: string; error?: string },
  ) {
    return request<Task>('PUT', `/api/tasks/${id}/status`, { status, ...params });
  },

  // Agents
  async listAgents(params?: { workflow_id?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params?.workflow_id) query.set('workflow_id', params.workflow_id);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return request<Agent[]>('GET', `/api/agents${qs ? `?${qs}` : ''}`);
  },

  async getAgent(id: string) {
    return request<Agent>('GET', `/api/agents/${id}`);
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

  // Workspaces
  async listWorkspaces(workflowId: string) {
    return request<Workspace[]>('GET', `/api/workflows/${workflowId}/workspaces`);
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

  // Task mutations
  async claimTask(id: string, agentId: string) {
    return request<{ success: boolean }>('POST', `/api/tasks/${id}/claim`, {
      agent_id: agentId,
    });
  },

  async releaseTask(id: string, agentId: string, reason?: string) {
    return request<{ success: boolean }>('POST', `/api/tasks/${id}/release`, {
      agent_id: agentId,
      reason,
    });
  },

  async addTask(
    workflowId: string,
    params: { name: string; description?: string; sequence?: number; parallel_group?: string },
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
};
