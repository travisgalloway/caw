# @caw/tui

Unified `caw` binary — interactive TUI dashboard (default) or headless MCP server (`--server`).

## Modes

### TUI (default)

Interactive terminal dashboard for monitoring workflows, agents, tasks, and messages.

```bash
caw                          # launch dashboard
caw --workflow wf_abc123     # focus on a specific workflow
caw --db /path/to/db.sqlite  # custom database path
```

### Headless MCP Server

Run as an MCP server for Claude Code or other MCP clients, with no UI.

```bash
caw --server                              # stdio transport
caw --server --transport http --port 8080 # HTTP transport
```

### Template Commands

Create workflows from templates without launching the TUI.

```bash
caw --list-templates                           # list available templates
caw --template oauth-setup "Add OAuth to app"  # create workflow from template
```

## Dashboard

The dashboard is a split-panel view with four sections, updated via polling:

- **Workflows** — Active and recent workflows with progress indicators
- **Agents** — Registered agents with status (online, busy, offline)
- **Tasks** — Dependency tree for the selected workflow with status per task
- **Messages** — Unread message inbox with priority indicators

### Detail Views

- **Workflow Detail** — Full task DAG, progress statistics, checkpoint history, associated agents and workspaces
- **Agent Detail** — Current status and task, message history, heartbeat status

## Keybindings

| Key | Action |
|---|---|
| `q` | Quit |
| `?` | Help |
| `Esc` | Back / close |
| `w` | Focus workflows |
| `a` | Focus agents |
| `t` | Focus tasks |
| `m` | Focus messages |
| `r` | Refresh |
| `↑/↓` or `j/k` | Navigate lists |
| `Enter` | Select / expand |

## Architecture

```
src/
├── bin/
│   └── cli.ts              # Entry point — arg parsing, mode dispatch
├── app.tsx                  # runTui — Ink app bootstrap
├── server.ts                # runServer — headless MCP server bootstrap
├── components/
│   ├── Dashboard.tsx        # Main split-panel layout
│   ├── WorkflowList.tsx     # Workflow list panel
│   ├── WorkflowDetail.tsx   # Workflow detail view
│   ├── AgentList.tsx        # Agent list panel
│   ├── AgentDetail.tsx      # Agent detail view
│   ├── TaskTree.tsx         # Task dependency tree
│   ├── MessageInbox.tsx     # Message list
│   ├── MessagePanel.tsx     # Message detail / compose
│   ├── ProgressBar.tsx      # Progress visualization
│   ├── StatusIndicator.tsx  # Status dot with color
│   └── TypeBadge.tsx        # Colored type label
├── context/
│   └── db.ts                # Database React context
├── hooks/
│   ├── useWorkflows.ts      # Workflow list data
│   ├── useWorkflowDetail.ts # Single workflow with tasks
│   ├── useAgents.ts         # Agent list data
│   ├── useAgentDetail.ts    # Single agent detail
│   ├── useTasks.ts          # Task list for a workflow
│   ├── useMessages.ts       # Message inbox data
│   ├── usePolling.ts        # Generic polling hook
│   └── useKeyBindings.ts    # Keyboard input handling
├── store/
│   └── index.ts             # Zustand store — view state, selections
└── utils/
    └── format.ts            # Date, status, and display formatting
```

## Dependencies

- **@caw/core** — Database layer and services
- **@caw/mcp-server** — MCP server (used in `--server` mode)
- **ink** — React-based terminal UI framework
- **react** — Component model
- **zustand** — Lightweight state management
