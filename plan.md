# Resume Plan: Complete Phase 1 + Phase 2 Spawner Testing

## Current State

The working tree has uncommitted changes from the previous session:

1. **Issue #115 implementation** (TUI bulk mark-read):
   - `apps/tui/src/utils/parseCommand.ts` — added `mark-read` slash command
   - `apps/tui/src/hooks/useCommandHandler.ts` — implemented mark-read handler (marks all unread messages as read)
   - `apps/tui/src/components/MessageDetailScreen.tsx` — switched from `listAll().find()` to `messageService.get(db, messageId, true)` for auto-mark-as-read on detail view

2. **Spawner prompt improvements**:
   - `packages/spawner/src/agent-session.ts` — improved `-p` prompt to explicitly tell agent to call `task_load_context` first; added exit diagnostics logging
   - `packages/spawner/src/prompt.ts` — rewritten system prompt with numbered MANDATORY steps, clearer formatting, CRITICAL warning about calling `task_update_status`

3. **Untracked files**:
   - `.claude/settings.json` — MCP server config (should stay local, already gitignored)
   - `scripts/update-task.ts` — one-off script used to manually update task state (can delete)

Build passes. All 1071 tests pass. Lint not yet checked.

## Plan

### Step 1: Verify and commit the existing changes
- Run `bun run lint` to check for lint issues; fix if needed
- Delete the one-off `scripts/update-task.ts`
- Commit the #115 implementation + spawner improvements as two separate commits:
  - Commit 1: spawner prompt improvements (agent-session.ts + prompt.ts)
  - Commit 2: issue #115 TUI mark-read feature (parseCommand.ts + useCommandHandler.ts + MessageDetailScreen.tsx)

### Step 2: Close issue #115
- Close the GitHub issue via `gh issue close 115`

### Step 3: Run Phase 2 — multi-task workflow (#113 + #114)
- Use `caw run --prompt` to create a workflow for issues #113 (checkpoint timeline) and #114 (dependency display in task detail)
- Observe the spawner creating multiple tasks with dependencies
- Monitor agent execution and verify task completion
- If spawner issues arise, debug and fix

### Step 4: Verify Phase 2 results
- Check that the spawner-generated code builds, passes tests, and passes lint
- Review the changes for correctness
- Commit and close issues #113 and #114
