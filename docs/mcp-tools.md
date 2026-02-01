# MCP Server Interface

## Tool Categories

1. **Workflow Lifecycle** - Create, read, update workflows
2. **Task Management** - CRUD operations on tasks
3. **Checkpoint Recording** - Fine-grained progress tracking
4. **Context Loading** - Optimized context retrieval for recovery
5. **Orchestration Queries** - What's next, what's blocked, DAG traversal
6. **Workspace Management** - Git worktree tracking for parallel execution
7. **Repository Management** - Multi-repo support (global mode)
8. **Template Management** - Reusable workflow patterns
9. **Agent Management** - Registration, heartbeat, task claiming
10. **Messaging** - Inter-agent communication

## Tool Definitions

### Workflow Lifecycle

```typescript
/**
 * Create a new workflow
 */
workflow_create(params: {
  name: string;
  source_type: 'prompt' | 'github_issue' | 'linear' | 'jira' | 'custom';
  source_ref?: string;           // URL or identifier
  source_content: string;        // The actual prompt/issue content
  repository_path?: string;      // Defaults to cwd, used in global mode

  // Parallelism configuration
  max_parallel_tasks?: number;   // Default 1 (sequential execution)
  auto_create_workspaces?: boolean;  // Auto-create worktrees for parallel tasks
}): Promise<{
  id: string;
  name: string;
  status: 'planning';
  max_parallel_tasks: number;
}>

/**
 * Get workflow details
 */
workflow_get(params: {
  id: string;
  include_tasks?: boolean;           // Default false
  include_task_summaries?: boolean;  // Default true if include_tasks
}): Promise<Workflow>

/**
 * List workflows
 */
workflow_list(params: {
  repository_path?: string;      // Filter by repository (global mode)
  status?: WorkflowStatus[];     // Filter by status
  limit?: number;                // Default 20
  offset?: number;
}): Promise<{ workflows: WorkflowSummary[]; total: number }>

/**
 * Set the initial plan for a workflow
 * This creates all tasks from the plan
 */
workflow_set_plan(params: {
  id: string;
  plan: {
    summary: string;             // Brief description
    approach: string;            // High-level approach
    tasks: Array<{
      name: string;
      description: string;
      sequence: number;          // Parallel tasks share sequence number
      parallel_group?: string;   // Group ID for parallelizable tasks
      depends_on?: string[];     // Task names this depends on
      estimated_complexity?: 'low' | 'medium' | 'high';
      files_likely_affected?: string[];
    }>;
    risks?: string[];
    assumptions?: string[];
  };
}): Promise<{
  workflow_id: string;
  tasks_created: number;
  parallelizable_groups: number;  // Count of parallel groups identified
  status: 'ready';
}>

/**
 * Update workflow status
 */
workflow_update_status(params: {
  id: string;
  status: WorkflowStatus;
  reason?: string;
}): Promise<{ success: boolean }>

/**
 * Update workflow parallelism settings
 */
workflow_set_parallelism(params: {
  id: string;
  max_parallel_tasks: number;    // 1 = sequential, >1 = parallel
  auto_create_workspaces?: boolean;
}): Promise<{ success: boolean }>
```

### Task Management

```typescript
/**
 * Get task details
 */
task_get(params: {
  id: string;
  include_checkpoints?: boolean;  // Default false
  checkpoint_limit?: number;      // Default all
}): Promise<Task>

/**
 * Set task plan (when task moves to planning status)
 */
task_set_plan(params: {
  id: string;
  plan: {
    approach: string;
    steps: string[];
    files_to_modify?: string[];
    files_to_create?: string[];
    context_needed?: string[];    // Specific context to load
  };
  context?: Record<string, any>;  // Additional context to store
}): Promise<{ success: boolean }>

/**
 * Update task status
 */
task_update_status(params: {
  id: string;
  status: TaskStatus;
  outcome?: string;               // Required for 'completed'
  outcome_detail?: Record<string, any>;
  error?: string;                 // Required for 'failed'
}): Promise<{ success: boolean }>

/**
 * Replan a failed or in-progress task
 * Creates a 'replan' checkpoint and updates the plan
 */
task_replan(params: {
  id: string;
  reason: string;
  new_plan: {
    approach: string;
    steps: string[];
    files_to_modify?: string[];
    files_to_create?: string[];
  };
}): Promise<{ success: boolean; checkpoint_id: string }>
```

### Checkpoint Recording

```typescript
/**
 * Add a checkpoint to a task
 * Checkpoints enable fine-grained recovery
 */
checkpoint_add(params: {
  task_id: string;
  type: CheckpointType;           // 'plan' | 'progress' | 'decision' | 'error' | 'recovery' | 'complete'
  summary: string;
  detail?: Record<string, any>;
  files_changed?: string[];
}): Promise<{ id: string; sequence: number }>

/**
 * Get checkpoints for a task
 */
checkpoint_list(params: {
  task_id: string;
  type?: CheckpointType[];        // Filter by type
  since_sequence?: number;        // Get only newer checkpoints
  limit?: number;
}): Promise<{ checkpoints: Checkpoint[] }>
```

