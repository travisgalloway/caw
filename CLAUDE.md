# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What is caw?

A durable execution system for coding agent workflows. It persists tasks, plans, and outcomes across context clearing via an MCP server backed by SQLite. Designed for Claude Code with extensibility to other agent runtimes (Codex, OpenCode, etc.).

---

## Environment Setup

### Desktop (Claude Code CLI)

Desktop users have full access to the local Bun runtime, git, and all CLI commands. No special setup is needed beyond having Bun installed.

- **Runtime**: Bun 1.3.8 (see `packageManager` in root `package.json`)
- **Install**: `bun install` from the repo root
- **Run the TUI**: `bun run --filter @caw/tui start` or directly via `apps/tui/src/bin/cli.ts`

### Web (Claude Code on the web)

Web sessions run in a sandboxed Linux environment. Key differences from desktop:

- **No persistent daemon**: The TUI daemon mode (`caw run --detach`) will not persist between sessions. Prefer `--no-watch` or direct MCP server mode (`caw --server`) for headless operation.
- **No global `~/.caw/` directory across sessions**: Use per-repo mode (`--db .caw/workflows.db`) to keep data within the repo.
- **Bun is available**: The runtime environment includes Bun, so all build/test/lint commands work as documented.
- **Git is available**: Standard git operations work. Push requires proper remote configuration.
- **No interactive TUI**: The Ink-based terminal UI requires a real TTY. On web, use `caw --server` (headless MCP) or the CLI subcommands (`caw run`, `caw init`, etc.) instead.

---

## Build & Test Commands

```bash
# Full monorepo typecheck (respects dependency order via Turbo)
bun run build

# Typecheck a single package
bun run --filter @caw/core build

# Run all tests
bun run test

# Run tests for a single package
bun run --filter @caw/core test

# Run a single test file
bun test packages/core/src/utils/id.test.ts

# Watch mode for tests (desktop only — requires TTY)
bun run --filter @caw/core test:watch

# Lint all packages (via Turbo)
bun run lint

# Lint a single package
bun run --filter @caw/core lint

# Auto-fix lint + formatting issues across the repo
bun run format

# Clean all build artifacts
bun run clean
```

### Verifying changes

After making changes, always run in this order:

1. `bun run build` — catch type errors first
2. `bun run test` — verify behavior
3. `bun run lint` — check formatting and lint rules

On web, if `bun run test` hangs on a TTY prompt, run tests for specific packages instead:
```bash
bun run --filter @caw/core test
bun run --filter @caw/mcp-server test
```

---

## Linting & Formatting

**Biome** handles both linting and formatting. Config lives in `biome.json` (root).

- `bun run lint` — check all packages (read-only, used in CI)
- `bun run format` — auto-fix lint and formatting issues (`biome check --write .`)
- Pre-commit hook (Husky + lint-staged) auto-fixes staged `*.{ts,tsx}` files on commit

### Biome rules

- **Indent**: 2 spaces
- **Line width**: 100 characters
- **Quotes**: Single quotes
- **Trailing commas**: Always
- **Scope**: Only files in `packages/*/src/**` and `apps/*/src/**`
- **VCS-aware**: Respects `.gitignore`

---

## Monorepo Structure

Five workspace packages managed by Bun workspaces + Turbo:

```
caw/
├── packages/
│   ├── core/           @caw/core         — Database, types, services, utilities
│   ├── mcp-server/     @caw/mcp-server   — MCP protocol server (tools, transport)
│   └── spawner/        @caw/spawner      — Agent spawning via claude CLI
├── apps/
│   └── tui/            @caw/tui          — Unified caw binary (TUI + headless MCP)
├── tooling/
│   └── tsconfig/       @caw/tsconfig     — Shared TypeScript configs
├── docs/                                 — Design documentation (14 files)
└── scripts/                              — Utility scripts (seed.ts)
```

### Dependency graph

```
@caw/tui → @caw/mcp-server → @caw/spawner → @caw/core
              ↑                    ↑              ↑
              └────────────────────┴──── @caw/tui ┘
```

All packages depend on `@caw/core`. The TUI app depends on all three library packages.

### Package details

