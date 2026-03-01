# REST API & WebSocket Architecture

Browser-based dashboard for caw workflows, served via `caw --server --transport http` on a single Bun.serve() instance.

## System Overview

```
Browser (SvelteKit static build)
  |
  |-- REST fetch --> /api/*  ──> @caw/rest-api ──> @caw/core services ──> SQLite
  |-- WebSocket  --> /ws     ──> @caw/rest-api (ws broadcaster)
  |
Bun.serve() on :3100
  |-- /mcp       ──> @modelcontextprotocol/sdk (existing, unchanged)
  |-- /health    ──> 200 OK (existing, unchanged)
  |-- /api/*     ──> REST API router
  |-- /ws        ──> WebSocket upgrade
  |-- /*         ──> Static files from apps/desktop/build/
```

All endpoints share a single port. The combined server lives in `apps/cli/src/api-server.ts`.

## Packages

### `@caw/rest-api` (`packages/rest-api/`)

REST API and WebSocket layer. Depends only on `@caw/core`.

**Key modules:**

| File | Purpose |
|------|---------|
| `src/router.ts` | Bun-native HTTP router with path parameter extraction |
| `src/response.ts` | JSON response helpers (`ok`, `created`, `badRequest`, etc.) |
| `src/middleware.ts` | CORS middleware |
| `src/api.ts` | `createRestApi(db, broadcaster?)` — registers all routes |
| `src/ws/broadcaster.ts` | In-process EventEmitter for event dispatch |
| `src/ws/handler.ts` | WebSocket upgrade with channel subscriptions |

**Response format:**

```jsonc
// Success
{ "data": { ... } }
{ "data": [ ... ], "meta": { "total": 42 } }

// Error
{ "error": { "code": "BAD_REQUEST", "message": "..." } }
```

### `@caw/desktop` (`apps/desktop/`)

Tauri 2 desktop app wrapping a SvelteKit 5 static SPA. No package dependencies on other caw packages — communicates with the CLI sidecar via REST API and WebSocket at runtime.

**Tech stack:**
- Tauri 2 native wrapper (`@tauri-apps/cli`, `@tauri-apps/api`)
- SvelteKit 5 with `adapter-static` (output: `build/`)
- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`)
- Tailwind CSS v4 with `@theme` directive
- shadcn-svelte (via `bits-ui`) for UI primitives
- `lucide-svelte` for icons

## REST API Endpoints

### Workflows

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workflows` | List workflows (filter: `?status=`) |
| POST | `/api/workflows` | Create workflow |
| GET | `/api/workflows/:id` | Get workflow |
| PUT | `/api/workflows/:id/status` | Update workflow status |
| PUT | `/api/workflows/:id/plan` | Set workflow plan |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workflows/:wfId/tasks` | List tasks for workflow |
| GET | `/api/tasks/:id` | Get task |
| PUT | `/api/tasks/:id/status` | Update task status |
| PUT | `/api/tasks/:id/plan` | Set task plan |
| POST | `/api/tasks/:id/claim` | Claim task for agent |
| POST | `/api/tasks/:id/release` | Release claimed task |
| GET | `/api/tasks/:id/dependencies` | Get task dependencies |
| GET | `/api/tasks/:id/checkpoints` | List checkpoints |
| POST | `/api/tasks/:id/checkpoints` | Add checkpoint |

### Orchestration

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workflows/:id/next-tasks` | Get next available tasks |
| GET | `/api/workflows/:id/progress` | Get workflow progress stats |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents` | List agents (filter: `?status=`, `?role=`, `?workflow_id=`) |
| POST | `/api/agents` | Register agent |
| GET | `/api/agents/:id` | Get agent |
| PUT | `/api/agents/:id` | Update agent |
| PUT | `/api/agents/:id/heartbeat` | Agent heartbeat |
| DELETE | `/api/agents/:id` | Unregister agent |

### Messages

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/messages` | List all messages |
| POST | `/api/messages` | Send message |
| GET | `/api/messages/unread/count` | Count all unread |
| GET | `/api/messages/:id` | Get message |
| PUT | `/api/messages/mark-read` | Mark messages read |
| GET | `/api/threads/:id` | Get message thread |
| GET | `/api/agents/:id/messages` | List agent messages |
| GET | `/api/agents/:id/messages/unread` | Count agent unread |
| POST | `/api/messages/broadcast` | Broadcast message |

