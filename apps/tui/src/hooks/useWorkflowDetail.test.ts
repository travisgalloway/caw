import { describe, expect, test } from 'bun:test';
import { useWorkflowDetail, type WorkflowDetailData } from './useWorkflowDetail';

describe('useWorkflowDetail', () => {
  test('module exports useWorkflowDetail function', () => {
    expect(typeof useWorkflowDetail).toBe('function');
  });

  test('WorkflowDetailData interface shape is correct', () => {
    const data: WorkflowDetailData = {
      workflow: {
        id: 'wf_123',
        name: 'Test',
        source_type: 'manual',
        source_ref: null,
        source_content: null,
        status: 'in_progress',
        initial_plan: null,
        plan_summary: null,
        max_parallel_tasks: 1,
        auto_create_workspaces: 0,
        config: null,
        locked_by_session_id: null,
        locked_at: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        tasks: [],
      },
      progress: null,
      workspaces: [],
    };
    expect(data.workflow.id).toBe('wf_123');
    expect(data.progress).toBeNull();
    expect(data.workspaces).toEqual([]);
  });
});