- **`packages/core`** (`@caw/core`) — Database layer (SQLite via `bun:sqlite`), entity types, 14 service modules, ID generation, token estimation, git worktree utilities. All other packages depend on this.
- **`packages/mcp-server`** (`@caw/mcp-server`) — MCP protocol server library. 12 tool categories (30+ tools), stdio and HTTP transports. Depends on core and spawner.
- **`packages/spawner`** (`@caw/spawner`) — Agent spawning via `claude -p` CLI. Includes `WorkflowSpawner`, `AgentSession`, `AgentPool`, prompt builders, and MCP config management. Depends on core.
- **`apps/tui`** (`@caw/tui`) — Unified `caw` binary. TUI mode (default, Ink/React) or headless MCP server (`--server`). Includes CLI commands (`init`, `setup`, `run`), 34 React components, 11 hooks, Zustand store. Depends on core, mcp-server, and spawner.
- **`tooling/tsconfig`** (`@caw/tsconfig`) — Shared TypeScript configs: `base.json` (ES2022, ESM, strict, noEmit) and `library.json` (extends base).

---

## CLI Usage

The `caw` binary (`apps/tui/src/bin/cli.ts`) supports these modes:

```bash
caw                              # Launch interactive TUI (desktop only)
caw --server                     # Headless MCP server (stdio transport)
caw --server --transport http    # Headless MCP server (HTTP on port 3100)
caw init [--yes] [--global]      # Initialize caw in repo or globally
caw setup claude-code            # Configure Claude Code MCP integration
caw run <workflow_id>            # Execute a workflow
caw run --prompt "..."           # Create + plan + run from a prompt
caw --template <name> "desc"     # Create workflow from template
caw --list-templates             # List available templates
```

---

## TypeScript Conventions

- **Module system**: ESM (`"type": "module"`) with bundler module resolution
- **Build tool**: `tsc --noEmit` for typecheck only; Bun resolves `.ts` source directly at runtime (no transpile/build step)
- **Relative imports**: Use extensionless paths (`'./foo'`, not `'./foo.js'` or `'./foo.ts'`) — Bun resolves them at runtime
- **Target**: ES2022, strict mode enabled
- **Status/enum types**: Use string literal unions, not TypeScript enums
- **Timestamps**: All stored as `number` (Unix milliseconds)
- **JSON fields**: Typed as `string | null` (serialized JSON stored in SQLite TEXT columns)
- **SQLite booleans**: Typed as `number` (0/1) to match `bun:sqlite`'s integer representation
- **Test files**: Co-located with source (`src/**/*.test.ts`), run by `bun test`
- **Barrel exports**: Each package uses `src/index.ts` barrel exports. Types use `export type`.

---

## Core Package Architecture

### Database Layer (`packages/core/src/db/`)

- **`connection.ts`** — `createConnection(dbPath)` creates a SQLite connection with WAL mode, foreign keys, and 5s busy timeout. `getDbPath(mode, repoPath?)` resolves to `~/.caw/workflows.db` (global) or `{repoPath}/.caw/workflows.db` (per-repo).
- **`migrations/`** — Numbered migration files (001–004) export SQL as string constants (no filesystem reads). `runMigrations(db)` applies unapplied migrations in transactions. The `schema_migrations` table is managed by the runner, not included in migration SQL.

### Migrations

| Migration | Purpose |
|-----------|---------|
| `001_initial.ts` | Core schema: repositories, workflows, tasks, task_dependencies, checkpoints, workspaces, workflow_templates, agents, messages |
| `002_sessions.ts` | Session tracking table |
| `003_workflow_locks.ts` | Workflow locking support |
| `004_agent_workflow_id.ts` | Agent-workflow associations |

When adding a new migration: create `005_<name>.ts`, export the SQL as a string constant, and register it in `migrations/index.ts`.

### ID Generation (`packages/core/src/utils/id.ts`)

Nanoid with charset `[0-9a-z]`, 12 chars. Each entity type has a prefixed helper:

| Function | Prefix | Example |
|----------|--------|---------|
| `workflowId()` | `wf_` | `wf_a1b2c3d4e5f6` |
| `taskId()` | `tk_` | `tk_a1b2c3d4e5f6` |
| `checkpointId()` | `cp_` | `cp_a1b2c3d4e5f6` |
| `workspaceId()` | `ws_` | `ws_a1b2c3d4e5f6` |
| `repositoryId()` | `rp_` | `rp_a1b2c3d4e5f6` |
| `templateId()` | `tmpl_` | `tmpl_a1b2c3d4e5f6` |
| `agentId()` | `ag_` | `ag_a1b2c3d4e5f6` |
| `messageId()` | `msg_` | `msg_a1b2c3d4e5f6` |
| `sessionId()` | `ss_` | `ss_a1b2c3d4e5f6` |

