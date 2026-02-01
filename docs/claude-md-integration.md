# CLAUDE.md Integration

When the MCP server is first used in a repository, prompt the user:

```
Would you like to add caw instructions to your CLAUDE.md file?
This will help me understand how to use the workflow system effectively.
```

If yes, append this section:

```markdown
## caw

This project uses caw for durable task execution.

### Starting a Workflow

When given a complex task:

1. Use `workflow_create` with the task description
2. Use `workflow_set_plan` to break into tasks with dependencies
3. The workflow will persist across context clearing

### Working Tasks

1. Use `workflow_next_tasks` to get available tasks
2. Use `task_load_context` to get optimized context
3. Use `task_set_plan` before starting work
4. Add checkpoints with `checkpoint_add` for progress
5. Use `task_update_status` when complete

### Recovering Context

After context is cleared:

1. Use `workflow_list` to find active workflows
2. Use `task_load_context` for the current task
3. Resume from the last checkpoint

### Parallel Execution

For parallelizable tasks:

1. Create git worktrees for isolation
2. Use `worktree_register` to track
3. Work tasks in separate worktrees
4. Merge when complete
```
