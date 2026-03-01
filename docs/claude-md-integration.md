# CLAUDE.md Integration Guide

This guide explains how to configure caw for use with Claude Code and provides a copy-paste CLAUDE.md section you can add to any project.

## What is caw?

caw is a durable execution system for coding agent workflows. It persists workflows, tasks, checkpoints, and decisions in SQLite so that agents can resume work after context clearing. It communicates with agents via the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP).

Use caw when you have multi-step tasks that may exceed a single context window — feature implementations, large refactors, multi-file bug fixes, or any work that benefits from structured task tracking.

## MCP Server Configuration

Add the caw MCP server to your Claude Code settings (`.claude/settings.json` or project-level `.claude/settings.local.json`).

**From source (development):**

```json
{
  "mcpServers": {
    "caw": {
      "command": "bun",
      "args": ["./apps/cli/src/bin/cli.ts", "--server"]
    }
  }
}
```

**After global install:**

```json
{
  "mcpServers": {
    "caw": {
      "command": "caw",
      "args": ["--server"]
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CAW_TRANSPORT` | `stdio` | MCP transport: `stdio` or `http` |
| `CAW_PORT` | `3100` | HTTP port (when transport is `http`) |
| `CAW_DB_MODE` | `per-repo` | Database mode: `per-repo` or `global` |
| `CAW_REPO_PATH` | `cwd` | Repository path (used in per-repo mode) |
| `CAW_DB_PATH` | — | Explicit database file path (overrides mode) |

In `per-repo` mode (default), the database is stored at `{repo}/.caw/workflows.db`. In `global` mode, it lives at `~/.caw/workflows.db`.

## Workflow Patterns

### Creating a Workflow

When starting a multi-step task, create a workflow and set a plan:

```
workflow_create({
  name: "Implement OAuth Authentication",
  source_type: "prompt",
  source_content: "Add Google and GitHub OAuth with session management..."
})
→ { id: "wf_a1b2c3d4e5f6", status: "planning" }

workflow_set_plan({
  id: "wf_a1b2c3d4e5f6",
  plan: {
    summary: "OAuth with Google/GitHub, sessions, route protection",
    tasks: [
      { name: "Setup OAuth infrastructure", ... },
      { name: "Implement Google OAuth", parallel_group: "oauth-providers", depends_on: ["Setup OAuth infrastructure"], ... },
      { name: "Implement GitHub OAuth", parallel_group: "oauth-providers", depends_on: ["Setup OAuth infrastructure"], ... },
      { name: "Session management", depends_on: ["Implement Google OAuth", "Implement GitHub OAuth"], ... },
      { name: "Protected routes middleware", depends_on: ["Session management"], ... }
    ]
  }
})
→ { tasks_created: 5, status: "ready" }
```

Tasks with the same `parallel_group` value can run in parallel. The `depends_on` array enforces ordering.

### Checking Progress

```
workflow_progress({ workflow_id: "wf_a1b2c3d4e5f6" })
→ {
    total_tasks: 5,
    by_status: { completed: 1, in_progress: 2, pending: 1, blocked: 1 },
    completed_sequence: 1,
    current_sequence: 2,
    ...
  }
```

## Task Lifecycle

Each task follows this sequence of tool calls:

```
workflow_next_tasks → task_set_plan → task_update_status("in_progress")
  → checkpoint_add (repeat) → task_update_status("completed")
```

**Step-by-step:**

1. **Get next task** — `workflow_next_tasks({ workflow_id })` returns unblocked, pending tasks.

2. **Plan the task** — `task_set_plan({ id, plan: { approach, steps, files_to_modify } })` records your intended approach.

3. **Start work** — `task_update_status({ id, status: "in_progress" })`.

4. **Record progress** — After each significant step, call `checkpoint_add`:
   ```
   checkpoint_add({
     task_id: "tk_...",
     type: "progress",
     summary: "Created passport config and OAuth routes",
     files_changed: ["src/auth/passport.ts", "src/routes/auth.ts"]
   })
   ```
   Checkpoint types: `plan`, `progress`, `decision`, `error`, `recovery`, `complete`.

