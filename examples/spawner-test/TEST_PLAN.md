# Spawner Manual Test Plan

Manual test scenarios for the `@caw/spawner` package, the `caw run` CLI command, and the 4 MCP spawner tools.

## Prerequisites

- `claude` CLI installed and authenticated (Max subscription, OAuth, or API key — any auth works)
- `bun install` run at the repo root
- Port 3100 available (or pass `--port <N>` to override)

## Setup

### First-time setup (once)

```bash
# Initialize the example project as a git repo so cleanup can reset files
cd examples/spawner-test/example-project
git init && git add -A && git commit -m "initial"
cd ../../..
```

### Before each test run

```bash
# Clean previous state
./examples/spawner-test/cleanup.sh

# Seed the DB with 3 test workflows
bun run examples/spawner-test/seed.ts

# Note the printed workflow IDs — you'll use them below:
#   Workflow A (Sequential): wf_...
#   Workflow B (Parallel):   wf_...
#   Workflow C (Single):     wf_...
```

---

## Test 0: Help Text

```bash
bunx @caw/tui run --help
```

**Verify:**
- Options listed (--prompt, --max-agents, --model, --max-turns, --max-budget, --detach, --port, etc.)
- No crash or stack trace
- Exit code 0

---

## Test 1: Smoke Test — Single Task Workflow

This is the minimum viable test. One task, one agent.

```bash
bunx @caw/tui run <wf_id_c> \
  --max-agents 1 \
  --model claude-sonnet-4-5 \
  --max-turns 10
```

