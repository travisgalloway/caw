import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, sessionService, workflowService } from '@caw/core';
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

function createReadyWorkflow(db: DatabaseType, tasks = [{ name: 'Task A' }, { name: 'Task B' }]) {
  const wf = workflowService.create(db, {
    name: 'Test WF',
    source_type: 'prompt',
    source_content: 'content',
  });
  workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks });
  return wf;
}

describe('replanning tools', () => {
  let db: DatabaseType;
  let call: (name: string, args: Record<string, unknown>) => CallToolResult;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);
    call = (name, args) => {
      const handler = getToolHandler(server, name);
      return handler(args) as CallToolResult;
    };
  });

  // --- workflow_add_task ---

  describe('workflow_add_task', () => {
    it('adds a task to an existing workflow', () => {
      const wf = createReadyWorkflow(db);
      const result = call('workflow_add_task', {
        workflow_id: wf.id,
        name: 'Task C',
        description: 'New task',
      });

      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { task_id: string; sequence: number };
      expect(data.task_id).toMatch(/^tk_/);
      expect(data.sequence).toBe(3);
    });

    it('adds task with dependencies', () => {
      const wf = createReadyWorkflow(db);
      const result = call('workflow_add_task', {
        workflow_id: wf.id,
        name: 'Task C',
        depends_on: ['Task A'],
      });

      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { task_id: string };
      expect(data.task_id).toMatch(/^tk_/);
    });

    it('adds task after specified task', () => {
      const wf = createReadyWorkflow(db);
      const result = call('workflow_add_task', {
        workflow_id: wf.id,
        name: 'Inserted',
        after_task: 'Task A',
      });

      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { sequence: number };
      expect(data.sequence).toBe(2);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('workflow_add_task', {
        workflow_id: 'wf_nonexistent',
        name: 'X',
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });

    it('returns DUPLICATE_TASK_NAME for duplicate name', () => {
      const wf = createReadyWorkflow(db);
      const result = call('workflow_add_task', {
        workflow_id: wf.id,
        name: 'Task A',
      });
      const err = parseError(result);
      expect(err.code).toBe('DUPLICATE_TASK_NAME');
    });

    it('returns INVALID_STATE for planning workflow', () => {
      const wf = workflowService.create(db, {
        name: 'Planning WF',
        source_type: 'prompt',
      });
      const result = call('workflow_add_task', {
        workflow_id: wf.id,
        name: 'New',
      });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_STATE');
    });

    it('enforces lock guard', () => {
      const wf = createReadyWorkflow(db);
      const sessionA = sessionService.register(db, { pid: 1000 });
      const sessionB = sessionService.register(db, { pid: 2000 });

      call('workflow_lock', { id: wf.id, session_id: sessionA.id });

      const result = call('workflow_add_task', {
        workflow_id: wf.id,
        session_id: sessionB.id,
        name: 'Blocked',
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_LOCKED');
    });
  });

  // --- workflow_remove_task ---

  describe('workflow_remove_task', () => {
    it('removes a pending task', () => {
      const wf = createReadyWorkflow(db);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];

      const result = call('workflow_remove_task', {
        workflow_id: wf.id,
        task_id: tasks[0].id,
      });

      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { removed_task_id: string };
      expect(data.removed_task_id).toBe(tasks[0].id);
    });

    it('returns TASK_NOT_FOUND for missing task', () => {
      const wf = createReadyWorkflow(db);
      const result = call('workflow_remove_task', {
        workflow_id: wf.id,
        task_id: 'tk_nonexistent',
      });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_FOUND');
    });

    it('returns TASK_NOT_REMOVABLE for in_progress task', () => {
      const wf = createReadyWorkflow(db, [{ name: 'Active' }]);
      workflowService.updateStatus(db, wf.id, 'in_progress');
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      db.prepare("UPDATE tasks SET status = 'in_progress' WHERE id = ?").run(tasks[0].id);

      const result = call('workflow_remove_task', {
        workflow_id: wf.id,
        task_id: tasks[0].id,
      });
      const err = parseError(result);
      expect(err.code).toBe('TASK_NOT_REMOVABLE');
    });

    it('enforces lock guard', () => {
      const wf = createReadyWorkflow(db);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      const sessionA = sessionService.register(db, { pid: 1000 });
      const sessionB = sessionService.register(db, { pid: 2000 });

      call('workflow_lock', { id: wf.id, session_id: sessionA.id });

      const result = call('workflow_remove_task', {
        workflow_id: wf.id,
        session_id: sessionB.id,
        task_id: tasks[0].id,
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_LOCKED');
    });
  });

  // --- workflow_replan ---

  describe('workflow_replan', () => {
    it('replans a workflow preserving completed tasks', () => {
      const wf = createReadyWorkflow(db, [{ name: 'Setup' }, { name: 'Build' }]);
      workflowService.updateStatus(db, wf.id, 'in_progress');
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(tasks[0].id);

      const result = call('workflow_replan', {
        workflow_id: wf.id,
        plan: {
          summary: 'New plan',
          reason: 'Changed requirements',
          tasks: [{ name: 'New Build', depends_on: ['Setup'] }],
        },
      });

      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as {
        tasks_preserved: number;
        tasks_removed: number;
        tasks_added: number;
      };
      expect(data.tasks_preserved).toBe(1);
      expect(data.tasks_removed).toBe(1);
      expect(data.tasks_added).toBe(1);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('workflow_replan', {
        workflow_id: 'wf_nonexistent',
        plan: { summary: 'x', reason: 'x', tasks: [] },
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });

    it('returns NAME_CONFLICT for preserved task name collision', () => {
      const wf = createReadyWorkflow(db, [{ name: 'Setup' }]);
      workflowService.updateStatus(db, wf.id, 'in_progress');
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(tasks[0].id);

      const result = call('workflow_replan', {
        workflow_id: wf.id,
        plan: {
          summary: 'Collision',
          reason: 'test',
          tasks: [{ name: 'Setup' }],
        },
      });
      const err = parseError(result);
      expect(err.code).toBe('NAME_CONFLICT');
    });

    it('returns INVALID_STATE for planning workflow', () => {
      const wf = workflowService.create(db, {
        name: 'Planning WF',
        source_type: 'prompt',
      });
      const result = call('workflow_replan', {
        workflow_id: wf.id,
        plan: { summary: 'x', reason: 'x', tasks: [] },
      });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_STATE');
    });

    it('enforces lock guard', () => {
      const wf = createReadyWorkflow(db);
      const sessionA = sessionService.register(db, { pid: 1000 });
      const sessionB = sessionService.register(db, { pid: 2000 });

      call('workflow_lock', { id: wf.id, session_id: sessionA.id });

      const result = call('workflow_replan', {
        workflow_id: wf.id,
        session_id: sessionB.id,
        plan: { summary: 'x', reason: 'x', tasks: [] },
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_LOCKED');
    });
  });
});
