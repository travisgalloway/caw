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

describe('orchestration tools', () => {
  let db: DatabaseType;
  let call: (name: string, args: Record<string, unknown>) => CallToolResult;

  function createWorkflowWithTasks(): { workflowId: string; taskIds: string[] } {
    const wf = workflowService.create(db, {
      name: 'Test WF',
      source_type: 'prompt',
      source_content: 'test',
    });
    workflowService.setPlan(db, wf.id, {
      summary: 'plan',
      tasks: [
        { name: 'First' },
        { name: 'Second', depends_on: ['First'] },
        { name: 'Third', depends_on: ['Second'] },
      ],
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

  // --- workflow_next_tasks ---

  describe('workflow_next_tasks', () => {
    it('returns unblocked tasks', () => {
      const { workflowId } = createWorkflowWithTasks();
      const result = call('workflow_next_tasks', { workflow_id: workflowId });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { tasks: { name: string }[] };
      // Only First should be unblocked
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0].name).toBe('First');
    });

    it('includes failed tasks when include_failed is true', () => {
      const { workflowId, taskIds } = createWorkflowWithTasks();
      // Move first task to failed
      taskService.updateStatus(db, taskIds[0], 'planning');
      taskService.updateStatus(db, taskIds[0], 'in_progress');
      taskService.updateStatus(db, taskIds[0], 'failed', { error: 'broke' });

      const result = call('workflow_next_tasks', {
        workflow_id: workflowId,
        include_failed: true,
      });
      const data = parseContent(result) as { tasks: { name: string }[] };
      expect(data.tasks.some((t) => t.name === 'First')).toBe(true);
    });

    it('returns all_complete when all tasks are done', () => {
      const wf = workflowService.create(db, {
        name: 'Simple WF',
        source_type: 'prompt',
        source_content: 'test',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'plan',
        tasks: [{ name: 'Only task' }],
      });
      const full = workflowService.get(db, wf.id, { includeTasks: true }) as NonNullable<
        ReturnType<typeof workflowService.get>
      >;
      const taskId = full.tasks[0].id;
      taskService.updateStatus(db, taskId, 'planning');
      taskService.updateStatus(db, taskId, 'in_progress');
      taskService.updateStatus(db, taskId, 'completed', { outcome: 'Done' });

      const result = call('workflow_next_tasks', { workflow_id: wf.id });
      const data = parseContent(result) as { tasks: unknown[]; all_complete: boolean };
      expect(data.all_complete).toBe(true);
      expect(data.tasks).toHaveLength(0);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('workflow_next_tasks', { workflow_id: 'wf_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
      expect(err.recoverable).toBe(false);
    });
  });

  // --- workflow_progress ---

  describe('workflow_progress', () => {
    it('returns progress breakdown', () => {
      const { workflowId, taskIds } = createWorkflowWithTasks();
      // Complete first task
      taskService.updateStatus(db, taskIds[0], 'planning');
      taskService.updateStatus(db, taskIds[0], 'in_progress');
      taskService.updateStatus(db, taskIds[0], 'completed', { outcome: 'Done' });

      const result = call('workflow_progress', { workflow_id: workflowId });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as {
        total_tasks: number;
        by_status: Record<string, number>;
        estimated_remaining: number;
      };
      expect(data.total_tasks).toBe(3);
      expect(data.by_status.completed).toBe(1);
      expect(data.estimated_remaining).toBe(2);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('workflow_progress', { workflow_id: 'wf_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });
  });

  // --- task_check_dependencies ---

  describe('task_check_dependencies', () => {
    it('returns satisfied when no dependencies', () => {
      const { taskIds } = createWorkflowWithTasks();
      // First task has no dependencies
      const result = call('task_check_dependencies', { task_id: taskIds[0] });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { satisfied: boolean; pending: unknown[] };
      expect(data.satisfied).toBe(true);
      expect(data.pending).toHaveLength(0);
    });

    it('returns unsatisfied when dependencies are incomplete', () => {
      const { taskIds } = createWorkflowWithTasks();
      // Second task depends on First
      const result = call('task_check_dependencies', { task_id: taskIds[1] });
      const data = parseContent(result) as {
        satisfied: boolean;
        pending: { name: string }[];
        completed: unknown[];
      };
      expect(data.satisfied).toBe(false);
      expect(data.pending).toHaveLength(1);
      expect(data.pending[0].name).toBe('First');
    });

    it('returns satisfied after dependency completes', () => {
      const { taskIds } = createWorkflowWithTasks();
      // Complete first task
      taskService.updateStatus(db, taskIds[0], 'planning');
      taskService.updateStatus(db, taskIds[0], 'in_progress');
      taskService.updateStatus(db, taskIds[0], 'completed', { outcome: 'Done' });

      const result = call('task_check_dependencies', { task_id: taskIds[1] });
      const data = parseContent(result) as { satisfied: boolean; completed: { name: string }[] };
      expect(data.satisfied).toBe(true);
      expect(data.completed).toHaveLength(1);
      expect(data.completed[0].name).toBe('First');
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const result = call('task_check_dependencies', { task_id: 'tk_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
    });
  });
});
