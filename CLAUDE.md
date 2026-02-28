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
- **Run the CLI**: `bun apps/cli/src/bin/cli.ts --server` or use subcommands like `caw run`, `caw work`

### Web (Claude Code on the web)

Web sessions run in a sandboxed Linux environment. Key differences from desktop:

- **No persistent daemon**: The daemon mode (`caw run --detach`) will not persist between sessions. Prefer `--no-watch` or direct MCP server mode (`caw --server`) for headless operation.
- **No global `~/.caw/` directory across sessions**: Use per-repo mode (`--db .caw/workflows.db`) to keep data within the repo.
- **Bun is available**: The runtime environment includes Bun, so all build/test/lint commands work as documented.
- **Git is available**: Standard git operations work. Push requires proper remote configuration.
- **Use CLI mode**: On web, use `caw --server` (headless MCP) or the CLI subcommands (`caw run`, `caw init`, etc.).

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

Seven workspace packages managed by Bun workspaces + Turbo:

```
caw/
├── packages/
│   ├── core/           @caw/core         — Database, types, services, utilities
│   ├── mcp-server/     @caw/mcp-server   — MCP protocol server (tools, transport)
│   ├── rest-api/       @caw/rest-api     — REST API + WebSocket broadcaster
│   └── spawner/        @caw/spawner      — Agent spawning via claude CLI
├── apps/
│   ├── cli/            @caw/cli          — caw binary (CLI commands + headless server)
│   └── desktop/        @caw/desktop      — Tauri desktop app (SvelteKit frontend + sidecar)
├── tooling/
│   └── tsconfig/       @caw/tsconfig     — Shared TypeScript configs
├── docs/                                 — Design documentation (16 files)
└── scripts/                              — Utility scripts (seed.ts)
```

### Dependency graph

```
@caw/core         (no dependencies)
@caw/spawner    → @caw/core
@caw/rest-api   → @caw/core
@caw/mcp-server → @caw/core, @caw/spawner
@caw/cli        → @caw/core, @caw/spawner, @caw/mcp-server, @caw/rest-api
@caw/desktop    → (no package deps — Tauri app, talks to REST API at runtime)
```

All packages depend on `@caw/core`. The CLI app depends on all four library packages. The desktop app is a Tauri wrapper around SvelteKit with no package dependencies (communicates with the CLI sidecar via REST API and WebSocket).

### Package details

- **`packages/core`** (`@caw/core`) — Database layer (SQLite via `bun:sqlite`), entity types, 13 service modules, ID generation, token estimation, git worktree utilities. All other packages depend on this.
- **`packages/mcp-server`** (`@caw/mcp-server`) — MCP protocol server library. 12 tool categories (30+ tools), stdio and HTTP transports, `createHttpHandler` for embedding MCP in a combined server. Depends on core and spawner.
- **`packages/rest-api`** (`@caw/rest-api`) — REST API layer exposing core services as HTTP endpoints. Bun-native router, JSON response helpers, CORS middleware, WebSocket broadcaster for real-time events. Depends on core.
- **`packages/spawner`** (`@caw/spawner`) — Agent spawning via `claude -p` CLI. Includes `WorkflowSpawner`, `AgentSession`, `AgentPool`, prompt builders, and MCP config management. Depends on core.
- **`apps/cli`** (`@caw/cli`) — The `caw` binary. Headless MCP server (`--server`), combined HTTP server (`--server --transport http` with MCP + REST API + WebSocket), and CLI commands (`init`, `setup`, `run`, `work`, `pr`). Depends on core, mcp-server, spawner, and rest-api.
- **`apps/desktop`** (`@caw/desktop`) — Tauri 2 desktop app wrapping SvelteKit 5 frontend with shadcn-svelte and Tailwind CSS v4. Spawns the `caw` binary as a sidecar for the backend. No package dependencies.
- **`tooling/tsconfig`** (`@caw/tsconfig`) — Shared TypeScript configs: `base.json` (ES2022, ESM, strict, noEmit) and `library.json` (extends base).

---

## CLI Usage

The `caw` binary (`apps/cli/src/bin/cli.ts`) supports these modes:

```bash
caw --server                     # Headless MCP server (stdio transport)
caw --server --transport http    # Combined server: MCP + REST API + WebSocket (port 3100)
caw init [--yes] [--global]      # Initialize caw in repo or globally
caw setup claude-code            # Configure Claude Code MCP integration
caw run <workflow_id>            # Execute a workflow
caw run --prompt "..."           # Create + plan + run from a prompt
caw work <issues...>             # Work on GitHub issue(s): plan, execute, PR
caw pr list|check|merge|cycle    # PR lifecycle management
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

13 service modules, each exporting a singleton service object with methods that take a `db` connection as the first argument:

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

**Task states**: `pending` | `blocked` → `planning` → `in_progress` → `completed` | `failed` | `paused` | `skipped`

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

## REST API Package (`packages/rest-api/`)

### Architecture

- **Bun-native router** (`src/router.ts`): Path-to-regex based request routing with parameter extraction
- **JSON response helpers** (`src/response.ts`): `ok()`, `created()`, `noContent()`, `badRequest()`, `notFound()`, `conflict()`, `serverError()`
- **CORS middleware** (`src/middleware.ts`): `applyCors()` wraps responses with CORS headers, `handlePreflight()` handles OPTIONS
- **WebSocket broadcaster** (`src/ws/broadcaster.ts`): In-process EventEmitter for pushing events to connected clients
- **WebSocket handler** (`src/ws/handler.ts`): Upgrade handler with channel-based subscribe/unsubscribe protocol

### Route Modules (`src/routes/`)

| Module | Endpoints |
|--------|-----------|
| `workflows.ts` | `GET/POST /api/workflows`, `GET/PUT /api/workflows/:id`, `PUT /api/workflows/:id/status`, `PUT /api/workflows/:id/plan` |
| `tasks.ts` | `GET /api/workflows/:wfId/tasks`, `GET/PUT /api/tasks/:id`, `PUT /api/tasks/:id/status`, `PUT /api/tasks/:id/plan`, `POST /api/tasks/:id/claim`, `POST /api/tasks/:id/release` |
| `orchestration.ts` | `GET /api/workflows/:id/next-tasks`, `GET /api/workflows/:id/progress`, `GET /api/tasks/:id/dependencies` |
| `agents.ts` | `GET/POST /api/agents`, `GET/PUT/DELETE /api/agents/:id`, `PUT /api/agents/:id/heartbeat` |
| `messages.ts` | `GET/POST /api/messages`, `GET /api/agents/:id/messages`, `GET /api/agents/:id/unread`, `GET /api/messages/unread`, `PUT /api/messages/:id/read`, `GET /api/messages/:id`, `GET /api/messages/:id/thread` |
| `workspaces.ts` | `GET /api/workflows/:wfId/workspaces`, `GET/PUT /api/workspaces/:id`, `POST /api/workspaces` |
| `templates.ts` | `GET/POST /api/templates`, `GET /api/templates/:id`, `POST /api/templates/:id/apply` |
| `locks.ts` | `GET /api/workflows/:id/lock`, `POST /api/workflows/:id/lock`, `POST /api/workflows/:id/unlock` |
| `checkpoints.ts` | `GET /api/tasks/:id/checkpoints`, `POST /api/tasks/:id/checkpoints` |

### WebSocket Protocol

Single endpoint `ws://host:port/ws`. Channels: `global`, `workflow:<id>`, `agent:<id>`.

```jsonc
// Client → Server
{ "type": "subscribe", "channel": "workflow:wf_abc123" }
{ "type": "unsubscribe", "channel": "workflow:wf_abc123" }

// Server → Client
{ "type": "workflow:status", "data": { "id": "wf_...", "status": "in_progress" } }
{ "type": "task:updated", "data": { "id": "tk_...", "status": "completed" } }
```

### Key Exports

- `createRestApi(db, broadcaster?)` — Creates router with all routes registered, returns handle function
- `createRouter()` — Bare router for custom route registration
- `createBroadcaster()` — EventEmitter-based broadcaster
- `createWsHandler(broadcaster)` — WebSocket upgrade handler

---

## CLI App (`apps/cli/`)

### Architecture

- **Headless CLI**: Prints usage and exits when run without flags
- **Server modes**: `--server` (stdio MCP) or `--server --transport http` (combined MCP + REST + WS)
- **Subcommands**: `init`, `setup`, `run`, `work`, `pr`
- **Daemon**: Background MCP server with session tracking and health checks

### Key Files

| File | Purpose |
|------|---------|
| `bin/cli.ts` | Entry point — arg parsing, mode dispatch |
| `server.ts` | Headless MCP server (stdio transport) |
| `api-server.ts` | Combined HTTP server (MCP + REST API + WebSocket) |
| `daemon.ts` | Background daemon with lock file and heartbeat |
| `commands/` | CLI subcommands (init, setup, run, work, pr) |

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

## Desktop App (`apps/desktop/`)

### Architecture

- **Tauri 2**: Native desktop wrapper with sidecar management
- **SvelteKit 5**: Static SPA built with `adapter-static`, output to `build/`
- **Svelte 5 runes**: Uses `$state`, `$derived`, `$effect`, `$props` (not legacy stores)
- **Tailwind CSS v4**: Configured via `@tailwindcss/vite` plugin with `@theme` directive for custom status colors
- **shadcn-svelte**: Component primitives via `bits-ui` (Button, Card, Table, Tabs, Badge, etc.)
- **API client** (`src/lib/api/client.ts`): Typed fetch wrapper with configurable `VITE_API_BASE_URL`
- **WebSocket store** (`src/lib/stores/ws.ts`): Svelte writable store with auto-reconnect, derives WS URL from API base

### Sidecar

