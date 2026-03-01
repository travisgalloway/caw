# Implementation Priorities

## Phase 1: Core Foundation (M1 — Complete)

1. Project scaffolding (turbo, bun workspace)
2. Database setup with migrations
3. Basic CRUD operations for all entities
4. ID generation utilities (nanoid)
5. Type definitions

## Phase 2: Core Services (M2 — Complete)

1. Workflow, task, checkpoint, workspace services
2. Agent, message, orchestration services
3. Context loading service
4. Repository and template services
5. Dependency resolution (DAG traversal)

## Phase 3: MCP Server (M3 — Complete)

1. Server setup with MCP SDK
2. All 43 tool registrations across 7 categories
3. Structured ToolCallError for error responses
4. Transport layer (stdio + HTTP)

## Phase 4: CLI Foundation (M4)

1. Headless `caw` binary entry point (`caw --server` for MCP, subcommands for workflow operations)
2. Headless MCP server mode (stdio/HTTP transport)
3. Combined HTTP server (MCP + REST API + WebSocket)
4. CLI subcommands: `init`, `setup`, `run`, `work`, `pr`
5. Daemon mode with lock file and heartbeat

## Phase 5: Desktop App (M5)

1. Tauri 2 native wrapper with sidecar management
2. SvelteKit 5 frontend with shadcn-svelte and Tailwind CSS v4
3. Workflow list, detail, task detail pages
4. Agent and message views
5. Real-time updates via WebSocket

## Phase 6: Agent Protocol & Worktrees (M6)

1. Agent workflow protocol documentation
2. Git worktree management utility
3. Agent coordination protocol (multi-agent task selection)

## Phase 7: Testing & Quality (M7)

1. Comprehensive test suite (core services, MCP tools, desktop UI pages)
2. Remove `apps/orchestrator` package
3. Update CLAUDE.md for current architecture

## Phase 8: Documentation & Polish (M8)

1. README and package documentation
2. CLAUDE.md integration guide
3. Template CLI commands (`caw --template`, `caw --list-templates`)
4. Error handling verification (ToolCallError across all 43 tools)

## Phase 9: Web UI & REST API (M9 — Complete)

1. `@caw/rest-api` package — Bun-native REST router, JSON response helpers, CORS middleware
2. Route modules for all core entities (workflows, tasks, agents, messages, etc.)
3. WebSocket broadcaster with channel-based subscribe/unsubscribe protocol
4. `@caw/desktop` Tauri 2 desktop app — SvelteKit 5 SPA with shadcn-svelte and Tailwind CSS v4
5. Pages: workflow list, workflow detail (tabbed), task detail, agent detail, message inbox, setup, help
6. Real-time updates via WebSocket store with auto-reconnect
7. Combined `--server --transport http` mode in `@caw/cli` (REST API + WebSocket + MCP)
