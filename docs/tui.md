# TUI Design

## Overview

The TUI (Terminal User Interface) provides real-time visibility into workflow execution, agent status, and messaging. Built with [Ink](https://github.com/vadimdemedes/ink) (React for CLI).

## Launch

```bash
# Start the TUI (default mode)
caw
caw --db ~/.caw/workflows.db
caw --workflow wf_abc123

# Start as headless MCP server (for Claude Code / other MCP clients)
caw --server
caw --server --transport stdio     # default, for MCP client integration
caw --server --transport http      # HTTP mode on port 3100
caw --server --port 8080           # custom port

# Start as web UI dashboard (REST API + WebSocket + MCP + static UI)
caw --web-ui                       # serves on port 3100
caw --web-ui --port 8080           # custom port
```

## Layout

```
┌─ Workflow Agent ──────────────────────────────────────────────────────┐
│                                                                       │
│  ┌─ Workflows ────────────────────┐  ┌─ Agents ────────────────────┐  │
│  │ ● wf_abc123 OAuth Impl    [3/5]│  │ ● ag_xyz  worker-1  [busy]  │  │
│  │ ○ wf_def456 API Refactor  [1/8]│  │ ● ag_uvw  worker-2  [online]│  │
│  │ ◐ wf_ghi789 Bug Fixes     [2/3]│  │ ○ ag_rst  worker-3  [offline│  │
│  └────────────────────────────────┘  └─────────────────────────────┘  │
│                                                                       │
│  ┌─ Tasks (wf_abc123) ────────────────────────────────────────────┐   │
│  │                                                                │   │
│  │  ✓ Setup OAuth infrastructure              [completed]         │   │
│  │  ├─● Implement Google OAuth                [in_progress]       │   │
│  │  │   └─ ag_xyz working (2 checkpoints)                         │   │
│  │  ├─◐ Implement GitHub OAuth                [in_progress]       │   │
│  │  │   └─ ag_uvw working (1 checkpoint)                          │   │
│  │  ├─○ Session management                    [blocked]           │   │
│  │  │   └─ waiting on: Google OAuth, GitHub OAuth                 │   │
│  │  └─○ Protected routes middleware           [pending]           │   │
│  │                                                                │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─ Messages (3 unread) ──────────────────────────────────────────┐   │
│  │ ► [urgent] ag_xyz: Need clarification on OAuth scopes          │   │
│  │   [normal] ag_uvw: GitHub OAuth complete, ready for review     │   │
│  │   [normal] system: Workflow wf_def456 started                  │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  [w]orkflows [a]gents [m]essages [t]asks [q]uit  [?]help              │
└───────────────────────────────────────────────────────────────────────┘
```

## Views

**Dashboard (default)**

- Split view: workflows list, agents list, task tree, messages
- Real-time updates via polling (configurable interval)
- Status indicators with colors

**Workflow Detail (`w` then select)**

- Full task DAG with dependencies
- Progress statistics
- Checkpoint history
- Associated agents and workspaces

**Agent Detail (`a` then select)**

- Current status and task
- Message history
- Heartbeat status
- Performance metrics

**Message View (`m`)**

- Inbox with filtering (unread, priority, type)
- Thread view for conversations
- Compose new message
- Quick actions (mark read, archive)

**Task Detail (select from tree)**

- Full plan and context
- Checkpoint timeline
- File changes
- Assigned agent info

## Keybindings

| Key            | Action          |
| -------------- | --------------- |
| `↑/↓` or `j/k` | Navigate lists  |
| `Enter`        | Select/expand   |
| `Esc`          | Back/close      |
| `w`            | Focus workflows |
| `a`            | Focus agents    |
| `m`            | Focus messages  |
| `t`            | Focus tasks     |
| `r`            | Refresh         |
| `f`            | Filter/search   |
| `?`            | Help            |
| `q`            | Quit            |

## Status Indicators

```
Workflows:
  ●  in_progress (green)
  ◐  partially complete (yellow)
  ✓  completed (blue)
  ✗  failed (red)
  ○  pending/ready (gray)

Agents:
  ●  online (green)
  ●  busy (yellow)
  ○  offline (gray)

Tasks:
  ✓  completed
  ●  in_progress
  ◐  planning
  ○  pending
  ⊘  blocked
  ✗  failed
```

## Configuration

```typescript
// ~/.caw/tui.config.json
{
  "pollInterval": 2000,        // ms between updates
  "theme": "default",          // 'default', 'minimal', 'compact'
  "showTimestamps": true,
  "maxVisibleWorkflows": 10,
  "maxVisibleAgents": 5,
  "maxVisibleMessages": 10,
  "defaultView": "dashboard"   // 'dashboard', 'workflows', 'agents'
}
```

## Components Architecture

```typescript
// Main app structure
<App>
  <Header title="Workflow Agent" />
  <Dashboard>
    <WorkflowList
      workflows={workflows}
      selected={selectedWorkflow}
      onSelect={setSelectedWorkflow}
    />
    <AgentList
      agents={agents}
      onSelect={setSelectedAgent}
    />
    <TaskTree
      workflow={selectedWorkflow}
      onSelect={setSelectedTask}
    />
    <MessageList
      messages={unreadMessages}
      onSelect={setSelectedMessage}
    />
  </Dashboard>
  <StatusBar keybindings={activeKeybindings} />
</App>
```

## Real-time Updates

The TUI polls the database for updates:

```typescript
// usePolling hook
function usePolling<T>(
  fetcher: () => Promise<T>,
  interval: number = 2000,
): { data: T | null; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    const poll = async () => {
      const result = await fetcher();
      setData(result);
    };

    poll(); // Initial fetch
    const id = setInterval(poll, interval);
    return () => clearInterval(id);
  }, [fetcher, interval]);

  return { data, loading: !data, error: null };
}
```
