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
│   └── mcp-server/                 # @caw/mcp-server
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts            # Entry point
│       │   ├── server.ts           # MCP server setup
│       │   ├── tools/
│       │   │   ├── index.ts
│       │   │   ├── workflow.tools.ts
│       │   │   ├── task.tools.ts
│       │   │   ├── checkpoint.tools.ts
│       │   │   ├── context.tools.ts
│       │   │   ├── orchestration.tools.ts
│       │   │   ├── workspace.tools.ts
│       │   │   ├── template.tools.ts
│       │   │   ├── agent.tools.ts
│       │   │   └── message.tools.ts
│       │   └── config.ts           # Server configuration
│       └── bin/
│           └── cli.ts              # npx entry point
│
├── apps/
│   └── tui/                        # @caw/tui
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
│           └── cli.ts              # npx workflow-tui
│
└── tooling/
    ├── tsconfig/                   # Shared TS configs
    │   ├── base.json
    │   └── library.json
    └── eslint/                     # Shared ESLint configs
        └── library.js
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

**@caw/mcp-server**

```json
{
  "name": "@caw/mcp-server",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "caw-mcp-server": "src/bin/cli.ts"
  },
  "dependencies": {
    "@caw/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

**@caw/tui**

```json
{
  "name": "@caw/tui",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "workflow-tui": "src/bin/cli.ts"
  },
  "dependencies": {
    "@caw/core": "workspace:*",
    "ink": "^5.0.0",
    "ink-spinner": "^5.0.0",
    "ink-table": "^3.1.0",
    "react": "^18.2.0",
    "zustand": "^4.5.0",
    "cli-boxes": "^3.0.0",
    "figures": "^6.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "typescript": "^5.4.0"
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
