# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is caw?

A durable execution system for coding agent workflows. It persists tasks, plans, and outcomes across context clearing via an MCP server backed by SQLite. Designed for Claude Code with extensibility to other agent runtimes (Codex, OpenCode, etc.).

## Build & Test Commands

```bash
# Full monorepo build (respects dependency order via Turbo)
pnpm build

# Build a single package
pnpm --filter @caw/core build

# Run all tests (requires build first — Turbo handles this)
pnpm test

# Run tests for a single package
pnpm --filter @caw/core test

# Run a single test file
pnpm --filter @caw/core exec vitest run src/utils/id.test.ts

# Watch mode for tests
pnpm --filter @caw/core test:watch

# Watch mode for TypeScript compilation
pnpm --filter @caw/core dev

# Lint all packages (via Turbo)
pnpm lint

# Lint a single package
pnpm --filter @caw/core lint

# Auto-fix lint + formatting issues across the repo
pnpm format

# Clean all build artifacts
pnpm clean
```

## Linting & Formatting

**Biome** handles both linting and formatting. Config lives in `biome.json` (root).

- `pnpm lint` — check all packages (read-only, used in CI)
- `pnpm format` — auto-fix lint and formatting issues (`biome check --write .`)
- Pre-commit hook (Husky + lint-staged) auto-fixes staged `*.{ts,tsx}` files on commit

## Monorepo Structure

Four workspace packages managed by pnpm + Turbo:

- **`packages/core`** (`@caw/core`) — Database layer, types, services, utilities. All other packages depend on this.
- **`packages/mcp-server`** (`@caw/mcp-server`) — MCP protocol server exposing workflow tools. Depends on core.
- **`apps/orchestrator`** (`@caw/orchestrator`) — CLI orchestrator driving workflow execution via Anthropic SDK. Depends on core.
- **`apps/tui`** (`@caw/tui`) — Terminal UI built with Ink (React) + Zustand. Depends on core.
- **`tooling/tsconfig`** (`@caw/tsconfig`) — Shared TypeScript configs (`base.json` and `library.json`).

## TypeScript Conventions

- **Module system**: ESM (`"type": "module"`) with bundler module resolution
- **Build tool**: `tsup` (esbuild-based) for JS output + declaration files; `tsc --noEmit` for type checking only
- **Relative imports use extensionless paths** (`'./foo'`, not `'./foo.js'`) — tsup resolves them at build time
- **Target**: ES2022, strict mode enabled
- **Status/enum types**: Use string literal unions, not TypeScript enums
- **Timestamps**: All stored as `number` (Unix milliseconds)
- **JSON fields**: Typed as `string | null` (serialized JSON stored in SQLite TEXT columns)
- **SQLite booleans**: Typed as `number` (0/1) to match better-sqlite3's integer representation
- **Test files**: Co-located with source (`src/**/*.test.ts`), run by vitest

## Core Package Architecture

### Database Layer (`src/db/`)
- **`connection.ts`** — `createConnection(dbPath)` creates a SQLite connection with WAL mode, foreign keys, and 5s busy timeout. `getDbPath(mode, repoPath?)` resolves to `~/.caw/workflows.db` (global) or `{repoPath}/.caw/workflows.db` (per-repo).
- **`migrations/`** — Numbered migration files export SQL as string constants (no filesystem reads). `runMigrations(db)` applies unapplied migrations in transactions. `schema_migrations` table is managed by the runner, not included in migration SQL.

### ID Generation (`src/utils/id.ts`)
Nanoid with charset `[0-9a-z]`, 12 chars. Each entity type has a prefix helper: `wf_`, `tk_`, `cp_`, `ws_`, `rp_`, `tmpl_`, `ag_`, `msg_`.

### Types (`src/types/`)
One file per entity, matching the SQLite schema exactly. Barrel-exported through `src/types/index.ts` using `export type`.

### Database Schema
9 application tables: `repositories`, `workflows`, `tasks`, `task_dependencies`, `checkpoints`, `workspaces`, `workflow_templates`, `agents`, `messages`. Full schema defined in `docs/schema.md`.

## Key Dependencies

- **better-sqlite3** — Synchronous SQLite driver (CJS module, works via `esModuleInterop` default import)
- **nanoid** — ESM-native ID generation
- **@modelcontextprotocol/sdk** — MCP protocol implementation (mcp-server package)
- **@anthropic-ai/sdk** — Claude API client (orchestrator package)
- **ink + react** — Terminal UI framework (tui package)

## Design Documentation

Detailed design docs live in `docs/`. Key references:
- `docs/schema.md` — Full SQLite schema with all tables, indexes, and status enums
- `docs/state-machines.md` — Workflow and task state machine definitions
- `docs/mcp-tools.md` — MCP tool interface specifications
- `docs/context-loading.md` — Token budget allocation and compression strategies
- `docs/data-model.md` — Entity relationships, multi-agent model, global vs per-repo modes
