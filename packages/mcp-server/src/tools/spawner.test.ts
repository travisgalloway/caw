import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, workflowService } from '@caw/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../server';
import { getToolHandler, parseContent, parseError } from './__test-utils';

describe('spawner tools', () => {
  let db: DatabaseType;
  let callAsync: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);
    callAsync = async (name, args) => {
      const handler = getToolHandler(server, name);
      return (await handler(args)) as CallToolResult;
    };
  });

  describe('workflow_start', () => {
    it('returns error for non-existent workflow', async () => {
      const result = await callAsync('workflow_start', {
        workflow_id: 'wf_nonexistent',
      });

      expect(result.isError).toBe(true);
      const error = parseContent(result) as { code: string; message: string };
      expect(error.message).toContain('not found');
    });

    it('validates workflow_id is required', async () => {
      const result = await callAsync('workflow_start', {});

      // Without workflow_id, validation should fail
      expect(result.isError).toBe(true);
    });
  });

  describe('workflow_suspend', () => {
    it('returns error when no spawner registered', async () => {
      const result = await callAsync('workflow_suspend', {
        workflow_id: 'wf_test123',
      });

      expect(result.isError).toBe(true);
      const error = parseContent(result) as { code: string };
      expect(error.code).toBe('NOT_RUNNING');
    });
  });

  describe('workflow_resume', () => {
    it('returns error when no spawner registered', async () => {
      const result = await callAsync('workflow_resume', {
        workflow_id: 'wf_test123',
      });

      expect(result.isError).toBe(true);
      const error = parseContent(result) as { code: string };
      expect(error.code).toBe('NOT_SUSPENDED');
    });
  });

  describe('workflow_execution_status', () => {
    it('returns idle status when no spawner registered', async () => {
      const wf = workflowService.create(db, {
        name: 'Test WF',
        source_type: 'prompt',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'T1' }, { name: 'T2' }],
      });

      const result = await callAsync('workflow_execution_status', {
        workflow_id: wf.id,
      });

      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as {
        workflowId: string;
        status: string;
        agents: unknown[];
        progress: { totalTasks: number; completed: number };
      };
      expect(data.workflowId).toBe(wf.id);
      expect(data.status).toBe('idle');
      expect(data.agents).toEqual([]);
      expect(data.progress.totalTasks).toBe(2);
      expect(data.progress.completed).toBe(0);
    });

    it('returns progress for workflow with no tasks', async () => {
      const wf = workflowService.create(db, {
        name: 'Empty WF',
        source_type: 'prompt',
      });

      const result = await callAsync('workflow_execution_status', {
        workflow_id: wf.id,
      });

      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as {
        progress: { totalTasks: number };
      };
      expect(data.progress.totalTasks).toBe(0);
    });
  });

  describe('tool registration', () => {
    it('all spawner tools are registered', () => {
      const server = createMcpServer(db);
      const tools = [
        'workflow_start',
        'workflow_suspend',
        'workflow_resume',
        'workflow_execution_status',
      ];

      for (const name of tools) {
        expect(() => getToolHandler(server, name)).not.toThrow();
      }
    });
  });
});
