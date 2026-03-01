# Self-Development with caw

Use `caw work` to have caw develop features for itself (or any project). It fetches GitHub issues, plans the implementation, executes tasks via spawned agents, and creates PRs for review.

## Quick Start

```bash
caw work #115                          # single issue
caw work #115 #120 --max-agents 2      # multiple issues in parallel
caw work #115 --branch feat/mark-read  # custom branch
caw work 115 --model claude-opus-4-5   # use a specific model
```

## How It Works

1. **Fetches GitHub issue(s)** via `gh issue view`
2. **Creates a git branch** (default: `caw/issue-<n>`)
3. **Plans implementation** — spawns a planner agent that analyzes the issue(s) and codebase, then creates a structured task plan
4. **Executes tasks** — spawns worker agents that implement each task
5. **Creates PR(s)** — the final task creates a pull request linking to the issue(s)

## Workflow Lifecycle

```
planning → ready → in_progress → completed
  tasks: pending → planning → in_progress → completed
  final task: create PR via `gh pr create`
```

## Agent Q&A

If an agent needs human input, it pauses the task and sends a message.

- **Check messages**: Visit the Messages tab in the desktop app, or use `message_list` / `message_count_unread` MCP tools
- **Reply**: Use the desktop app or `message_send` MCP tool
- The spawner automatically detects the response and resumes the paused task with a new agent that has full context (including your answer)

## CLI Options

```
caw work <issues...> [options]

Arguments:
  <issues...>               Issue refs: #123, 123, or full GitHub URL

Options:
  --branch <name>           Git branch name (default: caw/issue-<n>)
  --max-agents <n>          Override max parallel agents
  --model <name>            Claude model (default: claude-sonnet-4-5)
  --permission-mode <mode>  bypassPermissions (uses --dangerously-skip-permissions) | acceptEdits (uses --allowedTools mcp__caw__*)
  --max-turns <n>           Max turns per task (default: 50)
  --max-budget <usd>        Max budget per task in USD
  --detach                  Start and run in background
  --port <number>           Daemon port (default: 3100)
  --db <path>               Database file path
```

## Tips

- Use `--max-agents 1` for sequential work, higher for parallel tasks
- Agents have full git/gh access — they commit, push, and create PRs
- Check progress: desktop app, REST API (`caw --server --transport http`), or DB queries
- If a task fails, the spawner retries up to 3 times before marking it failed
- The planner decides PR scoping: one PR per issue typically, but it may split epics into multiple PRs
- Issue references accept `#123`, `123`, or full GitHub URLs (`https://github.com/owner/repo/issues/123`)
