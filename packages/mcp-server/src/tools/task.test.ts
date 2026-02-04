import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, taskService, workflowService } from '@caw/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../server';
import type { ToolErrorInfo } from './types';

type ToolHandler = (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>;

function getToolHandler(server: unknown, name: string): ToolHandler {
  // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
  const tools = (server as any)._registeredTools as Record<string, { handler: ToolHandler }>;
  return tools[name].handler;
}

function parseContent(result: CallToolResult): unknown {
  const text = result.content[0];
  if (text.type !== 'text') throw new Error('Expected text content');
  return JSON.parse(text.text);
}

function parseError(result: CallToolResult): ToolErrorInfo {
  expect(result.isError).toBe(true);
  return parseContent(result) as ToolErrorInfo;
}

describe('task tools', () => {
  let db: DatabaseType;
  let call: (name: string, args: Record<string, unknown>) => CallToolResult;

  function createWorkflowWithTask(): { workflowId: string; taskId: string } {
    const wf = workflowService.create(db, {
      name: 'Test WF',
      source_type: 'prompt',
      source_content: 'test',
    });
    workflowService.setPlan(db, wf.id, {
      summary: 'plan',
      tasks: [{ name: 'Task 1' }],
    });
    const full = workflowService.get(db, wf.id, { includeTasks: true }) as NonNullable<
      ReturnType<typeof workflowService.get>
    >;
    return { workflowId: wf.id, taskId: full.tasks[0].id };
  }

  function createWorkflowWithDeps(): { workflowId: string; taskIds: string[] } {
    const wf = workflowService.create(db, {
      name: 'Deps WF',
      source_type: 'prompt',
      source_content: 'test',
    });
    workflowService.setPlan(db, wf.id, {
      summary: 'plan',
      tasks: [{ name: 'First' }, { name: 'Second', depends_on: ['First'] }],
    });
    const full = workflowService.get(db, wf.id, { includeTasks: true }) as NonNullable<
      ReturnType<typeof workflowService.get>
    >;
    return { workflowId: wf.id, taskIds: full.tasks.map((t) => t.id) };
  }

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);
    call = (name, args) => {
      const handler = getToolHandler(server, name);
      return handler(args) as CallToolResult;
    };
  });

  // --- task_get ---

  describe('task_get', () => {
    it('returns task details', () => {
      const { taskId } = createWorkflowWithTask();
      const result = call('task_get', { id: taskId });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string; name: string; status: string };
      expect(data.id).toBe(taskId);
      expect(data.name).toBe('Task 1');
      expect(data.status).toBe('pending');
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const result = call('task_get', { id: 'tk_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
      expect(err.recoverable).toBe(false);
      expect(err.suggestion).toContain('Check the task ID');
    });
  });

  // --- task_set_plan ---

  describe('task_set_plan', () => {
    it('sets plan for a planning-status task', () => {
      const { taskId } = createWorkflowWithTask();
      // Move to planning
      taskService.updateStatus(db, taskId, 'planning');

      const result = call('task_set_plan', {
        id: taskId,
        plan: {
          approach: 'Test approach',
          steps: ['Step 1', 'Step 2'],
        },
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const result = call('task_set_plan', {
        id: 'tk_nonexistent',
        plan: { approach: 'test', steps: ['step'] },
      });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
    });

    it('returns INVALID_STATE when task is not in planning status', () => {
      const { taskId } = createWorkflowWithTask();
      // Task is in 'pending' status, not 'planning'
      const result = call('task_set_plan', {
        id: taskId,
        plan: { approach: 'test', steps: ['step'] },
      });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_STATE');
      expect(err.recoverable).toBe(false);
    });
  });

  // --- task_update_status ---

  describe('task_update_status', () => {
    it('updates status with valid transition', () => {
      const { taskId } = createWorkflowWithTask();
      // pending → planning
      const result = call('task_update_status', { id: taskId, status: 'planning' });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const result = call('task_update_status', {
        id: 'tk_nonexistent',
        status: 'planning',
      });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
    });

    it('returns INVALID_TRANSITION for invalid status change', () => {
      const { taskId } = createWorkflowWithTask();
      // pending → in_progress is not valid
      const result = call('task_update_status', { id: taskId, status: 'in_progress' });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_TRANSITION');
      expect(err.recoverable).toBe(false);
      expect(err.suggestion).toContain('state machine');
    });

    it('returns MISSING_OUTCOME when completing without outcome', () => {
      const { taskId } = createWorkflowWithTask();
      // pending → planning → in_progress → completed (no outcome)
      taskService.updateStatus(db, taskId, 'planning');
      taskService.updateStatus(db, taskId, 'in_progress');

      const result = call('task_update_status', { id: taskId, status: 'completed' });
      const err = parseError(result);
      expect(err.code).toBe('MISSING_OUTCOME');
      expect(err.recoverable).toBe(true);
    });

    it('returns MISSING_ERROR when failing without error', () => {
      const { taskId } = createWorkflowWithTask();
      taskService.updateStatus(db, taskId, 'planning');
      taskService.updateStatus(db, taskId, 'in_progress');

      const result = call('task_update_status', { id: taskId, status: 'failed' });
      const err = parseError(result);
      expect(err.code).toBe('MISSING_ERROR');
      expect(err.recoverable).toBe(true);
    });

    it('returns TASK_BLOCKED when dependency is incomplete', () => {
      const { taskIds } = createWorkflowWithDeps();
      // Second task depends on First — transitioning to planning should fail
      const result = call('task_update_status', { id: taskIds[1], status: 'planning' });
      const err = parseError(result);
      expect(err.code).toBe('TASK_BLOCKED');
      expect(err.recoverable).toBe(true);
    });

    it('successfully completes with outcome', () => {
      const { taskId } = createWorkflowWithTask();
      taskService.updateStatus(db, taskId, 'planning');
      taskService.updateStatus(db, taskId, 'in_progress');

      const result = call('task_update_status', {
        id: taskId,
        status: 'completed',
        outcome: 'All done',
      });
      expect(result.isError).toBeUndefined();
    });
  });

  // --- task_replan ---

  describe('task_replan', () => {
    it('replans a failed task', () => {
      const { taskId } = createWorkflowWithTask();
      taskService.updateStatus(db, taskId, 'planning');
      taskService.updateStatus(db, taskId, 'in_progress');
      taskService.updateStatus(db, taskId, 'failed', { error: 'Something broke' });

      const result = call('task_replan', {
        id: taskId,
        reason: 'Try different approach',
        new_plan: { approach: 'New approach', steps: ['New step'] },
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean; checkpoint_id: string };
      expect(data.success).toBe(true);
      expect(data.checkpoint_id).toMatch(/^cp_/);
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const result = call('task_replan', {
        id: 'tk_nonexistent',
        reason: 'test',
        new_plan: { approach: 'test', steps: ['step'] },
      });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
    });

    it('returns INVALID_STATE when task is not failed or in_progress', () => {
      const { taskId } = createWorkflowWithTask();
      // Task is 'pending', cannot replan
      const result = call('task_replan', {
        id: taskId,
        reason: 'test',
        new_plan: { approach: 'test', steps: ['step'] },
      });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_STATE');
      expect(err.recoverable).toBe(false);
    });
  });

  // --- structured error format ---

  describe('structured error format', () => {
    it('includes all required fields in error responses', () => {
      const result = call('task_get', { id: 'tk_missing' });
      expect(result.isError).toBe(true);

      const err = parseContent(result) as ToolErrorInfo;
      expect(err).toHaveProperty('code');
      expect(err).toHaveProperty('message');
      expect(err).toHaveProperty('recoverable');
      expect(err).toHaveProperty('suggestion');
      expect(typeof err.code).toBe('string');
      expect(typeof err.message).toBe('string');
      expect(typeof err.recoverable).toBe('boolean');
      expect(typeof err.suggestion).toBe('string');
    });
  });
});