### Services (`packages/core/src/services/`)

14 service modules, each exporting a singleton service object with methods that take a `db` connection as the first argument:

| Service | Responsibility |
|---------|---------------|
| `workflowService` | Workflow CRUD, planning, status transitions |
| `taskService` | Task management, claiming, dependency tracking |
| `checkpointService` | Fine-grained progress checkpoints |
| `contextService` | Token-optimized context loading for recovery |
| `orchestrationService` | DAG traversal, next-task resolution, blocking logic |
| `workspaceService` | Git worktree management |
| `templateService` | Workflow templates (create, apply) |
| `agentService` | Agent registration, heartbeat, status |
| `messageService` | Inter-agent messaging |
| `sessionService` | Session lifecycle |
| `repositoryService` | Repository registry (global mode) |
| `lockService` | Workflow-level locking |
| `transitions` | State machine validation (`isValidWorkflowTransition`, `isValidTaskTransition`) |

### State Machines (`packages/core/src/services/transitions.ts`)

**Workflow states**: `planning` → `ready` → `in_progress` → `completed` | `failed` | `paused` | `abandoned`

**Task states**: `pending` → `blocked` → `planning` → `in_progress` → `completed` | `failed` | `paused` | `skipped`

See `docs/state-machines.md` for full transition diagrams.

### Types (`packages/core/src/types/`)

One file per entity, matching the SQLite schema exactly. Barrel-exported through `src/types/index.ts` using `export type`. Key types: `Workflow`, `Task`, `Agent`, `Message`, `Checkpoint`, `Workspace`, `Repository`, `Session`, `WorkflowTemplate`.

### Config System (`packages/core/src/config/`)

Zod-validated configuration loaded from `.caw/config.json` (per-repo) or `~/.caw/config.json` (global). Schema defined in `config/schema.ts`:

```typescript
{ transport?: 'stdio' | 'http', port?: number, dbMode?: 'global' | 'per-repo', agent?: { runtime?, autoSetup? } }
```

---

## MCP Server Package (`packages/mcp-server/`)

### Tool Categories

12 tool domains registered via `registerAllTools(server, db)`:

1. **Workflow** — create, list, get, update status, set plan
2. **Task** — create, list, get, claim, update status, set dependencies
3. **Checkpoint** — add, list checkpoints per task
4. **Context** — load optimized context for task/workflow recovery
5. **Orchestration** — get next tasks, check dependencies, progress stats
6. **Workspace** — create, list, update git worktrees
7. **Repository** — register, list repositories (global mode)
8. **Template** — create, list, apply workflow templates
9. **Agent** — register, update, heartbeat, list agents
10. **Messaging** — send, broadcast, list, mark-read messages
11. **Replanning** — replan workflows mid-execution
12. **Spawner** — spawn agent processes, lock-guard tool

### Transport

- **Stdio** (default): `@modelcontextprotocol/sdk` StdioServerTransport
- **HTTP**: `Bun.serve()` with `/mcp` endpoint and `/health` healthcheck

---

## TUI App (`apps/tui/`)

### Architecture

- **React + Ink**: Terminal UI rendered with React 19 and Ink 6
- **Zustand**: State management (navigation stack, active tab, filters)
- **Polling**: Custom `usePolling` hook for real-time data refresh
- **Context providers**: `DbContext`, `DbPathContext`, `SessionContext`

### Key Components

| Component | Purpose |
|-----------|---------|
| `WorkflowListScreen` | Main list of workflows |
| `WorkflowDetailScreen` | Workflow detail with tabs (Tasks, Agents, Messages, Workspaces) |
| `TaskTree` / `TaskDag` | Task dependency visualization |
| `SelectableTable` | Generic navigable table |
| `CommandPrompt` | Inline command input |
| `SetupGuide` | First-run setup wizard |

### Hooks

11 custom hooks for data fetching (`useWorkflows`, `useTasks`, `useAgents`, `useMessages`), UI state (`useKeyBindings`, `useTerminalSize`), and session management (`useSession`, `useCommandHandler`).

---

## Spawner Package (`packages/spawner/`)

- **`WorkflowSpawner`** — Orchestrates workflow execution by spawning Claude Code agents
- **`AgentSession`** — Manages a single agent's lifecycle (spawn, monitor, complete)
- **`AgentPool`** — Manages concurrent agent sessions with configurable parallelism
- **`prompt.ts`** — Builds system prompts for planner and worker agents
- **`mcp-config.ts`** — Generates temporary MCP config files for spawned agents
- **`registry.ts`** — Global spawner registration (singleton pattern)