**Verify:**
- `Starting workflow: Single Task (wf_...)` printed
- `[agent] Started: ag_... → task tk_...` logged
- Agent works (you'll see dots or progress as the claude process runs)
- `[agent] Completed: ag_... → task tk_...` logged
- `Progress: 1/1 tasks complete` printed
- `Workflow completed successfully.` printed
- Process exits 0

**Verify agent actually did work:**
```bash
# Check that the subtract function was added
cat examples/spawner-test/example-project/src/utils.ts
# Should contain: export function subtract(a: number, b: number): number
```

**DB check:**
```bash
DB=examples/spawner-test/example-project/.caw/workflows.db

sqlite3 "$DB" "SELECT id, status FROM workflows WHERE name = 'Single Task';"
# Expected: wf_...|completed

sqlite3 "$DB" "SELECT id, name, status FROM tasks WHERE workflow_id = '<wf_id_c>';"
# Expected: tk_...|Add subtract function|completed
```

---

## Test 2: Sequential Workflow (2 tasks, dependency chain)

```bash
bunx @caw/tui run <wf_id_a> --max-agents 1
```

**Verify:**
- First task ("Add multiply function") starts and completes
- Second task ("Use multiply in index") starts **only after** first completes
- Both tasks complete → workflow completes
- `Progress: 2/2 tasks complete` printed
- Process exits 0

**Verify file changes:**
```bash
cat examples/spawner-test/example-project/src/utils.ts
# Should contain: export function multiply(...)

cat examples/spawner-test/example-project/src/index.ts
# Should contain: import { multiply } or similar usage of multiply
```

---

## Test 3: Parallel Workflow (fan-out/fan-in pattern)

```bash
bunx @caw/tui run <wf_id_b> --max-agents 2
```

**Verify:**
- "Create types file" (setup) completes first
- Two `[agent] Started` messages appear for the parallel tasks ("Add formatPerson function" and "Add validatePerson function") — these run concurrently
- "Update index with Person example" starts **only after** both parallel tasks complete
- `Progress: 4/4 tasks complete` printed
- Workflow completes

**Verify concurrency:**
- You should see two `Started` messages close together for the parallel tasks
- Two `claude` child processes visible if you check with `ps aux | grep claude`

---

## Test 4: `--prompt` Flow (create + plan + execute)

This tests the full lifecycle: workflow creation, planner agent, and worker agent.

> **Note:** There is no `--cwd` CLI flag. The `cwd` is always `process.cwd()`, so you must `cd` into the example project first.

```bash
cd examples/spawner-test/example-project

bunx @caw/tui run \
  --prompt "Add a divide function to src/utils.ts that divides two numbers" \
  --max-agents 1 \
  --max-turns 15

cd ../../..
```

**Verify:**
- `Creating workflow from prompt...` printed
- `Created workflow: wf_...` printed
- `Spawning planner agent...` printed
- Dots printed as planner works (`.....`)
- `Planning complete.` printed
- `Starting workflow: ...` printed
- Worker agent(s) execute the planned tasks
- Process exits 0

**Verify result:**
```bash
cat examples/spawner-test/example-project/src/utils.ts
# Should contain a divide function
```

---

## Test 5: Suspend/Resume via MCP Tools

This test requires a running Claude Code session with the caw MCP server configured. Run it from *inside* a Claude Code conversation that has caw tools available.

### 5a. Start a workflow via MCP

First, seed and note the workflow ID:
```bash
./examples/spawner-test/cleanup.sh
bun run examples/spawner-test/seed.ts
```

In Claude Code, call:
```
workflow_start({
  workflow_id: "<wf_id_b>",
  max_agents: 1,
  cwd: "/absolute/path/to/examples/spawner-test/example-project"
})
```

**Verify:** Returns `{ success: true, agentHandles: [...] }`

### 5b. Check execution status

```
workflow_execution_status({ workflow_id: "<wf_id_b>" })
```

**Verify:** `status = "running"`, progress shows in-progress tasks

### 5c. Suspend mid-execution

Call quickly while agents are still working:
```
workflow_suspend({ workflow_id: "<wf_id_b>" })
```

**Verify:**
- Returns `{ success: true, agentsStopped: N, tasksReleased: N }`
- Workflow status transitions to `paused`
- `claude` child processes are killed (SIGTERM)

### 5d. Check status after suspend

```
workflow_execution_status({ workflow_id: "<wf_id_b>" })
```

**Verify:** `status = "idle"` (no active spawner), progress reflects paused state

### 5e. Resume

```
workflow_resume({ workflow_id: "<wf_id_b>" })
```

**Verify:**
- Returns `{ success: true, agentsSpawned: N, tasksAvailable: N }`
- New `claude` processes spawn and tasks continue to completion

---

## Test 6: Error Handling — Invalid Workflow ID

```bash
bunx @caw/tui run wf_nonexistent
```

**Verify:**
- `Error: Workflow not found: wf_nonexistent` printed
- Exit code 1

---

## Test 7: Error Handling — Missing Arguments

```bash
bunx @caw/tui run
```

**Verify:**
- Error message about needing a workflow ID or `--prompt`
- Usage hint printed
- Exit code 1

---

## Test 8: Detach Mode

```bash
bunx @caw/tui run <wf_id_c> --max-agents 1 --detach
```

**Verify:**
- `Running in background. Use workflow_execution_status to check progress.` printed
- Process exits immediately (code 0)
- Check DB after ~60 seconds — task should eventually complete:

```bash
sqlite3 examples/spawner-test/example-project/.caw/workflows.db \
  "SELECT id, status FROM tasks WHERE workflow_id = '<wf_id_c>';"
```

> **Note:** In detach mode, the daemon keeps running. Kill it with `./examples/spawner-test/cleanup.sh` when done.

---

## Test 9: Permission Mode — acceptEdits

Tests that agents get MCP tools without blanket file permissions:

```bash
bunx @caw/tui run <wf_id_c> \
  --max-agents 1 \
  --max-turns 15 \
  --permission-mode acceptEdits
```

**Verify:**
- Agent starts but will be prompted for file edits (not auto-approved)
- The `--allowedTools mcp__caw__*` flag is passed (MCP tools auto-allowed)
- Agent can call caw MCP tools (task_update_status, checkpoint_add, etc.)

> **Note:** In acceptEdits mode, file operations like Write/Edit will prompt the user in the spawned claude process. The agent may stall waiting for approval since there's no terminal to approve. This is expected — the test validates the flag is passed correctly. For actual headless use, `bypassPermissions` is the default.

---

## Test 10: Budget Cap

```bash
bunx @caw/tui run <wf_id_c> \
  --max-agents 1 \
  --max-budget 0.01
```

**Verify:**
- Agent starts but hits budget cap quickly
- `[agent] Failed` or `claude exited with code N` logged
- Workflow may stall or fail (expected with tiny budget)

---

## Test 11: DB Inspection After Tests

Run these queries after completing several tests:

```bash
DB=examples/spawner-test/example-project/.caw/workflows.db

# Workflow states
sqlite3 "$DB" "SELECT id, name, status FROM workflows;"

# Task states
sqlite3 "$DB" "SELECT id, name, status, assigned_agent_id FROM tasks ORDER BY workflow_id, sequence;"

# Agents created (confirms claude CLI spawning registered agents)
sqlite3 "$DB" "SELECT id, workflow_id, status FROM agents;"

# Recent checkpoints (agents should have created some)
sqlite3 "$DB" "SELECT task_id, type, summary FROM checkpoints ORDER BY created_at DESC LIMIT 10;"

# Spawner metadata stored in workflow config
sqlite3 "$DB" "SELECT id, json_extract(config, '$.spawner.spawner_id') as spawner_id FROM workflows WHERE config IS NOT NULL;"
```

**Verify:**
- All completed workflows show `status = 'completed'`
- All tasks in completed workflows show `status = 'completed'`
- Each task has an `assigned_agent_id` (proves agent registration worked)
- Checkpoint records exist (proves agents followed the protocol)
- Spawner metadata stored in workflow config column

---

## Cleanup

```bash
# Reset example project and DB
./examples/spawner-test/cleanup.sh

# Also remove global DB if used
./examples/spawner-test/cleanup.sh --global
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `claude: command not found` | Install Claude Code CLI: `npm i -g @anthropic-ai/claude-code` |
| "Port 3100 already in use" | Kill existing daemon or use `--port 3200` |
| Agent hangs / no progress | Check `--max-turns` isn't too low; increase to 30+ |
| "Workflow not found" | Re-run `seed.ts` — IDs change each run |
| Lock file stale | Run `cleanup.sh` to remove lock files and kill daemons |
| `claude` process zombies | `pkill -f "claude -p"` to kill lingering processes |
| Temp MCP config files left behind | Check `$TMPDIR/caw-mcp-*.json` — should auto-clean |

---

## Quick Checklist

| # | Test | Status |
|---|------|--------|
| 0 | Help text | [ ] |
| 1 | Single task smoke test | [ ] |
| 2 | Sequential (dependency chain) | [ ] |
| 3 | Parallel (fan-out/fan-in) | [ ] |
| 4 | --prompt flow (create+plan+execute) | [ ] |
| 5 | Suspend/resume via MCP tools | [ ] |
| 6 | Error: invalid workflow ID | [ ] |
| 7 | Error: missing arguments | [ ] |
| 8 | Detach mode | [ ] |
| 9 | Permission mode: acceptEdits | [ ] |
| 10 | Budget cap | [ ] |
| 11 | DB inspection | [ ] |
