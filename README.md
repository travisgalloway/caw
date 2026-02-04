# caw

Coding Agent Workflow orchestrator — durable execution for coding agent workflows via MCP + SQLite.

Coding agents frequently hit context limits or need to clear context mid-workflow, losing planning state, task progress, and decisions. caw is a lightweight MCP server backed by SQLite that persists workflows, tasks, and checkpoints so agents can resume from where they left off.

## Architecture

```
┌─────────────────┐     MCP Protocol      ┌──────────────────┐
│   Claude Code   │◄────────────────────►│  Workflow Server │
│   (or Codex,    │                       │   (TypeScript)   │
│    OpenCode)    │                       └────────┬─────────┘
└─────────────────┘                                │
                                                   ▼
                                          ┌──────────────────┐
                                          │     SQLite       │
                                          │   (bun:sqlite)   │
                                          └──────────────────┘
```

## Key Features

- **Durable persistence** — Workflows, tasks, and plans survive context clearing
- **Fine-grained checkpointing** — Recovery and replay from any recorded point
- **Context-optimized loading** — Token budget allocation to maximize information per token
- **DAG-based orchestration** — Dependency-aware task scheduling
- **Multi-agent support** — Agent registration, coordination, and inter-agent messaging
- **Configurable parallelism** — Worktree isolation with tunable concurrency
- **Terminal UI** — Real-time Ink-based dashboard for monitoring workflows and agents

## Packages

| Package | Path | Description |
|---|---|---|
| `@caw/core` | `packages/core` | Core library — DB, services, types |
| `@caw/mcp-server` | `packages/mcp-server` | MCP server exposing workflow tools |
| `@caw/orchestrator` | `apps/orchestrator` | CLI orchestrator |
| `@caw/tui` | `apps/tui` | Terminal UI (Ink-based) |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0

### Install & Build

```bash
bun install
bun run build
```

### Tests

```bash
bun run test
```

## MCP Integration

Add the caw MCP server to your Claude Code configuration (`.claude/settings.json` or project-level):

```json
{
  "mcpServers": {
    "caw": {
      "command": "bun",
      "args": ["./packages/mcp-server/src/bin/cli.ts"]
    }
  }
}
```

Or after a global install:

```json
{
  "mcpServers": {
    "caw": {
      "command": "caw-mcp-server"
    }
  }
}
```

## Documentation

Full design docs live in [`design.md`](design.md) (index) and [`docs/`](docs/):

| Document | Description |
|---|---|
| [Overview](docs/overview.md) | Problem statement, architecture, design principles, terminology |
| [Data Model](docs/data-model.md) | Entity relationships, multi-agent model, ID generation |
| [Schema](docs/schema.md) | SQLite schema, migrations, checkpoint types, status enums |
| [State Machines](docs/state-machines.md) | Workflow and task state machines, blocked state computation |
| [MCP Tools](docs/mcp-tools.md) | MCP server interface — all tool definitions |
| [Context Loading](docs/context-loading.md) | Token budgets, compression, on-demand loading |
| [Project Structure](docs/project-structure.md) | Directory layout, package dependencies, turbo config |
| [Error Handling](docs/error-handling.md) | Error handling, ToolError format, testing strategy |
| [TUI](docs/tui.md) | TUI design — layout, views, keybindings, components |
| [Examples](docs/examples.md) | Full usage flow examples |
| [CLAUDE.md Integration](docs/claude-md-integration.md) | CLAUDE.md integration instructions |
| [Implementation](docs/implementation.md) | Implementation priorities and phases |
| [Future](docs/future.md) | Future considerations |

## License

MIT