### Workspaces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workflows/:wfId/workspaces` | List workspaces |
| POST | `/api/workspaces` | Create workspace |
| GET | `/api/workspaces/:id` | Get workspace |
| PUT | `/api/workspaces/:id` | Update workspace |

### Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/templates` | List templates |
| POST | `/api/templates` | Create template |
| GET | `/api/templates/:id` | Get template |
| POST | `/api/templates/:id/apply` | Apply template (creates workflow) |

### Locks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workflows/:id/lock` | Get lock info |
| POST | `/api/workflows/:id/lock` | Lock workflow |
| POST | `/api/workflows/:id/unlock` | Unlock workflow |

## WebSocket Protocol

Single endpoint: `ws://host:port/ws`

### Client Messages

```jsonc
// Subscribe to a channel
{ "type": "subscribe", "channel": "global" }
{ "type": "subscribe", "channel": "workflow:wf_abc123" }
{ "type": "subscribe", "channel": "agent:ag_def456" }

// Unsubscribe
{ "type": "unsubscribe", "channel": "workflow:wf_abc123" }
```

### Server Events

```jsonc
{ "type": "workflow:status", "data": { "id": "wf_...", "status": "in_progress" } }
{ "type": "task:updated", "data": { "id": "tk_...", "status": "completed", "workflow_id": "wf_..." } }
{ "type": "agent:registered", "data": { "id": "ag_...", "name": "..." } }
{ "type": "agent:heartbeat", "data": { "id": "ag_...", "timestamp": 1234567890 } }
{ "type": "agent:unregistered", "data": { "id": "ag_..." } }
{ "type": "message:new", "data": { "id": "msg_...", "recipient_id": "ag_..." } }
```

Events are dispatched by an in-process EventEmitter (`Broadcaster`). REST mutation handlers emit events after successful DB writes. The WebSocket handler forwards events to clients subscribed to matching channels.

### Channels

| Channel | Events |
|---------|--------|
| `global` | All events |
| `workflow:<id>` | Workflow and its task events |
| `agent:<id>` | Agent events and messages for that agent |

## Web UI Pages

| Route | Component | Data Source |
|-------|-----------|-------------|
| `/` | Workflow list | `GET /api/workflows` + WS `global` |
| `/workflows/[id]` | Workflow detail (tabbed) | `GET /api/workflows/:id` + WS `workflow:<id>` |
| `/workflows/[id]/tasks/[taskId]` | Task detail | `GET /api/tasks/:id` |
| `/agents/[id]` | Agent detail | `GET /api/agents/:id` |
| `/messages` | Global message inbox | `GET /api/messages` |
| `/setup` | Setup/connection checks | `GET /health`, WS connect test |
| `/help` | Static help docs | (none) |

## Combined Server (`apps/cli/src/api-server.ts`)

The `--server --transport http` flags start a single `Bun.serve()` that routes requests:

1. `/ws` — WebSocket upgrade via `createWsHandler`
2. `/mcp` — MCP protocol via `createHttpHandler` from `@caw/mcp-server`
3. `/health` — 200 OK
4. `/api/*` — REST API via `createRestApi` from `@caw/rest-api`

## Development

```bash
# Start backend (REST + MCP + WS)
caw --server --transport http --port 3100

# Start desktop frontend dev server (separate terminal)
cd apps/desktop && bun run dev
# Vite proxies /api and /ws to localhost:3100

# Or run Tauri dev (starts sidecar + native window)
cd apps/desktop && bun run tauri:dev
```