The desktop app spawns `caw --server --transport http --port 3100` as a sidecar process on startup. The Rust backend (`src-tauri/src/lib.rs`) manages the sidecar lifecycle: spawn on app start, health-check polling, SIGTERM on exit.

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Workflow list | Table with Active/All toggle, search, WS live updates |
| `/workflows/[id]` | Workflow detail | Tabs: Tasks, Agents, Messages, Workspaces |
| `/workflows/[id]/tasks/[taskId]` | Task detail | Metadata, plan/outcome, checkpoints, dependencies |
| `/agents/[id]` | Agent detail | Info card, capabilities, message inbox |
| `/messages` | Message inbox | Global inbox with filters, mark read |
| `/setup` | Setup guide | Connection checks, quick start |
| `/help` | Help | Static documentation |

### Shared Components (`src/lib/components/`)

- `StatusBadge.svelte` — Colored badge for workflow/task status strings
- `ProgressBar.svelte` — Green progress bar with completed/total count
- `RelativeTime.svelte` — Auto-updating relative time display (e.g. "2m ago")

### Development

```bash
# Dev server with Vite proxy to backend
bun run --filter @caw/desktop dev

# Build static output to apps/desktop/build/
bun run --filter @caw/desktop build:web

# Type check
bun run --filter @caw/desktop check

# Tauri dev (starts sidecar + native window)
cd apps/desktop && bun run tauri:dev

# Tauri build (produces installable desktop app)
cd apps/desktop && bun run tauri:build
```

For frontend-only development, run `caw --server --transport http --port 3100` in a separate terminal, then `bun run --filter @caw/desktop dev`. The Vite dev server proxies `/api` and `/ws` to `localhost:3100`.

---

## Key Dependencies

| Dependency | Package | Purpose |
|-----------|---------|---------|
| `bun:sqlite` | core | Built-in synchronous SQLite driver |
| `nanoid` ^5.0.9 | core | ESM-native ID generation |
| `zod` ^4.3.6 | core, mcp-server | Schema validation |
| `@modelcontextprotocol/sdk` ^1.25.3 | mcp-server | MCP protocol implementation |
| `@tauri-apps/cli` ^2 | desktop (dev) | Tauri build tooling |
| `@tauri-apps/api` ^2 | desktop | Tauri runtime API |
| `@sveltejs/kit` ^2.16.0 | desktop | SvelteKit framework |
| `svelte` ^5.0.0 | desktop | Svelte 5 with runes |
| `tailwindcss` ^4.0.0 | desktop | Utility-first CSS (v4) |
| `bits-ui` ^2.14.4 | desktop | shadcn-svelte component primitives |
| `lucide-svelte` ^0.469.0 | desktop | Icon library |

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`):

- **Triggers**: Push to `main`, PRs targeting `main`
- **Runner**: `ubuntu-latest`
- **Bun version**: 1.3.8
- **Steps**: `bun install` → `bun run lint` → `bun run build` → `bun run test` → `bun run --filter @caw/desktop build:web`

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
| `docs/desktop.md` | Desktop app architecture, pages, sidecar |
| `docs/error-handling.md` | Error handling strategy |
| `docs/project-structure.md` | Directory layout and package descriptions |
| `docs/overview.md` | High-level architecture |
| `docs/examples.md` | Usage examples |
| `docs/implementation.md` | Implementation notes |
| `docs/future.md` | Roadmap and future features |
| `docs/rest-api.md` | REST API and WebSocket architecture |
| `docs/self-development.md` | Using `caw work` for self-development |

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

### Adding a REST API route

1. Create or edit a route file in `packages/rest-api/src/routes/`
2. Register the route function in `packages/rest-api/src/api.ts` (`createRestApi`)
3. Use `ok()`, `created()`, `badRequest()`, `notFound()` helpers from `../response`
4. Optionally accept a `Broadcaster` parameter and emit events after mutations
5. Add tests in `packages/rest-api/src/api.test.ts`

### Adding a desktop UI page

1. Create a route directory under `apps/desktop/src/routes/` (e.g. `my-page/+page.svelte`)
2. Use Svelte 5 runes (`$state`, `$derived`, `$effect`) — not legacy stores
3. Import API client from `$lib/api/client` for data fetching
4. Use shared components (`StatusBadge`, `ProgressBar`, `RelativeTime`) from `$lib/components/`
5. Add nav link in `src/routes/+layout.svelte` if it's a top-level page

---

## Platform-Specific Notes

### Desktop (Claude Code CLI)

- `bun test --watch` works for development
- Pre-commit hooks (Husky) run automatically on `git commit`
- Daemon mode (`caw run --detach`) spawns a background process
- Git worktree operations (`createWorktree`, `removeWorktree`) require local git
- Desktop app: `cd apps/desktop && bun run tauri:dev` for Tauri development

### Web (Claude Code on the web)

- Use `caw --server` for headless MCP access
- Use `caw init --yes` to skip interactive prompts during setup
- Run tests per-package if full Turbo run times out: `bun run --filter @caw/core test`
- The `scripts/seed.ts` script can populate test data
- Pre-commit hooks may not fire automatically; run `bun run format` manually before committing
- Database files (`.caw/*.db`) are ephemeral between web sessions unless committed (not recommended — add to `.gitignore`)

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
