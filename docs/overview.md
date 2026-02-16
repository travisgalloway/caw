# caw Design Overview

A durable execution system for coding agent workflows that persists tasks, plans, and outcomes across context clearing. Designed for Claude Code with extensibility to other agent runtimes (Codex, OpenCode, etc.).

## Overview

### Problem Statement

Coding agents frequently hit context limits or need to clear context mid-workflow. This creates several challenges:

- Loss of planning state and task progress
- No memory of completed work or decisions made
- Inability to resume failed tasks intelligently
- No coordination for parallel task execution

### Solution

A lightweight MCP server backed by SQLite that provides:

- Workflow and task persistence with durable execution guarantees
- Fine-grained checkpointing for recovery and replay
- Context-optimized loading with token budgets
- Dependency-aware task orchestration (DAG-based)
- Configurable parallelism with worktree isolation

### Architecture

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
┌─────────────────┐    REST + WebSocket   │  │     SQLite (bun:sqlite)│  │
│   Browser        │◄────────────────────►│  └────────────────────────┘  │
│   (web UI)      │    (--web-ui mode)    │                              │
└─────────────────┘                       └──────────────────────────────┘
```

`caw` is a single binary with three modes: TUI (default), MCP server (`--server`), and web UI (`--web-ui`). `@caw/mcp-server` is an embedded library, not a standalone server. The web UI mode starts a combined HTTP server with REST API, WebSocket, and MCP endpoints, serving a static SvelteKit dashboard.

### Design Principles

1. **Single-DB durability** - Inspired by DBOS, all state in one SQLite database
2. **Context efficiency** - Optimize information per token loaded
3. **Checkpoint-based recovery** - Fine-grained progress tracking enables resume from any point
4. **Explicit parallelism** - Configurable concurrency, conservative defaults (1 worker)
5. **Multi-agent native** - Agent registration, coordination, and messaging built-in
6. **Agent-agnostic** - MCP protocol works with any compliant runtime
7. **Industry-standard terminology** - Uses workflow/task/checkpoint vocabulary from Temporal, Airflow, DBOS

### Terminology

This design uses industry-standard durable workflow terminology:

| Term           | Definition                                                   | Analogues                       |
| -------------- | ------------------------------------------------------------ | ------------------------------- |
| **Workflow**   | A unit of work with a defined goal, containing ordered tasks | Temporal Workflow, Airflow DAG  |
| **Task**       | An atomic unit of work within a workflow                     | Temporal Activity, Airflow Task |
| **Checkpoint** | A recorded point-in-time state for recovery                  | Temporal Event, DBOS checkpoint |
| **Workspace**  | An isolated git worktree for parallel execution              | Git worktree                    |
| **Repository** | A git repository under workflow management                   | Standard                        |
| **Dispatch**   | Assign a task to be executed                                 | Standard scheduling term        |
| **Agent**      | A running instance that executes tasks                       | Temporal Worker, Celery Worker  |
| **Message**    | Inter-agent communication unit                               | Standard message queue          |
| **Inbox**      | Agent's message receive queue                                | Standard mailbox pattern        |

### Comparison with Gastown

This design shares goals with [Gastown](https://github.com/steveyegge/gastown) but differs in key ways:

| Aspect            | Gastown                   | This Design                                               |
| ----------------- | ------------------------- | --------------------------------------------------------- |
| **Parallelism**   | Aggressive (20-30 agents) | Configurable, default 1                                   |
| **Coordination**  | Mayor agent orchestrates  | MCP server manages state, agents coordinate via messaging |
| **State storage** | Git + SQLite + JSONL sync | Single SQLite database                                    |
| **Terminology**   | Mad Max themed            | Industry standard (workflow, task, checkpoint)            |
| **Recovery**      | GUPP (hook-based)         | Checkpoint-based with replan                              |
| **Messaging**     | Mailbox system            | Inbox pattern with threads and priorities                 |
| **UI**            | Web dashboard + tmux      | TUI (Ink-based) with optional web                         |
