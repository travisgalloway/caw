# Agent Protocol

This document defines the protocol agents follow when interacting with caw's MCP server. It covers the full lifecycle for a single agent and the coordination protocol for multi-agent workflows.

## Agent Lifecycle

Every agent session follows a 7-step sequence of MCP tool calls:

```
agent_register → task_claim → task_load_context → checkpoint_add → agent_heartbeat → task_update_status → agent_unregister
```

### Step 1: Register

On startup, the agent registers itself with the MCP server.

```typescript
const agent = await agent_register({
  name: "worker-1",
  runtime: "claude_code",
  role: "worker",
  capabilities: ["typescript", "testing"],
  workspace_path: "/Users/travis/projects/myapp",
});
// { id: "ag_a1b2c3d4e5f6", name: "worker-1", status: "online" }
```

**Required params:** `name`, `runtime`
**Optional params:** `role` (default `"worker"`), `capabilities`, `workspace_path`, `metadata`
**Error codes:** None (always succeeds for valid input)

### Step 2: Claim a Task

The agent discovers available tasks and atomically claims one.

```typescript
// Find available tasks
const { tasks } = await workflow_next_tasks({
  workflow_id: "wf_a1b2c3d4e5f6",
});

// Claim the first available task
const claim = await task_claim({
  task_id: tasks[0].id,
  agent_id: agent.id,
});

if (claim.success) {
  // Task is now exclusively assigned to this agent
} else {
  // Another agent claimed it first
  // claim.already_claimed_by = "ag_other..."
}
```

**Required params:** `task_id`, `agent_id`
**Response on success:** `{ success: true }`
**Response on conflict:** `{ success: false, already_claimed_by: "ag_..." }`
**Error codes:** `TASK_NOT_FOUND`, `AGENT_NOT_FOUND`

### Step 3: Load Context

After claiming a task, load all relevant context for execution.

```typescript
const context = await task_load_context({
  task_id: "tk_xyz...",
  include: {
    workflow_plan: true,
    prior_task_outcomes: true,
    dependency_outcomes: true,
    recent_checkpoints: 5,
  },
  max_tokens: 8000,
});

// context.workflow     — workflow summary and plan
// context.current_task — task details, plan, checkpoints
// context.prior_tasks  — outcomes from completed tasks
// context.dependency_outcomes — outcomes from direct dependencies
```

**Required params:** `task_id`
**Optional params:** `include` (fine-grained control), `max_tokens` (default 8000)
**Error codes:** `TASK_NOT_FOUND`

### Step 4: Record Checkpoints

While working, the agent records progress checkpoints for recovery.

```typescript
await checkpoint_add({
  task_id: "tk_xyz...",
  type: "progress",
  summary: "Installed OAuth dependencies and created passport config",
  files_changed: ["package.json", "src/auth/passport.ts"],
});

await checkpoint_add({
  task_id: "tk_xyz...",
  type: "decision",
  summary: "Chose JWT over session cookies for stateless auth",
  detail: { reason: "Better for API-first architecture" },
});
```

**Required params:** `task_id`, `type`, `summary`
**Optional params:** `detail`, `files_changed`
**Checkpoint types:** `plan`, `progress`, `decision`, `error`, `recovery`, `complete`
**Error codes:** `TASK_NOT_FOUND`

### Step 5: Send Heartbeats

Agents send periodic heartbeats to stay online. Stale agents are marked offline after timeout.

```typescript
const hb = await agent_heartbeat({
  agent_id: agent.id,
  current_task_id: "tk_xyz...",
  status: "busy",
});
// { success: true, next_heartbeat_ms: 30000 }
```

**Required params:** `agent_id`
**Optional params:** `current_task_id`, `status`
**Recommended interval:** Every 30 seconds (use `next_heartbeat_ms` from response)
**Error codes:** `AGENT_NOT_FOUND`

### Step 6: Update Task Status

When the task is done (or fails), update its status.

```typescript
// On success
await task_update_status({
  id: "tk_xyz...",
  status: "completed",
  outcome: "OAuth infrastructure setup complete",
  outcome_detail: {
    files_created: ["src/auth/passport.ts", "src/config/oauth.ts"],
    packages_added: ["passport", "passport-google-oauth20"],
  },
});

// On failure
await task_update_status({
  id: "tk_xyz...",
  status: "failed",
  error: "Google OAuth callback URL rejected by provider",
});
```

**Required params:** `id`, `status`
**Required for completed:** `outcome`
**Required for failed:** `error`
**Error codes:** `TASK_NOT_FOUND`, `INVALID_TRANSITION`

### Step 7: Unregister

On shutdown, the agent unregisters and is marked offline.

```typescript
await agent_unregister({ id: agent.id });
// { success: true }
```

**Required params:** `id`
**Error codes:** `AGENT_NOT_FOUND`

## Context Recovery

When an agent's context is cleared (e.g., conversation reset), it recovers using this sequence:

```
workflow_list → task_load_context → resume work
```

### Recovery Steps