5. **Complete the task** — `task_update_status({ id, status: "completed", outcome: "OAuth infrastructure setup complete" })`.

If a task fails, use `status: "failed"` with an `error` message. You can retry with `task_replan` to record a new approach.

## Context Recovery

After context is cleared, recover with this sequence:

```
workflow_list → workflow_progress → task_load_context
```

1. **Find active workflows:**
   ```
   workflow_list({ status: ["in_progress"] })
   → { workflows: [{ id: "wf_...", name: "Implement OAuth", status: "in_progress" }] }
   ```

2. **Check progress to identify the current task:**
   ```
   workflow_progress({ workflow_id: "wf_..." })
   → { current_sequence: 2, by_status: { in_progress: 1, ... } }
   ```

3. **Load full context for recovery:**
   ```
   task_load_context({
     task_id: "tk_...",
     include: { all_checkpoints: true },
     max_tokens: 8000
   })
   ```

   Setting `all_checkpoints: true` loads the complete checkpoint history so you can see exactly where work stopped.

### Token Budget Allocation

The default `task_load_context` budget is 8000 tokens, allocated as:

| Component | Allocation | Contents |
|---|---|---|
| Workflow context | 15% (1200) | Source summary, plan summary |
| Current task | 55% (4400) | Full plan, context, recent checkpoints |
| Prior tasks | 20% (1600) | Outcome summaries only |
| Sibling/deps | 10% (800) | Status and brief summaries |

If you need more detail, use on-demand loading:
- `task_get({ id, include_checkpoints: true })` — full task with all checkpoints
- `checkpoint_list({ task_id, since_sequence: N })` — checkpoints after a specific point
- `workflow_get({ id, include_tasks: true })` — full workflow with all tasks

## Multi-Agent Coordination

caw supports multiple agents working on the same workflow. For the full 7-step agent lifecycle, see [Agent Protocol](agent-protocol.md).

### Agent Registration

Each agent registers on startup:

```
agent_register({
  name: "worker-1",
  runtime: "claude_code",
  capabilities: ["typescript", "testing"]
})
→ { id: "ag_...", status: "online" }
```

### Task Claiming

Agents atomically claim tasks to prevent conflicts:

```
workflow_next_tasks({ workflow_id: "wf_..." })
→ { tasks: [{ id: "tk_1", ... }, { id: "tk_2", ... }] }

task_claim({ task_id: "tk_1", agent_id: "ag_..." })
→ { success: true }
```

If another agent already claimed the task, you get `{ success: false, already_claimed_by: "ag_..." }` — try the next task.

### Workspace Isolation

For parallel execution, each agent works in its own git worktree:

```
workspace_create({
  workflow_id: "wf_...",
  path: "/projects/myapp-feature-branch",
  branch: "feature/google-oauth",
  base_branch: "main",
  task_ids: ["tk_google..."]
})
```

### Messaging

Agents communicate via `message_send`, `message_list`, and `message_broadcast`. See [MCP Tools](mcp-tools.md) for the full messaging API.

## Copy-Paste CLAUDE.md Section

Add this block to your project's `CLAUDE.md` to instruct Claude Code to use caw for workflow persistence. This is designed for single-agent usage — for multi-agent coordination, see [Agent Protocol](agent-protocol.md).

````markdown
## Workflow Persistence (caw)

This project uses caw for durable task execution. Workflows, tasks, and checkpoints persist across context clearing.

### Starting a New Workflow

When given a multi-step task:

1. `workflow_create` with a name and the task description
2. `workflow_set_plan` to break the work into tasks with dependencies
3. `workflow_next_tasks` to get the first actionable task

### Working on Tasks

For each task:

1. `task_set_plan` — record your approach and files to modify
2. `task_update_status` — set to `in_progress`
3. `checkpoint_add` — record progress after each significant step (type: `progress`, `decision`, or `error`)
4. `task_update_status` — set to `completed` with an `outcome` summary

### Recovering After Context Clear

If your context was cleared and you need to resume:

1. `workflow_list` with status `in_progress` to find active workflows
2. `workflow_progress` to see which task is current
3. `task_load_context` with `all_checkpoints: true` to reload full state
4. Resume from the last checkpoint
````
