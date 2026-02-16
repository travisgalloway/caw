# Project Structure

```
caw/
├── package.json
├── turbo.json
├── bun.lock
├── .gitignore
├── README.md
├── CLAUDE.md                       # Instructions for using this tool
│
├── packages/
│   ├── core/                       # @caw/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── db/
│   │   │   │   ├── index.ts
│   │   │   │   ├── connection.ts   # SQLite connection management
│   │   │   │   ├── migrations/
│   │   │   │   │   ├── index.ts    # Migration runner
│   │   │   │   │   ├── 001_initial.sql
│   │   │   │   │   └── ...
│   │   │   │   └── queries/        # Prepared query helpers
│   │   │   │       ├── workflows.ts
│   │   │   │       ├── tasks.ts
│   │   │   │       ├── checkpoints.ts
│   │   │   │       ├── workspaces.ts
│   │   │   │       ├── templates.ts
│   │   │   │       ├── agents.ts
│   │   │   │       └── messages.ts
│   │   │   ├── services/
│   │   │   │   ├── workflow.service.ts
│   │   │   │   ├── task.service.ts
│   │   │   │   ├── checkpoint.service.ts
│   │   │   │   ├── context.service.ts     # Context loading logic
│   │   │   │   ├── orchestration.service.ts
│   │   │   │   ├── workspace.service.ts
│   │   │   │   ├── template.service.ts
│   │   │   │   ├── agent.service.ts       # Agent registration & heartbeat
│   │   │   │   └── message.service.ts     # Inter-agent messaging
│   │   │   ├── utils/
│   │   │   │   ├── id.ts           # nanoid generation
│   │   │   │   ├── tokens.ts       # Token estimation
│   │   │   │   └── compress.ts     # Summary compression
│   │   │   └── types/
│   │   │       ├── index.ts
│   │   │       ├── workflow.ts
│   │   │       ├── task.ts
│   │   │       ├── checkpoint.ts
│   │   │       ├── workspace.ts
│   │   │       ├── agent.ts
│   │   │       └── message.ts
│   │   └── tests/
│   │       ├── workflow.test.ts
│   │       ├── task.test.ts
│   │       ├── orchestration.test.ts
│   │       ├── context.test.ts
│   │       ├── agent.test.ts
│   │       └── message.test.ts
│   │
│   ├── mcp-server/                 # @caw/mcp-server (library)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Library exports
│   │       ├── config.ts           # Server configuration
│   │       ├── server.ts           # MCP server factory + transport
│   │       ├── bin/
│   │       │   └── cli.ts          # Dev-only entry (bun run)
│   │       └── tools/
│   │           ├── index.ts        # registerAllTools aggregator
│   │           ├── types.ts        # ToolRegistrar, defineTool, result helpers
│   │           ├── workflow.ts
│   │           ├── task.ts
│   │           ├── checkpoint.ts
│   │           ├── context.ts
│   │           ├── orchestration.ts
│   │           ├── workspace.ts
│   │           ├── repository.ts
│   │           ├── template.ts
│   │           ├── agent.ts
│   │           ├── messaging.ts
│   │           ├── replanning.ts
│   │           ├── spawner.ts
│   │           └── lock-guard.ts
│   │
│   ├── spawner/                    # @caw/spawner
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts
│   │       ├── agent-session.ts
│   │       ├── pool.ts
│   │       ├── spawner.service.ts
│   │       ├── registry.ts
│   │       ├── mcp-config.ts
│   │       └── prompt.ts
│   │
│   └── rest-api/                   # @caw/rest-api
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── api.ts             # createRestApi factory
│           ├── router.ts          # Path-to-regex based router
│           ├── response.ts        # JSON response helpers
│           ├── middleware.ts       # CORS middleware
│           ├── routes/
│           │   ├── workflows.ts
│           │   ├── tasks.ts
│           │   ├── orchestration.ts
│           │   ├── agents.ts
│           │   ├── messages.ts
│           │   ├── workspaces.ts
│           │   ├── templates.ts
│           │   ├── locks.ts
│           │   └── checkpoints.ts
│           └── ws/
│               ├── broadcaster.ts # EventEmitter-based broadcaster
│               └── handler.ts     # WebSocket upgrade handler
│
├── apps/
│   ├── tui/                        # @caw/tui
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts            # Entry point
│       │   ├── app.tsx             # Main Ink app component
│       │   ├── components/
│       │   │   ├── Dashboard.tsx   # Main dashboard layout
│       │   │   ├── WorkflowList.tsx
│       │   │   ├── WorkflowDetail.tsx
│       │   │   ├── TaskTree.tsx    # DAG visualization
│       │   │   ├── AgentList.tsx
│       │   │   ├── AgentDetail.tsx
│       │   │   ├── MessageInbox.tsx
│       │   │   ├── ProgressBar.tsx
│       │   │   ├── StatusIndicator.tsx
│       │   │   └── common/
│       │   │       ├── Box.tsx
│       │   │       ├── Table.tsx
│       │   │       └── Spinner.tsx
│       │   ├── hooks/
│       │   │   ├── useWorkflows.ts
│       │   │   ├── useAgents.ts
│       │   │   ├── useMessages.ts
│       │   │   └── usePolling.ts   # Real-time updates
│       │   ├── store/
│       │   │   └── index.ts        # Zustand store
│       │   └── utils/
│       │       ├── format.ts       # Display formatting
│       │       └── keybindings.ts
│       └── bin/
│           └── cli.ts              # caw binary entry point
│
│   └── web-ui/                     # @caw/web-ui
│       ├── package.json
│       ├── svelte.config.js
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── src/
│           ├── app.html
│           ├── app.css            # Tailwind CSS v4 + theme
│           ├── lib/
│           │   ├── api/
│           │   │   └── client.ts  # Typed REST API client
│           │   ├── stores/
│           │   │   └── ws.ts      # WebSocket store with auto-reconnect
│           │   └── components/
│           │       ├── StatusBadge.svelte
│           │       ├── ProgressBar.svelte
│           │       └── RelativeTime.svelte
│           └── routes/
│               ├── +layout.svelte
│               ├── +page.svelte           # Workflow list
│               ├── workflows/[id]/
│               │   └── +page.svelte       # Workflow detail
│               ├── agents/[id]/
│               │   └── +page.svelte       # Agent detail
│               ├── messages/
│               │   └── +page.svelte       # Message inbox
│               ├── setup/
│               │   └── +page.svelte       # Setup guide
│               └── help/
│                   └── +page.svelte       # Help page
│
└── tooling/
    └── tsconfig/                   # Shared TS configs
        ├── base.json
        └── library.json
```