```typescript
// 1. Find active workflows
const { workflows } = await workflow_list({
  status: ["in_progress"],
});

// 2. Check progress to find current task
const progress = await workflow_progress({
  workflow_id: workflows[0].id,
});

// 3. Load full context for the in-progress task
const context = await task_load_context({
  task_id: "tk_current...",
  include: {
    workflow_plan: true,
    prior_task_outcomes: true,
    all_checkpoints: true,  // Load ALL checkpoints for recovery
  },
});

// 4. Resume from last checkpoint
// context.current_task.checkpoints contains the full history
// Pick up where the previous context left off
```

The key difference from initial context loading is `all_checkpoints: true` — during recovery you want the complete checkpoint history to understand exactly where work stopped.

## Agent Coordination Protocol

When multiple agents work on the same workflow, they coordinate through atomic task claiming and status polling.

### Task Discovery and Claiming

```
┌─────────┐                    ┌───────────┐                    ┌─────────┐
│ Agent A  │                    │ MCP Server│                    │ Agent B  │
└────┬────┘                    └─────┬─────┘                    └────┬────┘
     │                               │                               │
     │  workflow_next_tasks()        │                               │
     │──────────────────────────────►│                               │
     │  [tk_1, tk_2]                 │                               │
     │◄──────────────────────────────│                               │
     │                               │   workflow_next_tasks()       │
     │                               │◄──────────────────────────────│
     │                               │   [tk_1, tk_2]               │
     │                               │──────────────────────────────►│
     │                               │                               │
     │  task_claim(tk_1, agent_a)    │                               │
     │──────────────────────────────►│                               │
     │  { success: true }            │                               │
     │◄──────────────────────────────│                               │
     │                               │  task_claim(tk_1, agent_b)   │
     │                               │◄──────────────────────────────│
     │                               │  { success: false,           │
     │                               │    already_claimed_by: a }   │
     │                               │──────────────────────────────►│
     │                               │                               │
     │                               │  task_claim(tk_2, agent_b)   │
     │                               │◄──────────────────────────────│
     │                               │  { success: true }           │
     │                               │──────────────────────────────►│
     │                               │                               │
     │  (works on tk_1)              │              (works on tk_2) │
     │                               │                               │
```

### Claim Conflict Resolution

When `task_claim` returns `{ success: false, already_claimed_by: "ag_..." }`, the agent should:

1. Pick the next task from the `workflow_next_tasks` result
2. Attempt `task_claim` on that task
3. If all tasks are claimed, re-poll with `workflow_next_tasks` after a short delay
4. If no tasks remain, the agent can idle or unregister

```typescript
async function claimNextTask(agentId: string, workflowId: string): Promise<string | null> {
  const { tasks } = await workflow_next_tasks({ workflow_id: workflowId });

  for (const task of tasks) {
    const claim = await task_claim({ task_id: task.id, agent_id: agentId });
    if (claim.success) {
      return task.id;
    }
    // Already claimed — try next task
  }

  // All available tasks claimed — no work available right now
  return null;
}
```

### Workspace Isolation

When agents work in parallel, each should operate in its own workspace (git worktree):

```typescript
// Agent A creates a workspace for its task
const ws = await workspace_create({
  workflow_id: "wf_a1b2c3d4e5f6",
  branch: "feature/google-oauth",
  base_branch: "main",
  create_worktree: true,
  repo_path: "/projects/myapp",
  task_ids: ["tk_google..."],
});

// Agent B does the same for its task
const ws2 = await workspace_create({
  workflow_id: "wf_a1b2c3d4e5f6",
  branch: "feature/github-oauth",
  base_branch: "main",
  create_worktree: true,
  repo_path: "/projects/myapp",
  task_ids: ["tk_github..."],
});
```

### Cleanup

When a workspace is no longer needed, clean up the worktree:

```typescript
await workspace_update({
  id: ws.id,
  status: "merged",
  merge_commit: "abc123...",
  cleanup_worktree: true,
});
```

## Example CLAUDE.md Section

Add this to your project's `CLAUDE.md` to instruct Claude Code to use caw for workflow persistence:

```markdown
## Workflow Management

This project uses caw for durable workflow execution. When working on multi-step tasks:

1. **Start**: Register as an agent, then check for active workflows
   - `agent_register` with runtime `claude_code`
   - `workflow_list` with status `in_progress` to find existing work

2. **Resume or Create**: Either resume an in-progress workflow or create a new one
   - Resume: `task_load_context` on the current task
   - New: `workflow_create` → `workflow_set_plan` → `workflow_next_tasks`

3. **Work Loop**: For each task:
   - `task_claim` to claim the task
   - `task_load_context` for full context
   - `task_set_plan` to record your approach
   - `task_update_status` to `in_progress`
   - `checkpoint_add` after each significant step
   - `task_update_status` to `completed` with outcome

4. **Heartbeat**: Call `agent_heartbeat` periodically during long tasks

5. **Shutdown**: `agent_unregister` when done
```
