# Error Handling

## Recoverable Errors

- Task execution failure: Mark task failed, allow replan
- Checkpoint write failure: Retry with exponential backoff
- Context load exceeds budget: Truncate with warning

## Unrecoverable Errors

- Database corruption: Log, notify user, suggest backup restore
- Schema migration failure: Halt, require manual intervention
- Invalid workflow state: Log, surface to user

## Error Response Format

```typescript
interface ToolError {
  code: string; // Machine-readable code
  message: string; // Human-readable message
  recoverable: boolean; // Can the operation be retried
  suggestion?: string; // What to do next
}
```

## Testing Strategy

### Unit Tests

- ID generation uniqueness
- Token estimation accuracy
- State machine transitions
- Dependency resolution

### Integration Tests

- Full workflow lifecycle
- Context loading with various configurations
- Concurrent task operations
- Migration sequences

### Test Database

- Use in-memory SQLite (`:memory:`) for fast tests
- Seed data helpers for common scenarios
