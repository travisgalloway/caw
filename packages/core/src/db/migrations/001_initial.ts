export const sql = `
-- Repository registry (for global mode)
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Core workflow
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  source_content TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  initial_plan TEXT,
  plan_summary TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  max_parallel_tasks INTEGER NOT NULL DEFAULT 1,
  auto_create_workspaces INTEGER NOT NULL DEFAULT 0,
  config TEXT
);

-- Many-to-many: workflows ↔ repositories
CREATE TABLE workflow_repositories (
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(id),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (workflow_id, repository_id)
);

-- Tasks within a workflow
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sequence INTEGER NOT NULL,
  parallel_group TEXT,
  plan TEXT,
  plan_summary TEXT,
  context TEXT,
  outcome TEXT,
  outcome_detail TEXT,
  workspace_id TEXT REFERENCES workspaces(id),
  repository_id TEXT REFERENCES repositories(id),
  assigned_agent_id TEXT REFERENCES agents(id),
  claimed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Task dependencies (DAG)
CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'blocks',
  PRIMARY KEY (task_id, depends_on_id)
);

-- Fine-grained progress checkpoints
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  checkpoint_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  files_changed TEXT,
  created_at INTEGER NOT NULL
);

-- Workspace registry (git worktrees for isolation)
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  repository_id TEXT REFERENCES repositories(id),
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_branch TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  merge_commit TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Workflow templates (reusable patterns)
CREATE TABLE workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  template TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Agent registry
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  runtime TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'worker',
  status TEXT NOT NULL DEFAULT 'offline',
  capabilities TEXT,
  current_task_id TEXT REFERENCES tasks(id),
  workspace_path TEXT,
  last_heartbeat INTEGER,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Inter-agent messages (inbox pattern)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT REFERENCES agents(id),
  recipient_id TEXT NOT NULL REFERENCES agents(id),
  message_type TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'unread',
  workflow_id TEXT REFERENCES workflows(id),
  task_id TEXT REFERENCES tasks(id),
  reply_to_id TEXT REFERENCES messages(id),
  thread_id TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  expires_at INTEGER
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
CREATE INDEX idx_messages_recipient ON messages(recipient_id, status);
CREATE INDEX idx_messages_thread ON messages(thread_id);
CREATE INDEX idx_messages_workflow ON messages(workflow_id);
`;