### Context Loading

```typescript
/**
 * Load optimized context for a task
 * Primary tool for context recovery after clearing
 * Respects token budgets and compresses appropriately
 */
task_load_context(params: {
  task_id: string;
  include?: {
    workflow_plan?: boolean;      // Default true
    workflow_summary?: boolean;   // Default true (compressed)
    prior_task_outcomes?: boolean; // Default true
    prior_task_full?: boolean;    // Default false (just summaries)
    sibling_status?: boolean;     // Default true (parallel tasks)
    dependency_outcomes?: boolean; // Default true
    all_checkpoints?: boolean;    // Default false
    recent_checkpoints?: number;  // Default 5
  };
  max_tokens?: number;            // Budget, default 8000
}): Promise<{
  workflow: {
    id: string;
    name: string;
    source_type: string;
    source_summary: string;       // Compressed source
    plan_summary: string;
    status: string;
    max_parallel_tasks: number;
  };
  current_task: {
    id: string;
    name: string;
    description: string;
    plan: object;
    context: object;
    checkpoints: Checkpoint[];
    status: string;
  };
  prior_tasks: Array<{
    id: string;
    name: string;
    outcome: string;              // Summary only unless full requested
    status: string;
  }>;
  sibling_tasks?: Array<{
    id: string;
    name: string;
    status: string;
    brief_summary?: string;
  }>;
  dependency_outcomes?: Array<{
    task_id: string;
    task_name: string;
    outcome: string;
  }>;
  token_estimate: number;
}>

/**
 * Get compressed workflow summary
 * Useful for CLAUDE.md or quick status checks
 */
workflow_get_summary(params: {
  id: string;
  format?: 'json' | 'markdown';   // Default 'json'
}): Promise<{
  summary: string | object;
  token_estimate: number;
}>
```

### Orchestration Queries

```typescript
/**
 * Get next actionable tasks
 * Returns tasks that are unblocked and pending/failed
 * Respects workflow parallelism settings
 */
workflow_next_tasks(params: {
  workflow_id: string;
  include_failed?: boolean;       // Default true (for retry)
}): Promise<{
  tasks: Array<{
    id: string;
    name: string;
    description: string;
    can_parallelize: boolean;     // Based on parallel_group
    parallel_with?: string[];     // Other task IDs in same group
    dependencies_completed: string[];
  }>;
  max_parallel: number;           // From workflow config
  recommended_count: number;      // min(available, max_parallel)
  workflow_status: string;
  all_complete: boolean;
}>

/**
 * Get workflow progress overview
 */
workflow_progress(params: {
  workflow_id: string;
}): Promise<{
  total_tasks: number;
  by_status: Record<TaskStatus, number>;
  completed_sequence: number;     // Highest completed sequence
  current_sequence: number;       // Current working sequence
  blocked_tasks: Array<{
    id: string;
    name: string;
    blocked_by: string[];         // Task names
  }>;
  parallel_groups: Array<{
    group_id: string;
    task_count: number;
    completed: number;
  }>;
  estimated_remaining: number;    // Based on completed rate
}>

/**
 * Check if task dependencies are satisfied
 */
task_check_dependencies(params: {
  task_id: string;
}): Promise<{
  satisfied: boolean;
  pending: Array<{ id: string; name: string; status: string }>;
  completed: Array<{ id: string; name: string; outcome: string }>;
}>
```

### Workspace Management

```typescript
/**
 * Register a workspace (git worktree) for parallel task execution
 */
workspace_create(params: {
  workflow_id: string;
  path: string;
  branch: string;
  base_branch?: string;
  task_ids?: string[];            // Tasks assigned to this workspace
}): Promise<{ id: string }>

/**
 * Update workspace status
 */
workspace_update(params: {
  id: string;
  status?: 'active' | 'merged' | 'abandoned';
  merge_commit?: string;
}): Promise<{ success: boolean }>

/**
 * List workspaces for a workflow
 */
workspace_list(params: {
  workflow_id: string;
  status?: string[];
}): Promise<{ workspaces: Workspace[] }>

/**
 * Assign task to workspace
 */
task_assign_workspace(params: {
  task_id: string;
  workspace_id: string;
}): Promise<{ success: boolean }>
```

### Repository Management (Global Mode)

```typescript
/**
 * Register a repository
 */
repository_register(params: {
  path: string;                   // Absolute path
  name?: string;                  // Friendly name
}): Promise<{ id: string }>

/**
 * List registered repositories
 */
repository_list(params: {
  limit?: number;
  offset?: number;
}): Promise<{ repositories: Repository[] }>

/**
 * Get repository by path
 */
repository_get(params: {
  path: string;
}): Promise<Repository | null>
```

### Template Management

