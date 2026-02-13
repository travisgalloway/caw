import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, workflowService } from '@caw/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../server';
import { getToolHandler, parseContent, parseError } from './__test-utils';

describe('checkpoint tools', () => {
  let db: DatabaseType;
  let call: (name: string, args: Record<string, unknown>) => CallToolResult;

  function createTask(): string {
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
    return full.tasks[0].id;
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

  // --- checkpoint_add ---

  describe('checkpoint_add', () => {
    it('adds a checkpoint and returns id + sequence', () => {
      const taskId = createTask();
      const result = call('checkpoint_add', {
        task_id: taskId,
        type: 'progress',
        summary: 'Made progress',
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string; sequence: number };
      expect(data.id).toMatch(/^cp_/);
      expect(data.sequence).toBe(1);
    });

    it('increments sequence for multiple checkpoints', () => {
      const taskId = createTask();
      call('checkpoint_add', {
        task_id: taskId,
        type: 'progress',
        summary: 'First',
      });
      const result = call('checkpoint_add', {
        task_id: taskId,
        type: 'progress',
        summary: 'Second',
      });
      const data = parseContent(result) as { sequence: number };
      expect(data.sequence).toBe(2);
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const result = call('checkpoint_add', {
        task_id: 'tk_nonexistent',
        type: 'progress',
        summary: 'test',
      });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
      expect(err.recoverable).toBe(false);
    });
  });

  // --- checkpoint_list ---

  describe('checkpoint_list', () => {
    it('returns empty list when no checkpoints', () => {
      const taskId = createTask();
      const result = call('checkpoint_list', { task_id: taskId });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { checkpoints: unknown[] };
      expect(data.checkpoints).toEqual([]);
    });

    it('returns checkpoints in order', () => {
      const taskId = createTask();
      call('checkpoint_add', { task_id: taskId, type: 'plan', summary: 'First' });
      call('checkpoint_add', { task_id: taskId, type: 'progress', summary: 'Second' });
      call('checkpoint_add', { task_id: taskId, type: 'decision', summary: 'Third' });

      const result = call('checkpoint_list', { task_id: taskId });
      const data = parseContent(result) as {
        checkpoints: { sequence: number; summary: string }[];
      };
      expect(data.checkpoints).toHaveLength(3);
      expect(data.checkpoints[0].sequence).toBe(1);
      expect(data.checkpoints[0].summary).toBe('First');
      expect(data.checkpoints[2].sequence).toBe(3);
    });

    it('filters by type', () => {
      const taskId = createTask();
      call('checkpoint_add', { task_id: taskId, type: 'plan', summary: 'Plan cp' });
      call('checkpoint_add', { task_id: taskId, type: 'progress', summary: 'Progress cp' });
      call('checkpoint_add', { task_id: taskId, type: 'error', summary: 'Error cp' });

      const result = call('checkpoint_list', { task_id: taskId, type: ['progress'] });
      const data = parseContent(result) as { checkpoints: { summary: string }[] };
      expect(data.checkpoints).toHaveLength(1);
      expect(data.checkpoints[0].summary).toBe('Progress cp');
    });

    it('filters by since_sequence', () => {
      const taskId = createTask();
      call('checkpoint_add', { task_id: taskId, type: 'progress', summary: 'First' });
      call('checkpoint_add', { task_id: taskId, type: 'progress', summary: 'Second' });
      call('checkpoint_add', { task_id: taskId, type: 'progress', summary: 'Third' });

      const result = call('checkpoint_list', { task_id: taskId, since_sequence: 2 });
      const data = parseContent(result) as { checkpoints: { sequence: number }[] };
      expect(data.checkpoints).toHaveLength(1);
      expect(data.checkpoints[0].sequence).toBe(3);
    });

    it('respects limit', () => {
      const taskId = createTask();
      call('checkpoint_add', { task_id: taskId, type: 'progress', summary: 'First' });
      call('checkpoint_add', { task_id: taskId, type: 'progress', summary: 'Second' });
      call('checkpoint_add', { task_id: taskId, type: 'progress', summary: 'Third' });

      const result = call('checkpoint_list', { task_id: taskId, limit: 2 });
      const data = parseContent(result) as { checkpoints: unknown[] };
      expect(data.checkpoints).toHaveLength(2);
    });
  });
});
