# Data Model

## Entity Relationship

```
┌────────────┐
│ Repository │◄───────────────────┐
└─────┬──────┘                    │
      │                           │ many-to-many
      │    ┌──────────────────────┴──────┐
      │    │ workflow_repositories (join) │
      │    └──────────────────────┬──────┘
      │                           │
      ▼                           ▼
┌────────────┐       ┌───────────────────┐
│  Workflow  │──────►│ Task Dependencies │
└─────┬──────┘       └───────────────────┘
      │ 1:many              │
      ▼                     │
┌────────────┐◄─────────────┘
│    Task    │◄──────────────┐
└─────┬──────┘               │
      │ 1:many               │ assigned_to
      ▼                      │
┌────────────┐         ┌─────┴─────┐
│ Checkpoint │         │   Agent   │
└────────────┘         └─────┬─────┘
                             │ sender/recipient
┌────────────┐               ▼
│ Workspace  │         ┌───────────┐
└────────────┘         │  Message  │
                       └───────────┘
┌────────────┐
│  Template  │
└────────────┘
```

Note: Tasks and Workspaces can optionally reference a specific Repository for multi-repo workflows.

## Multi-Agent Model

Agents are registered instances that can claim and execute tasks:

- **Agent Registration** - Agents register on startup with unique ID, name, and capabilities
- **Heartbeat** - Agents send periodic heartbeats; stale agents marked offline after timeout
- **Task Assignment** - Tasks assigned to specific agents or claimed from unassigned pool
- **Messaging** - Agents communicate via persistent message queues (inbox pattern)
- **Roles** - Agents can have roles (coordinator, worker) affecting their capabilities

## Repository/Directory Support

The datastore supports two modes:

1. **Global mode** - Single SQLite at `~/.caw/workflows.db` tracks all repositories
2. **Per-repository mode** - SQLite at `{repo}/.caw/workflows.db` for isolation

Configuration determines mode. Global mode uses `repositories` table to scope workflows.

## Multi-Repository Workflows

A single workflow can coordinate work across multiple repositories via the `workflow_repositories` join table. This is global mode only.

- **Workflow → Repositories**: Many-to-many via `workflow_repositories` join table
- **Tasks**: Optionally declare their `repository_id` to scope work to a specific repo
- **Workspaces**: Optionally declare their `repository_id` to associate with a specific repo
- **No inheritance**: In multi-repo workflows, tasks must explicitly declare their repository
- **Per-repo mode**: Continues as single-repo isolation (no join table needed)

## ID Generation

All IDs use nanoid with charset `0123456789abcdefghijklmnopqrstuvwxyz`:

- Workflows: `wf_` prefix, 12 chars (e.g., `wf_a1b2c3d4e5f6`)
- Tasks: `tk_` prefix, 12 chars
- Checkpoints: `cp_` prefix, 12 chars
- Workspaces: `ws_` prefix, 12 chars
- Repositories: `rp_` prefix, 12 chars
- Templates: `tmpl_` prefix, 12 chars
- Agents: `ag_` prefix, 12 chars
- Messages: `msg_` prefix, 12 chars
