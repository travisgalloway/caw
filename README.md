# caw

Durable execution for coding agent workflows — MCP server + SQLite.

Coding agents frequently hit context limits or need to clear context mid-workflow, losing planning state, task progress, and decisions. caw is a lightweight MCP server backed by SQLite that persists workflows, tasks, and checkpoints so agents can resume from where they left off.

## Architecture

```
┌─────────────────┐     MCP Protocol      ┌──────────────────────────────┐
│   Claude Code   │◄────────────────────►│          caw                  │
│   (or Codex,    │    (stdio / http)     │  ┌────────────────────────┐  │
│    OpenCode)    │                       │  │  @caw/mcp-server (lib) │  │
└─────────────────┘                       │  └───────────┬────────────┘  │
                                          │              │               │
┌─────────────────┐                       │  ┌───────────▼────────────┐  │
│   Terminal       │◄────────────────────►│  │  @caw/core (services)  │  │
│   (human user)  │    TUI (default)      │  └───────────┬────────────┘  │
└─────────────────┘                       │              │               │
                                          │  ┌───────────▼────────────┐  │
                                          │  │     SQLite (bun:sqlite)│  │
                                          │  └────────────────────────┘  │
                                          └──────────────────────────────┘
```

## Key Features

- **Durable persistence** — Workflows, tasks, and plans survive context clearing
- **Fine-grained checkpointing** — Recovery and replay from any recorded point
- **Context-optimized loading** — Token budget allocation to maximize information per token
- **DAG-based task scheduling** — Dependency-aware ordering with parallel group support
- **Multi-agent support** — Agent registration, task claiming, and inter-agent messaging
- **Workspace isolation** — Git worktree tracking for parallel execution
- **Terminal UI** — Real-time Ink-based dashboard for monitoring workflows and agents

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0

### Install & Build

```bash
git clone https://github.com/yourusername/caw.git
cd caw
bun install
bun run build
```

### Configure MCP

Add the caw MCP server to your Claude Code settings (`.claude/settings.json`):

```json
{
  "mcpServers": {
    "caw": {
      "command": "bun",
      "args": ["./apps/tui/src/bin/cli.ts", "--server"]
    }
  }
}
```

Or after global install:

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

### Launch the TUI

```bash
# Default: interactive dashboard
bun ./apps/tui/src/bin/cli.ts

# Focus on a specific workflow
bun ./apps/tui/src/bin/cli.ts --workflow wf_abc123

# Headless MCP server (for agent integration)
bun ./apps/tui/src/bin/cli.ts --server
```

## Packages

| Package | Path | Description |
|---|---|---|
| `@caw/core` | [`packages/core`](packages/core) | Core library — DB, services, types |
| `@caw/mcp-server` | [`packages/mcp-server`](packages/mcp-server) | MCP server library (tools, transport, config) |
| `@caw/tui` | [`apps/tui`](apps/tui) | Unified `caw` binary — TUI (default) or headless MCP server (`--server`) |

## CLI Reference

```
Usage: caw [options] [description]

Options:
  --server              Run as headless MCP server (no TUI)
  --transport <type>    MCP transport: stdio | http (default: stdio)
  --port <number>       HTTP port (default: 3100)
  --db <path>           Database file path
  --workflow <id>       Focus on a specific workflow
  --template <name>     Create workflow from named template (requires description)
  --list-templates      List available workflow templates
  -h, --help            Show this help message
```

**Examples:**

```bash
# Launch TUI dashboard
caw

# Run as MCP server over stdio
caw --server

# Run as MCP server over HTTP on port 8080
caw --server --transport sse --port 8080

# Create a workflow from a template
caw --template oauth-setup "Add OAuth to billing service"

# List available templates
caw --list-templates
```

## Configuration

### Database Paths

