# End-to-End Manual Test: caw Full Lifecycle

Test the complete caw flow: create a project, start the caw server, plan a workflow in Claude Code, execute with spawned agents, watch progress, and verify results.

## Architecture

```
Terminal 1: caw --server --transport http    Terminal 2: Claude Code
   │                                            │
   ├─ HTTP server :3100                          ├─ stdio MCP server (caw --server)
   │   (agents connect here)                    │   (you call MCP tools here)
   │                                            │
   └──────────── shared SQLite DB ──────────────┘
                 .caw/workflows.db
```

- caw HTTP server on port 3100 serves MCP tools to spawned worker agents
- Claude Code runs its own stdio MCP server process for interactive use
- Both share the same per-repo SQLite DB
- `workflow_start` connects agents to `http://localhost:3100/mcp`

## Prerequisites

- `claude` CLI installed and authenticated
- `bun` installed
- `bun install` run at the caw repo root
- Port 3100 available

---

## Step 1: Create a fresh test project

```bash
mkdir -p /tmp/caw-test/src

cat > /tmp/caw-test/src/utils.ts << 'EOF'
export function add(a: number, b: number): number {
  return a + b;
}

export function greet(name: string): string {
  return `Hello, ${name}!`;
}
EOF

cat > /tmp/caw-test/src/index.ts << 'EOF'
import { add, greet } from './utils';

console.log(greet('world'));
console.log(`2 + 3 = ${add(2, 3)}`);
EOF

cd /tmp/caw-test
git init && git add -A && git commit -m "initial"
```

## Step 2: Initialize caw and configure Claude Code

```bash
cd /tmp/caw-test

# Initialize caw config (creates .caw/config.json, updates .gitignore)
caw init --yes

# Configure Claude Code integration (writes .claude/settings.json + CLAUDE.md)
caw setup claude-code
```

This writes `.claude/settings.json`:
```json
{ "mcpServers": { "caw": { "command": "caw", "args": ["--server"] } } }
```

## Step 3: Start caw HTTP server (Terminal 1)

```bash
cd /tmp/caw-test
caw --server --transport http
```

This starts the combined HTTP server (MCP + REST API + WebSocket) on port 3100. Leave this running.

## Step 4: Launch Claude Code (Terminal 2)

```bash
cd /tmp/caw-test
claude
```

Claude Code picks up `.claude/settings.json` and connects to caw via MCP. Verify:
```
> Can you call workflow_list to confirm caw is connected?
```

## Step 5: Plan a workflow in Claude Code

In the Claude Code session, ask it to create and plan a workflow:

```
Create a caw workflow to add math utilities to this project. Use the caw MCP tools:

1. Call workflow_create with:
   - name: "Add math utilities"
   - source_type: "prompt"
   - source_content: "Add multiply, subtract, and divide functions to utils.ts, then update index.ts to demo all functions"

2. Call workflow_set_plan with the workflow ID and this plan:
   - summary: "Add three math functions then update the entry point"
   - tasks:
     a. "Add multiply function" - Add multiply(a, b) to src/utils.ts
     b. "Add subtract function" - Add subtract(a, b) to src/utils.ts, parallel_group: "math"
     c. "Add divide function" - Add divide(a, b) with zero-division check to src/utils.ts,
        parallel_group: "math", depends_on: ["Add multiply function"]
     d. "Update index" - Import and demo all functions in src/index.ts,
        depends_on: ["Add subtract function", "Add divide function"]

Note the workflow ID it returns (wf_...).
```

## Step 6: Start execution from Claude Code

```
Call workflow_start with:
  - workflow_id: "<the wf_ ID from step 5>"
  - max_agents: 2
  - cwd: "/tmp/caw-test"
```

This spawns `claude -p` worker agents that connect to the caw server on port 3100.

## Step 7: Watch progress

Monitor workflow progress via the desktop app or REST API:

- **Desktop app**: Open the desktop app — it connects to port 3100 automatically
- **REST API**: `curl http://localhost:3100/api/workflows` to list workflows
- **Execution status**: Use `workflow_execution_status` MCP tool from Claude Code

Tasks transition: `pending → planning → in_progress → completed`

## Step 8: (Optional) Check execution status from Claude Code

While agents are working, in Terminal 2:

```
Call workflow_execution_status with workflow_id: "<wf_ ID>"
```

Shows active agents, progress counts, and spawner state.

## Step 9: Verify final state

After the workflow completes:

```bash
# Check the files were modified
cat /tmp/caw-test/src/utils.ts
cat /tmp/caw-test/src/index.ts

# Run the code to verify
bun run /tmp/caw-test/src/index.ts

# Inspect the DB
DB=/tmp/caw-test/.caw/workflows.db

sqlite3 "$DB" "SELECT id, name, status FROM workflows;"
sqlite3 "$DB" "SELECT name, status, outcome FROM tasks ORDER BY sequence;"
sqlite3 "$DB" "SELECT id, workflow_id, status FROM agents;"
sqlite3 "$DB" "SELECT task_id, type, summary FROM checkpoints ORDER BY created_at DESC LIMIT 10;"
```

**Expected:**
- All tasks show `status = completed` with outcome summaries
- `src/utils.ts` has multiply, subtract, and divide functions
- `src/index.ts` imports and demos all functions
- Agents registered in DB
- Checkpoints recorded during execution

## Step 10: Cleanup

```bash
# Stop caw server (Ctrl+C in Terminal 1)
# Exit Claude Code (Ctrl+C in Terminal 2)

rm -rf /tmp/caw-test
pkill -f "claude -p" 2>/dev/null || true
pkill -f "caw.*--server" 2>/dev/null || true
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `claude: command not found` | `npm i -g @anthropic-ai/claude-code` |
| "Port 3100 already in use" | `pkill -f "caw.*--server"` or use `--port 3200` |
| Claude Code doesn't see caw tools | Check `.claude/settings.json` exists, restart Claude Code |
| Agent hangs / no progress | Increase `--max-turns` (default 50 should be fine) |
| `workflow_start` fails "not found" | Verify workflow ID; call `workflow_list` to check |
| Agents can't connect to MCP | Ensure caw HTTP server is running (port 3100) |
