# @caw/mcp-server

MCP server library for caw — tool definitions, transport handling, and configuration. This is a library package imported by `@caw/tui`, not a standalone binary.

## Directory Structure

```
src/
├── config.ts        # resolveConfig, env var parsing, defaults
├── server.ts        # createMcpServer, startServer
├── tools/
│   ├── workflow.ts    # 13 tools — create, get, list, set_plan, update_status, set_parallelism, get_summary, lock, unlock, lock_info, add_repository, remove_repository, list_repositories
│   ├── task.ts        # 4 tools — get, set_plan, update_status, replan
│   ├── checkpoint.ts  # 2 tools — add, list
│   ├── context.ts     # 1 tool  — task_load_context
│   ├── orchestration.ts # 3 tools — next_tasks, progress, check_dependencies
│   ├── workspace.ts   # 4 tools — create, update, list, task_assign_workspace
│   ├── repository.ts  # 3 tools — register, list, get
│   ├── template.ts    # 3 tools — create, list, apply
│   ├── agent.ts       # 9 tools — register, heartbeat, update, get, list, unregister, task_claim, task_release, task_get_available
│   ├── messaging.ts   # 7 tools — send, broadcast, list, get, mark_read, archive, count_unread
│   ├── replanning.ts  # 3 tools — add_task, remove_task, replan
│   ├── spawner.ts     # 4 tools — workflow_start, workflow_suspend, workflow_resume, workflow_execution_status
│   ├── lock-guard.ts  # utility for workflow lock enforcement (not tools)
│   ├── types.ts       # defineTool, handleToolCall, ToolCallError
│   └── index.ts       # registerAllTools barrel
└── index.ts
```

## Tool Categories

56 tools across 12 categories:

| Category | Tools | Count |
|---|---|---|
| Workflow Lifecycle | `workflow_create`, `workflow_get`, `workflow_list`, `workflow_set_plan`, `workflow_update_status`, `workflow_set_parallelism`, `workflow_get_summary`, `workflow_lock`, `workflow_unlock`, `workflow_lock_info`, `workflow_add_repository`, `workflow_remove_repository`, `workflow_list_repositories` | 13 |
| Task Management | `task_get`, `task_set_plan`, `task_update_status`, `task_replan` | 4 |
| Checkpoint Recording | `checkpoint_add`, `checkpoint_list` | 2 |
| Context Loading | `task_load_context` | 1 |
| Orchestration Queries | `workflow_next_tasks`, `workflow_progress`, `task_check_dependencies` | 3 |
| Workspace Management | `workspace_create`, `workspace_update`, `workspace_list`, `task_assign_workspace` | 4 |
| Repository Management | `repository_register`, `repository_list`, `repository_get` | 3 |
| Template Management | `template_create`, `template_list`, `template_apply` | 3 |
| Agent Management | `agent_register`, `agent_heartbeat`, `agent_update`, `agent_get`, `agent_list`, `agent_unregister`, `task_claim`, `task_release`, `task_get_available` | 9 |
| Messaging | `message_send`, `message_broadcast`, `message_list`, `message_get`, `message_mark_read`, `message_archive`, `message_count_unread` | 7 |
| Replanning | `workflow_add_task`, `workflow_remove_task`, `workflow_replan` | 3 |
| Spawner | `workflow_start`, `workflow_suspend`, `workflow_resume`, `workflow_execution_status` | 4 |

See [MCP Tools](../../docs/mcp-tools.md) for full parameter and return type definitions.

## Transport Options

### stdio (default)

Standard MCP transport for direct integration with Claude Code and other MCP clients:

```bash
caw --server                     # stdio transport
caw --server --transport stdio   # explicit
```

### HTTP

Streamable HTTP transport with session support:

```bash
caw --server --transport http             # port 3100
caw --server --transport http --port 8080 # custom port
```

Endpoints:
- `POST /mcp` — MCP protocol endpoint
- `GET /health` — Health check (returns `200 OK`)

## Programmatic Usage

```typescript
import { createConnection, getDbPath, runMigrations } from '@caw/core';
import { createMcpServer, startServer, resolveConfig } from '@caw/mcp-server';

// Initialize database
const dbPath = getDbPath('repository', process.cwd());
const db = createConnection(dbPath);
runMigrations(db);

// Create and start server
const server = createMcpServer(db);
const config = resolveConfig({ transport: 'stdio' });
await startServer(server, config);
```

### Configuration

`resolveConfig(args)` merges CLI arguments with environment variables:

| Variable | Default | Description |
|---|---|---|
| `CAW_TRANSPORT` | `stdio` | Transport type: `stdio` or `http` |
| `CAW_PORT` | `3100` | HTTP port |
| `CAW_DB_MODE` | `per-repo` | Database mode: `per-repo` or `global` |
| `CAW_REPO_PATH` | `cwd` | Repository path (per-repo mode) |
| `CAW_DB_PATH` | — | Explicit database file path |

## Error Handling

All tools use structured error responses via `ToolCallError`:

```json
{
  "code": "TASK_NOT_FOUND",
  "message": "Task not found: tk_invalid",
  "recoverable": false,
  "suggestion": "Check the task ID and try again"
}
```

Common error codes: `WORKFLOW_NOT_FOUND`, `TASK_NOT_FOUND`, `AGENT_NOT_FOUND`, `INVALID_TRANSITION`, `INVALID_STATE`, `CLAIM_CONFLICT`.

See [Error Handling](../../docs/error-handling.md) for the full error catalog.

## Dependencies

- **@caw/core** — Database layer and services
- **@caw/spawner** — Agent spawning and workflow execution
- **@modelcontextprotocol/sdk** — MCP protocol implementation
- **zod** — Schema validation for tool input
