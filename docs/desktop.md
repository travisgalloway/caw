# Desktop App Architecture

## Overview

The desktop app (`@caw/desktop`) provides a native GUI for monitoring and managing caw workflows. Built with [Tauri 2](https://v2.tauri.app/) wrapping a [SvelteKit 5](https://svelte.dev/) frontend.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Tauri 2 Native Window                                   │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  SvelteKit 5 SPA (adapter-static)                   │ │
│  │                                                     │ │
│  │  REST fetch ──> /api/*  ──> @caw/rest-api           │ │
│  │  WebSocket  ──> /ws     ──> real-time events        │ │
│  └─────────────────────────────────────────────────────┘ │
│                         │                                 │
│  Rust Backend (src-tauri/src/lib.rs)                      │
│    - Spawns sidecar: caw --server --transport http        │
│    - Health-check polling                                 │
│    - Kills sidecar process on exit                                      │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  caw sidecar (port 3100)                                 │
│    /mcp    ──> MCP protocol (spawned agents connect)     │
│    /api/*  ──> REST API (desktop app fetches)             │
│    /ws     ──> WebSocket (real-time updates)              │
│    /health ──> 200 OK                                     │
└─────────────────────────────────────────────────────────┘
```

The desktop app has **no direct package dependencies** on other caw packages. It communicates with the `caw` CLI sidecar entirely via REST API and WebSocket at runtime.

## Sidecar

The Rust backend (`src-tauri/src/lib.rs`) manages the sidecar lifecycle:

1. **Spawn** on app start: `caw --server --transport http --port 3100`
2. **Health-check** polling: `GET /health` until 200 OK
3. **SIGTERM** on app exit to clean up the background process

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Native wrapper | Tauri 2 (`@tauri-apps/cli`, `@tauri-apps/api`) |
| Frontend framework | SvelteKit 5 with `adapter-static` (output: `build/`) |
| Reactivity | Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) |
| CSS | Tailwind CSS v4 via `@tailwindcss/vite` with `@theme` directive |
| UI components | shadcn-svelte (via `bits-ui`) |
| Icons | `lucide-svelte` |
| API client | Typed fetch wrapper (`src/lib/api/client.ts`) |
| Real-time | WebSocket store with auto-reconnect (`src/lib/stores/ws.ts`) |

## Route Groups

Routes are split into two layout groups:

### `(app)/` — Main application pages (with nav sidebar)

| Route | Page | Description |
|-------|------|-------------|
| `/` | Workflow list | Table with Active/All toggle, search, WS live updates |
| `/workflows/[id]` | Workflow detail | Tabs: Tasks, Agents, Messages, Workspaces |
| `/workflows/[id]/tasks/[taskId]` | Task detail | Metadata, plan/outcome, checkpoints, dependencies |
| `/agents` | Agent list | All registered agents |
| `/agents/[id]` | Agent detail | Info card, capabilities, message inbox |
| `/messages` | Message inbox | Global inbox with filters, mark read |
| `/messages/[threadId]` | Thread detail | Message thread view |

### `(standalone)/` — Standalone pages (no nav sidebar)

| Route | Page | Description |
|-------|------|-------------|
| `/settings` | Settings | Config editing |

## Shared Components (`src/lib/components/`)

| Component | Description |
|-----------|-------------|
| `StatusBadge.svelte` | Colored badge for workflow/task status strings |
| `ProgressBar.svelte` | Green progress bar with completed/total count |
| `RelativeTime.svelte` | Auto-updating relative time display (e.g. "2m ago") |
| `StatsCards.svelte` | Summary statistics cards |
| `TaskTree.svelte` | Hierarchical task tree view |
| `TaskDag.svelte` | DAG visualization of task dependencies |
| `ExecutionPanel.svelte` | Workflow execution controls |
| `MessageComposer.svelte` | Message composition form |
| `CommandPalette.svelte` | Keyboard-driven command palette |
| `WorkflowCreateForm.svelte` | Workflow creation form |
| `EmptyState.svelte` | Empty state placeholder |
| `LiveIndicator.svelte` | WebSocket connection status indicator |

## API Client

The typed API client (`src/lib/api/client.ts`) wraps `fetch` with a configurable base URL:

- **Dev**: `VITE_API_BASE_URL` defaults to the Vite dev server, which proxies to `localhost:3100`
- **Prod (Tauri)**: Points directly to `http://localhost:3100`

## WebSocket Store

`src/lib/stores/ws.ts` provides a Svelte writable store with:

- Auto-reconnect on disconnect
- Channel subscribe/unsubscribe protocol
- Derives WebSocket URL from the API base URL

## Development

```bash
# Frontend-only dev (start backend separately)
caw --server --transport http --port 3100   # Terminal 1
bun run --filter @caw/desktop dev           # Terminal 2 (Vite proxies /api, /ws)

# Tauri dev (starts sidecar + native window)
cd apps/desktop && bun run tauri:dev

# Build static frontend
bun run --filter @caw/desktop build:web

# Build desktop app (produces installable binary)
cd apps/desktop && bun run tauri:build

# Type check
bun run --filter @caw/desktop check
```