## Package Dependencies

**@caw/core**

```json
{
  "name": "@caw/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

**@caw/mcp-server** (library — no standalone binary, imported by the unified `caw` app)

```json
{
  "name": "@caw/mcp-server",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@caw/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.25.3",
    "zod": "^3.25"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

**@caw/spawner**

```json
{
  "name": "@caw/spawner",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@caw/core": "workspace:*"
  }
}
```

**@caw/rest-api**

```json
{
  "name": "@caw/rest-api",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@caw/core": "workspace:*"
  }
}
```

**@caw/tui** (unified `caw` binary — TUI, MCP server, or web UI)

```json
{
  "name": "@caw/tui",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "caw": "src/bin/cli.ts"
  },
  "dependencies": {
    "@caw/core": "workspace:*",
    "@caw/mcp-server": "workspace:*",
    "@caw/rest-api": "workspace:*",
    "@caw/spawner": "workspace:*",
    "ink": "^6.6.0",
    "ink-scroll-view": "^0.3.5",
    "ink-tab": "^5.1.0",
    "react": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.4.0"
  }
}
```

**@caw/web-ui** (SvelteKit web dashboard — builds to static files)

```json
{
  "name": "@caw/web-ui",
  "version": "0.1.0",
  "type": "module",
  "devDependencies": {
    "@sveltejs/adapter-static": "^3.0.0",
    "@sveltejs/kit": "^2.16.0",
    "svelte": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "bits-ui": "^1.0.0",
    "lucide-svelte": "^0.469.0"
  }
}
```

## Turbo Configuration

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {}
  }
}
```
