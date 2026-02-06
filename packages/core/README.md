# @caw/core

Pure data library for caw — database layer, services, types, and utilities. No MCP or UI dependencies.

## Directory Structure

```
src/
├── db/
│   ├── connection.ts          # createConnection, getDbPath
│   ├── migrations/
│   │   ├── 001_initial.ts     # Schema: 9 tables, indexes, triggers
│   │   └── index.ts           # runMigrations runner
│   └── index.ts
├── services/
│   ├── agent.service.ts       # Agent registration, heartbeat, status
│   ├── checkpoint.service.ts  # Checkpoint CRUD, sequencing
│   ├── context.service.ts     # Token-budgeted context loading
│   ├── message.service.ts     # Inter-agent messaging, threads
│   ├── orchestration.service.ts # Next tasks, progress, dependency checks
│   ├── repository.service.ts  # Repository registration (global mode)
│   ├── task.service.ts        # Task CRUD, planning, status transitions
│   ├── template.service.ts    # Workflow templates, apply/create
│   ├── workflow.service.ts    # Workflow CRUD, plan setting, parallelism
│   ├── workspace.service.ts   # Workspace (worktree) tracking
│   ├── transitions.ts         # State machine validation
│   └── index.ts
├── types/
│   ├── agent.ts               # Agent, AgentStatus
│   ├── checkpoint.ts          # Checkpoint, CheckpointType
│   ├── message.ts             # Message, MessageType, Priority
│   ├── repository.ts          # Repository
│   ├── task.ts                # Task, TaskStatus
│   ├── template.ts            # WorkflowTemplate
│   ├── workflow.ts            # Workflow, WorkflowStatus, WorkflowSummary
│   ├── workspace.ts           # Workspace, WorkspaceStatus
│   └── index.ts
└── utils/
    ├── compress.ts            # Text compression for context loading
    ├── id.ts                  # Nanoid-based ID generation with prefixes
    ├── tokens.ts              # Token estimation utilities
    └── worktree.ts            # Git worktree helpers
```

## Services

| Service | Description |
|---|---|
| `workflowService` | Create, get, list, update workflows; set plans and parallelism |
| `taskService` | Create, get, update tasks; set plans, replan, status transitions |
| `checkpointService` | Add and list checkpoints with automatic sequencing |
| `contextService` | Load token-budgeted context for task recovery |
| `orchestrationService` | Get next tasks, check progress, verify dependencies |
| `agentService` | Register, heartbeat, update, list, unregister agents |
| `messageService` | Send, broadcast, list, read, archive inter-agent messages |
| `repositoryService` | Register and list repositories (global mode) |
| `templateService` | Create, list, apply workflow templates |
| `workspaceService` | Create, update, list workspaces (git worktrees) |

## Database

### Connection

`createConnection(dbPath)` creates a SQLite connection with WAL mode, foreign keys, and 5-second busy timeout.

`getDbPath(mode, repoPath?)` resolves the database path:
- `repository` mode → `{repoPath}/.caw/workflows.db`
- `global` mode → `~/.caw/workflows.db`

### Migrations

Numbered migration files export SQL as string constants (no filesystem reads at runtime). `runMigrations(db)` applies unapplied migrations in transactions. The `schema_migrations` table tracks applied migrations.

### Tables

9 application tables: `repositories`, `workflows`, `tasks`, `task_dependencies`, `checkpoints`, `workspaces`, `workflow_templates`, `agents`, `messages`.

See [Schema](../../docs/schema.md) for full DDL.

## Types

Types match the SQLite schema exactly, with these conventions:

| SQLite | TypeScript | Example |
|---|---|---|
| INTEGER (timestamp) | `number` | Unix milliseconds |
| TEXT (JSON) | `string \| null` | Serialized JSON in TEXT columns |
| INTEGER (boolean) | `number` | `0` or `1` |
| TEXT (enum) | String literal union | `'pending' \| 'in_progress' \| 'completed'` |

## ID Generation

Nanoid with charset `[0-9a-z]`, 12 characters. Each entity type has a prefixed helper:

| Prefix | Entity | Example |
|---|---|---|
| `wf_` | Workflow | `wf_a1b2c3d4e5f6` |
| `tk_` | Task | `tk_x9y8z7w6v5u4` |
| `cp_` | Checkpoint | `cp_...` |
| `ws_` | Workspace | `ws_...` |
| `rp_` | Repository | `rp_...` |
| `tmpl_` | Template | `tmpl_...` |
| `ag_` | Agent | `ag_...` |
| `msg_` | Message | `msg_...` |

## Usage

```typescript
import { createConnection, getDbPath, runMigrations, workflowService, taskService } from '@caw/core';

// Initialize database
const dbPath = getDbPath('repository', process.cwd());
const db = createConnection(dbPath);
runMigrations(db);

// Use services
const workflow = workflowService.create(db, {
  name: 'My Workflow',
  source_type: 'prompt',
  source_content: 'Implement feature X...',
});

const tasks = taskService.listByWorkflow(db, workflow.id);
```

## Dependencies

- **bun:sqlite** — Built-in synchronous SQLite driver (Bun runtime)
- **nanoid** — ESM-native ID generation