```typescript
/**
 * Create a workflow template from an existing workflow
 * or from a template definition
 */
template_create(params: {
  name: string;
  description?: string;
  // Either provide a source workflow to templatize
  from_workflow_id?: string;
  // Or provide a template definition directly
  template?: {
    tasks: Array<{
      name: string;
      description: string;
      sequence: number;
      parallel_group?: string;
      depends_on?: string[];
    }>;
    variables?: Array<{
      name: string;
      description: string;
      required: boolean;
      default?: string;
    }>;
  };
}): Promise<{ id: string }>

/**
 * List available templates
 */
template_list(): Promise<{ templates: WorkflowTemplate[] }>

/**
 * Create a workflow from a template
 */
template_apply(params: {
  template_id: string;
  workflow_name: string;
  variables?: Record<string, string>;
  repository_path?: string;
  max_parallel_tasks?: number;
}): Promise<{ workflow_id: string }>
```

### Agent Management

```typescript
/**
 * Register a new agent
 * Called on agent startup
 */
agent_register(params: {
  name: string;                           // Human-friendly name
  runtime: 'claude_code' | 'codex' | 'opencode' | 'custom';
  role?: 'coordinator' | 'worker';        // Default 'worker'
  capabilities?: string[];                // e.g., ['typescript', 'python', 'testing']
  workspace_path?: string;
  metadata?: Record<string, any>;
}): Promise<{
  id: string;
  name: string;
  status: 'online';
}>

/**
 * Send heartbeat to keep agent online
 * Should be called periodically (e.g., every 30 seconds)
 */
agent_heartbeat(params: {
  agent_id: string;
  current_task_id?: string;               // Task being worked on
  status?: 'online' | 'busy';
}): Promise<{ success: boolean; next_heartbeat_ms: number }>

/**
 * Update agent status
 */
agent_update(params: {
  id: string;
  status?: 'online' | 'offline' | 'busy';
  current_task_id?: string | null;
  workspace_path?: string;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean }>

/**
 * Get agent details
 */
agent_get(params: {
  id: string;
}): Promise<Agent>

/**
 * List agents
 */
agent_list(params: {
  status?: ('online' | 'offline' | 'busy')[];
  role?: 'coordinator' | 'worker';
  runtime?: string;
}): Promise<{ agents: Agent[] }>

/**
 * Unregister agent (mark offline)
 * Called on agent shutdown
 */
agent_unregister(params: {
  id: string;
}): Promise<{ success: boolean }>

/**
 * Claim a task for an agent
 * Atomically assigns task if unclaimed
 */
task_claim(params: {
  task_id: string;
  agent_id: string;
}): Promise<{
  success: boolean;
  already_claimed_by?: string;  // Agent ID if already claimed
}>

/**
 * Release a task claim
 */
task_release(params: {
  task_id: string;
  agent_id: string;
  reason?: string;
}): Promise<{ success: boolean }>

/**
 * Get available (unclaimed) tasks for an agent
 */
task_get_available(params: {
  workflow_id?: string;                   // Filter by workflow
  agent_id: string;                       // For capability matching
  limit?: number;
}): Promise<{ tasks: Task[] }>
```

### Messaging

```typescript
/**
 * Send a message to another agent
 */
message_send(params: {
  sender_id: string;
  recipient_id: string;
  message_type: 'task_assignment' | 'status_update' | 'query' | 'response' | 'notification';
  subject?: string;
  body: string | Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  // Optional context
  workflow_id?: string;
  task_id?: string;
  reply_to_id?: string;                   // For threaded replies
}): Promise<{ id: string; thread_id: string }>

/**
 * Broadcast a message to multiple agents
 */
message_broadcast(params: {
  sender_id: string;
  recipient_filter?: {
    role?: 'coordinator' | 'worker';
    status?: 'online' | 'busy';
    runtime?: string;
  };
  message_type: 'notification' | 'status_update';
  subject?: string;
  body: string | Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  workflow_id?: string;
}): Promise<{ sent_count: number; message_ids: string[] }>

/**
 * Get messages for an agent (inbox)
 */
message_list(params: {
  agent_id: string;
  status?: 'unread' | 'read' | 'all';     // Default 'unread'
  message_type?: string[];
  priority?: string[];
  workflow_id?: string;
  thread_id?: string;                     // Get all messages in a thread
  limit?: number;                         // Default 20
  since?: number;                         // Unix timestamp
}): Promise<{ messages: Message[]; unread_count: number }>

/**
 * Get a specific message
 */
message_get(params: {
  id: string;
  mark_read?: boolean;                    // Default true
}): Promise<Message>

/**
 * Mark messages as read
 */
message_mark_read(params: {
  message_ids: string[];
}): Promise<{ success: boolean }>

/**
 * Archive messages
 */
message_archive(params: {
  message_ids: string[];
}): Promise<{ success: boolean }>

/**
 * Get unread message count
 */
message_count_unread(params: {
  agent_id: string;
  priority?: string[];                    // Filter by priority
}): Promise<{ count: number; by_priority: Record<string, number> }>
```
