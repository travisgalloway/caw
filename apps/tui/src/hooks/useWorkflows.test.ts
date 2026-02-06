import { describe, expect, test } from 'bun:test';
import { useWorkflows, type WorkflowListItem } from './useWorkflows';

describe('useWorkflows', () => {
  test('module exports useWorkflows function', () => {
    expect(typeof useWorkflows).toBe('function');
  });

  test('WorkflowListItem extends WorkflowSummary with progress and lock', () => {
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
      lock: null,
    };
    expect(item.id).toBe('wf_123');
    expect(item.progress).not.toBeNull();
    expect(item.progress?.total_tasks).toBe(3);
    expect(item.lock).toBeNull();
  });

  test('WorkflowListItem supports null progress and lock info', () => {
    const item: WorkflowListItem = {
      id: 'wf_123',
      name: 'New Workflow',
      status: 'planning',
      created_at: Date.now(),
      updated_at: Date.now(),
      progress: null,
      lock: null,
    };
    expect(item.progress).toBeNull();
    expect(item.lock).toBeNull();
  });

  test('WorkflowListItem supports lock info', () => {
    const item: WorkflowListItem = {
      id: 'wf_123',
      name: 'Locked Workflow',
      status: 'in_progress',
      created_at: Date.now(),
      updated_at: Date.now(),
      progress: null,
      lock: {
        locked: true,
        session_id: 'ss_abc123',
        locked_at: Date.now(),
        session_pid: 5678,
      },
    };
    expect(item.lock?.locked).toBe(true);
    expect(item.lock?.session_pid).toBe(5678);
  });
});
