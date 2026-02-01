# Context Loading Strategy

## Token Budget Allocation

Default budget: 8000 tokens

| Component        | Allocation | Contents                               |
| ---------------- | ---------- | -------------------------------------- |
| Workflow context | 15% (1200) | Source summary, plan summary           |
| Current task     | 55% (4400) | Full plan, context, recent checkpoints |
| Prior tasks      | 20% (1600) | Outcome summaries only                 |
| Sibling/deps     | 10% (800)  | Status and brief summaries             |

## Compression Strategies

1. **Source content**: Summarize to key requirements and acceptance criteria
2. **Plans**: Keep approach and steps, drop verbose explanations
3. **Checkpoints**: Most recent 5 in full, older ones summarized
4. **Prior tasks**: Outcome field only (not outcome_detail)
5. **File lists**: Truncate to first 10 with "and N more"

## On-Demand Loading

If context budget is exhausted, agent can request:

```typescript
// Load specific prior task in full
task_get({ id: "tk_xxx", include_checkpoints: true });

// Load specific checkpoint detail
checkpoint_list({ task_id: "tk_xxx", since_sequence: 5 });

// Load workflow plan in full
workflow_get({ id: "wf_xxx" });
```

## Token Estimation

Simple estimation for context budgeting:

```typescript
function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for English
  // More accurate would use tiktoken, but this is fast
  return Math.ceil(text.length / 4);
}

function estimateObjectTokens(obj: object): number {
  return estimateTokens(JSON.stringify(obj));
}
```

For more accuracy, consider using `js-tiktoken` for cl100k_base encoding.
