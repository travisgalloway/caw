# State Machines

## Workflow State Machine

```
                         ┌─────────────┐
                         │   abandon   │
                         └──────┬──────┘
                                │
     ┌──────────────────────────┼──────────────────────────┐
     │                          │                          │
     ▼                          ▼                          ▼
┌──────────┐    ┌─────────┐    ┌─────────────┐    ┌───────────┐
│ planning │───►│  ready  │───►│ in_progress │───►│ completed │
└──────────┘    └─────────┘    └──────┬──────┘    └───────────┘
                    │                 │
                    │                 ▼
                    │          ┌──────────┐
                    └─────────►│  paused  │
                               └──────────┘
                                     │
                                     ▼
                               ┌──────────┐
                               │  failed  │
                               └──────────┘
```

## Task State Machine

```
┌─────────┐
│ pending │◄─────────────────────────────────────┐
└────┬────┘                                      │
     │                                           │
     ▼                                           │
┌─────────┐    ┌──────────┐    ┌───────────┐    │
│ blocked │───►│ planning │───►│in_progress│    │
└─────────┘    └────┬─────┘    └─────┬─────┘    │
     ▲              │                │          │
     │              │                ▼          │
     │              │         ┌───────────┐     │
     │              └────────►│ completed │     │
     │                        └───────────┘     │
     │                               │          │
     │                               ▼          │
     │                        ┌──────────┐      │
     └────────────────────────│  failed  │──────┘
           (replan)           └──────────┘
                                   │
                                   ▼
                              ┌─────────┐
                              │ skipped │
                              └─────────┘
```

## Blocked State Computation

`blocked` status is computed, not stored. A task is blocked when:

```typescript
function isBlocked(task: Task, allTasks: Task[]): boolean {
  const dependencies = getDependencies(task.id);
  return dependencies.some((dep) => {
    const depTask = allTasks.find((t) => t.id === dep.depends_on_id);
    return (
      depTask && depTask.status !== "completed" && depTask.status !== "skipped"
    );
  });
}
```