Agents are spawned via `claude -p` with appropriate flags: `--model`, `--permission-mode`, `--max-turns`, `--max-budget`.

---

## Key Dependencies

| Dependency | Package | Purpose |
|-----------|---------|---------|
| `bun:sqlite` | core | Built-in synchronous SQLite driver |
| `nanoid` ^5.0.9 | core | ESM-native ID generation |
| `zod` ^4.3.6 | core | Config schema validation |
| `zod` ^3.25 | mcp-server | MCP tool input schemas |
| `@modelcontextprotocol/sdk` ^1.25.3 | mcp-server | MCP protocol implementation |
| `ink` ^6.6.0 | tui | Terminal UI framework |
| `react` ^19.0.0 | tui | Component model |
| `zustand` ^5.0.0 | tui | State management |
| `ink-testing-library` ^4.0.0 | tui (dev) | Component testing |

Note: `zod` versions differ between core (v4) and mcp-server (v3) due to `@modelcontextprotocol/sdk` peer dependency requirements.

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`):

- **Triggers**: Push to `main`, PRs targeting `main`
- **Runner**: `ubuntu-latest`
- **Bun version**: 1.3.8
- **Steps**: `bun install` → `bun run lint` → `bun run build` → `bun run test`

---

## Design Documentation

Detailed design docs live in `docs/`. Key references:

| Document | Description |
|----------|-------------|
| `docs/schema.md` | Full SQLite schema with all tables, indexes, and status enums |
| `docs/state-machines.md` | Workflow and task state machine definitions |
| `docs/mcp-tools.md` | MCP tool interface specifications (all 30+ tools) |
| `docs/context-loading.md` | Token budget allocation and compression strategies |
| `docs/data-model.md` | Entity relationships, multi-agent model, global vs per-repo modes |
| `docs/agent-protocol.md` | Agent communication protocol |
| `docs/claude-md-integration.md` | Claude.md integration patterns |
| `docs/tui.md` | Terminal UI architecture and key bindings |
| `docs/error-handling.md` | Error handling strategy |
| `docs/project-structure.md` | Directory layout and package descriptions |
| `docs/overview.md` | High-level architecture |
| `docs/examples.md` | Usage examples |
| `docs/implementation.md` | Implementation notes |
| `docs/future.md` | Roadmap and future features |

---

## Common Tasks

### Adding a new service to core

1. Create `packages/core/src/services/<name>.service.ts`
2. Export the service from `packages/core/src/services/index.ts`
3. Re-export from `packages/core/src/index.ts`
4. Add tests in `packages/core/src/services/<name>.service.test.ts`

### Adding a new MCP tool

1. Create or edit a tool file in `packages/mcp-server/src/tools/`
2. Register tools in the appropriate category's registration function
3. Ensure the category is included in `registerAllTools()` in `tools/index.ts`
4. Add tests in the corresponding `.test.ts` file

### Adding a new migration

1. Create `packages/core/src/db/migrations/NNN_<name>.ts`
2. Export SQL as a string constant (do not use filesystem reads)
3. Register the migration in `packages/core/src/db/migrations/index.ts`
4. Run `bun run test` to verify migrations apply cleanly

### Adding a TUI component

1. Create `.tsx` file in `apps/tui/src/components/`
2. Use Ink primitives (`Box`, `Text`) and existing shared components (`SelectableTable`, `ScrollArea`, etc.)
3. Add tests using `ink-testing-library` in a co-located `.test.tsx` file
4. Wire into the navigation via the Zustand store (`apps/tui/src/store/index.ts`)

---

## Platform-Specific Notes

### Desktop (Claude Code CLI)

- Full interactive TUI is available (`caw` with no flags)
- `bun test --watch` works for development
- Pre-commit hooks (Husky) run automatically on `git commit`
- Daemon mode (`caw run --detach`) spawns a background process
- Git worktree operations (`createWorktree`, `removeWorktree`) require local git

### Web (Claude Code on the web)

- Use `caw --server` for headless MCP access (no TUI rendering)
- Use `caw init --yes` to skip interactive prompts during setup
- Run tests per-package if full Turbo run times out: `bun run --filter @caw/core test`
- The `scripts/seed.ts` script can populate test data without a TUI
- Pre-commit hooks may not fire automatically; run `bun run format` manually before committing
- Database files (`.caw/*.db`) are ephemeral between web sessions unless committed (not recommended — add to `.gitignore`)
