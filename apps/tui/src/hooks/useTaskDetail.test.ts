import { describe, expect, test } from 'bun:test';
import type { TaskWithCheckpoints } from '@caw/core';
import { useTaskDetail } from './useTaskDetail';

describe('useTaskDetail', () => {
  test('module exports useTaskDetail function', () => {
    expect(typeof useTaskDetail).toBe('function');
  });

  test('TaskWithCheckpoints type shape is correct', () => {
    const data: TaskWithCheckpoints = {
      id: 'tk_123',
      workflow_id: 'wf_456',
      name: 'Test Task',
      description: 'Test description',
      status: 'in_progress',
      sequence: 1,
      repository_id: null,
      parallel_group: null,
      plan: null,
      plan_summary: null,
      outcome: null,
      outcome_detail: null,
      context: null,
      context_from: null,
      assigned_agent_id: null,
      claimed_at: null,
      workspace_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      checkpoints: [],
    };
    expect(data.id).toBe('tk_123');
    expect(data.checkpoints).toEqual([]);
  });

  test('TaskWithCheckpoints can have checkpoints array', () => {
    const data: TaskWithCheckpoints = {
      id: 'tk_123',
      workflow_id: 'wf_456',
      name: 'Test Task',
      description: 'Test description',
      status: 'completed',
      sequence: 1,
      repository_id: null,
      parallel_group: null,
      plan: null,
      plan_summary: null,
      outcome: 'Task completed successfully',
      outcome_detail: null,
      context: null,
      context_from: null,
      assigned_agent_id: null,
      claimed_at: null,
      workspace_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      checkpoints: [
        {
          id: 'cp_1',
          task_id: 'tk_123',
          sequence: 1,
          checkpoint_type: 'plan',
          summary: 'Initial plan',
          detail: null,
          files_changed: null,
          created_at: Date.now(),
        },
        {
          id: 'cp_2',
          task_id: 'tk_123',
          sequence: 2,
          checkpoint_type: 'complete',
          summary: 'Task done',
          detail: null,
          files_changed: null,
          created_at: Date.now(),
        },
      ],
    };
    expect(data.checkpoints).toHaveLength(2);
    expect(data.checkpoints[0].checkpoint_type).toBe('plan');
    expect(data.checkpoints[1].checkpoint_type).toBe('complete');
  });
});
