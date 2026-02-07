# SQLite Schema

## Migration Strategy

Use a `schema_migrations` table to track applied migrations. Each migration is a numbered TypeScript file (`src/db/migrations/NNN_name.ts`) that exports SQL as a string constant. The `schema_migrations` table is created and managed by the migration runner (`ensureMigrationsTable`), not by individual migration files.

```sql
-- migrations/001_initial.ts (exported as `sql` string constant)

-- Repository registry (for global mode)
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,                    -- rp_xxxxxxxxxxxx
  path TEXT NOT NULL UNIQUE,              -- Absolute path to repo root
  name TEXT,                              -- Human-friendly name
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Core workflow
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,                    -- wf_xxxxxxxxxxxx
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,              -- 'prompt', 'github_issue', 'linear', etc
  source_ref TEXT,                        -- URL or identifier
  source_content TEXT,                    -- Original prompt/issue body
  status TEXT NOT NULL DEFAULT 'planning',
  initial_plan TEXT,                      -- High-level plan (structured JSON)
  plan_summary TEXT,                      -- Compressed summary for context loading
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- Parallelism configuration
  max_parallel_tasks INTEGER NOT NULL DEFAULT 1,  -- Max concurrent tasks (1 = sequential)
  auto_create_workspaces INTEGER NOT NULL DEFAULT 0,  -- Auto-create worktrees for parallel

  -- Workflow-level config
  config TEXT                             -- Additional config JSON
);

-- Many-to-many: workflows ↔ repositories (multi-repo support, global mode)
CREATE TABLE workflow_repositories (
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(id),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (workflow_id, repository_id)
);

-- Tasks within a workflow
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,                    -- tk_xxxxxxxxxxxx
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sequence INTEGER NOT NULL,              -- Execution order (parallel tasks share sequence)
  parallel_group TEXT,                    -- Group ID for tasks that CAN run together
  plan TEXT,                              -- Task-specific plan (structured JSON)
  plan_summary TEXT,                      -- Compressed for cross-task context
  context TEXT,                           -- Curated context JSON for this task
  outcome TEXT,                           -- Final outcome summary
  outcome_detail TEXT,                    -- Detailed outcome JSON
  workspace_id TEXT REFERENCES workspaces(id),
  repository_id TEXT REFERENCES repositories(id),  -- Explicit repo for multi-repo workflows
  assigned_agent_id TEXT REFERENCES agents(id),  -- Agent assigned to this task
  claimed_at INTEGER,                     -- When agent claimed the task
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Task dependencies (DAG)
CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'blocks', -- 'blocks', 'informs'
  PRIMARY KEY (task_id, depends_on_id)
);

-- Fine-grained progress checkpoints
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,                    -- cp_xxxxxxxxxxxx
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  checkpoint_type TEXT NOT NULL,          -- See checkpoint types below
  summary TEXT NOT NULL,                  -- Human/agent readable summary
  detail TEXT,                            -- Full detail JSON
  files_changed TEXT,                     -- JSON array of file paths affected
  created_at INTEGER NOT NULL
);

-- Workspace registry (git worktrees for isolation)
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,                    -- ws_xxxxxxxxxxxx
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  repository_id TEXT REFERENCES repositories(id),  -- Explicit repo for multi-repo workflows
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_branch TEXT,                       -- Branch this was created from
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'merged', 'abandoned'
  merge_commit TEXT,                      -- Commit SHA if merged
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Workflow templates (reusable patterns)
CREATE TABLE workflow_templates (
  id TEXT PRIMARY KEY,                    -- tmpl_xxxxxxxxxxxx
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  template TEXT NOT NULL,                 -- JSON template definition
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Agent registry
CREATE TABLE agents (
  id TEXT PRIMARY KEY,                    -- ag_xxxxxxxxxxxx
  workflow_id TEXT REFERENCES workflows(id), -- Workflow this agent belongs to
  name TEXT NOT NULL,                     -- Human-friendly name (e.g., "worker-1", "coordinator")
  runtime TEXT NOT NULL,                  -- 'claude_code', 'codex', 'opencode', etc.
  role TEXT NOT NULL DEFAULT 'worker',    -- 'coordinator', 'worker'
  status TEXT NOT NULL DEFAULT 'offline', -- 'online', 'offline', 'busy'
  capabilities TEXT,                      -- JSON array of capabilities
  current_task_id TEXT REFERENCES tasks(id),
  workspace_path TEXT,                    -- Current working directory
  last_heartbeat INTEGER,                 -- Unix timestamp of last heartbeat
  metadata TEXT,                          -- Additional agent metadata JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Inter-agent messages (inbox pattern)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,                    -- msg_xxxxxxxxxxxx
  sender_id TEXT REFERENCES agents(id),   -- NULL for system messages
  recipient_id TEXT NOT NULL REFERENCES agents(id),
  message_type TEXT NOT NULL,             -- 'task_assignment', 'status_update', 'query', 'response', 'broadcast'
  subject TEXT,                           -- Brief subject line
  body TEXT NOT NULL,                     -- Message content (JSON or text)
  priority TEXT NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  status TEXT NOT NULL DEFAULT 'unread',  -- 'unread', 'read', 'archived'

  -- Optional references
  workflow_id TEXT REFERENCES workflows(id),
  task_id TEXT REFERENCES tasks(id),

  -- Threading support
  reply_to_id TEXT REFERENCES messages(id),
  thread_id TEXT,                         -- Groups related messages

  created_at INTEGER NOT NULL,
  read_at INTEGER,                        -- When message was read
  expires_at INTEGER                      -- Optional expiration
);

-- Indexes for common queries
CREATE INDEX idx_workflow_repositories_repo ON workflow_repositories(repository_id);
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_tasks_workflow ON tasks(workflow_id, sequence);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_parallel ON tasks(parallel_group);
CREATE INDEX idx_tasks_agent ON tasks(assigned_agent_id);
CREATE INDEX idx_tasks_repository ON tasks(repository_id);
CREATE INDEX idx_checkpoints_task ON checkpoints(task_id, sequence);
CREATE INDEX idx_workspaces_workflow ON workspaces(workflow_id);
CREATE INDEX idx_workspaces_repository ON workspaces(repository_id);
CREATE INDEX idx_workspaces_status ON workspaces(status);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_role ON agents(role);
CREATE INDEX idx_agents_workflow_id ON agents(workflow_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, status);
CREATE INDEX idx_messages_thread ON messages(thread_id);
CREATE INDEX idx_messages_workflow ON messages(workflow_id);
```

## Checkpoint Types

| Type       | Description               | Detail Contents                            |
| ---------- | ------------------------- | ------------------------------------------ |
| `plan`     | Initial task planning     | Full plan JSON, identified files, approach |
| `replan`   | Mid-task replanning       | Updated plan, reason for replan            |
| `progress` | Work completed            | Files modified, changes made               |
| `decision` | Significant decision made | Options considered, rationale              |
| `error`    | Error encountered         | Error details, stack trace if available    |
| `recovery` | Recovery from error       | Recovery approach, state restored          |
| `complete` | Task completed            | Final outcome, summary of all changes      |

## Status Enums

**Workflow Status:**

- `planning` - Initial plan being created
- `ready` - Plan complete, ready to execute
- `in_progress` - Tasks being worked
- `paused` - Manually paused
- `completed` - All tasks complete
- `failed` - Unrecoverable failure
- `abandoned` - Manually abandoned

**Task Status:**

- `pending` - Not yet started
- `blocked` - Waiting on dependencies
- `planning` - Task-specific plan being created
- `in_progress` - Actively being worked
- `paused` - Manually paused
- `completed` - Successfully completed
- `failed` - Failed (can be replanned)
- `skipped` - Explicitly skipped