| Mode | Path | Description |
|---|---|---|
| `per-repo` (default) | `{repo}/.caw/workflows.db` | Per-repository database |
| `global` | `~/.caw/workflows.db` | Shared across all repositories |

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CAW_TRANSPORT` | `stdio` | MCP transport: `stdio` or `sse` |
| `CAW_PORT` | `3100` | HTTP port (when transport is `sse`) |
| `CAW_DB_MODE` | `per-repo` | Database mode: `per-repo` or `global` |
| `CAW_REPO_PATH` | `cwd` | Repository path (per-repo mode) |
| `CAW_DB_PATH` | — | Explicit database file path (overrides mode) |

## MCP Tools

43 tools across 10 categories:

| Category | Tools | Count |
|---|---|---|
| Workflow Lifecycle | `workflow_create`, `workflow_get`, `workflow_list`, `workflow_set_plan`, `workflow_update_status`, `workflow_set_parallelism`, `workflow_get_summary` | 7 |
| Task Management | `task_get`, `task_set_plan`, `task_update_status`, `task_replan` | 4 |
| Checkpoint Recording | `checkpoint_add`, `checkpoint_list` | 2 |
| Context Loading | `task_load_context` | 1 |
| Orchestration Queries | `workflow_next_tasks`, `workflow_progress`, `task_check_dependencies` | 3 |
| Workspace Management | `workspace_create`, `workspace_update`, `workspace_list`, `task_assign_workspace` | 4 |
| Repository Management | `repository_register`, `repository_list`, `repository_get` | 3 |
| Template Management | `template_create`, `template_list`, `template_apply` | 3 |
| Agent Management | `agent_register`, `agent_heartbeat`, `agent_update`, `agent_get`, `agent_list`, `agent_unregister`, `task_claim`, `task_release`, `task_get_available` | 9 |
| Messaging | `message_send`, `message_broadcast`, `message_list`, `message_get`, `message_mark_read`, `message_archive`, `message_count_unread` | 7 |

See [MCP Tools](docs/mcp-tools.md) for full tool definitions with parameters and return types.

## Development

### Build & Typecheck

```bash
# Full monorepo typecheck (Turbo respects dependency order)
bun run build

# Single package
bun run --filter @caw/core build
```

### Tests

```bash
# All packages
bun run test

# Single package
bun run --filter @caw/core test

# Single file
bun test packages/core/src/utils/id.test.ts

# Watch mode
bun run --filter @caw/core test:watch
```

### Lint & Format

```bash
# Check all packages (read-only)
bun run lint

# Auto-fix lint + formatting
bun run format
```

Biome handles both linting and formatting. A pre-commit hook (Husky + lint-staged) auto-fixes staged `*.{ts,tsx}` files.

### Clean

```bash
bun run clean
```

## Documentation

Full documentation lives in [`docs/`](docs/):

| Document | Description |
|---|---|
| [Overview](docs/overview.md) | Problem statement, architecture, design principles, terminology |
| [Data Model](docs/data-model.md) | Entity relationships, multi-agent model, ID generation |
| [Schema](docs/schema.md) | SQLite schema, migrations, checkpoint types, status enums |
| [State Machines](docs/state-machines.md) | Workflow and task state machines, blocked state computation |
| [MCP Tools](docs/mcp-tools.md) | MCP server interface — all tool definitions |
| [Context Loading](docs/context-loading.md) | Token budgets, compression, on-demand loading |
| [Agent Protocol](docs/agent-protocol.md) | Full agent lifecycle, coordination, workspace isolation |
| [Project Structure](docs/project-structure.md) | Directory layout, package dependencies, turbo config |
| [Error Handling](docs/error-handling.md) | Error handling, ToolError format, testing strategy |
| [TUI](docs/tui.md) | TUI design — layout, views, keybindings, components |
| [Examples](docs/examples.md) | Full usage flow examples |
| [CLAUDE.md Integration](docs/claude-md-integration.md) | CLAUDE.md integration instructions |
| [Implementation](docs/implementation.md) | Implementation priorities and phases |
| [Future](docs/future.md) | Future considerations |

## License

MIT
