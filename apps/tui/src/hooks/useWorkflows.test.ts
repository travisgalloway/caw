import { describe, expect, test } from 'bun:test';
import { useWorkflows, type WorkflowListItem } from './useWorkflows';

describe('useWorkflows', () => {
  test('module exports useWorkflows function', () => {
    expect(typeof useWorkflows).toBe('function');
  });

  test('WorkflowListItem extends WorkflowSummary with progress', () => {
    const item: WorkflowListItem = {
      id: 'wf_123',
      name: 'Test Workflow',
      status: 'in_progress',
      created_at: Date.now(),
      updated_at: Date.now(),
      progress: {
        total_tasks: 3,
        by_status: { completed: 1, in_progress: 1, pending: 1 },
        completed_sequence: 0,
        current_sequence: 1,
        blocked_tasks: [],
        parallel_groups: {},
        estimated_remaining: 2,
      },
    };
    expect(item.id).toBe('wf_123');
    expect(item.progress).not.toBeNull();
    expect(item.progress?.total_tasks).toBe(3);
  });

  test('WorkflowListItem supports null progress', () => {
    const item: WorkflowListItem = {
      id: 'wf_123',
      name: 'New Workflow',
      status: 'planning',
      created_at: Date.now(),
      updated_at: Date.now(),
      progress: null,
    };
    expect(item.progress).toBeNull();
  });
});
