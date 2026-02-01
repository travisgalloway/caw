# Implementation Priorities

## Phase 1: Core Foundation

1. Project scaffolding (turbo, pnpm workspace)
2. Database setup with migrations
3. Basic CRUD operations for all entities
4. ID generation utilities (nanoid)
5. Type definitions

## Phase 2: MCP Server (Single Agent)

1. Server setup with MCP SDK
2. Workflow lifecycle tools
3. Task management tools
4. Basic context loading
5. Checkpoint recording

## Phase 3: Smart Features

1. Token-aware context loading with budget allocation
2. Dependency resolution (DAG traversal)
3. Orchestration queries (next tasks, progress)
4. Workspace management (worktree tracking)

## Phase 4: Multi-Agent Support

1. Agent registration and heartbeat
2. Task claiming with atomic operations
3. Inter-agent messaging (inbox pattern)
4. Agent status management
5. Broadcast messaging

## Phase 5: TUI Application

1. Basic Ink setup with navigation
2. Dashboard layout (workflows, agents, tasks, messages)
3. Real-time polling and updates
4. Keybinding system
5. Detail views (workflow, agent, task)

## Phase 6: Templates & Polish

1. Workflow templates (create, apply)
2. CLAUDE.md integration prompting
3. Error handling and recovery
4. Comprehensive tests
5. Documentation
