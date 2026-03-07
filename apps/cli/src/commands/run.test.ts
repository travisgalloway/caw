import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, workflowService } from '@caw/core';
import type { RunOptions } from './run';

function createTestDb(): DatabaseType {
  const db = createConnection(':memory:');
  runMigrations(db);
  return db;
}

describe('run command', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('RunOptions interface', () => {
    it('accepts minimal options', () => {
      const opts: RunOptions = {
        workflowId: 'wf_test123',
      };
      expect(opts.workflowId).toBe('wf_test123');
    });

    it('accepts full options', () => {
      const opts: RunOptions = {
        workflowId: 'wf_test123',
        prompt: 'Build a feature',
        maxAgents: 3,
        model: 'claude-sonnet-4-5',
        permissionMode: 'bypassPermissions',
        maxTurns: 50,
        maxBudgetUsd: 10.0,
        ephemeralWorktree: true,
        watch: true,
        detach: false,
        port: 3100,
        cwd: '/tmp',
      };
      expect(opts.maxAgents).toBe(3);
      expect(opts.ephemeralWorktree).toBe(true);
    });
  });

  describe('workflow validation', () => {
    it('workflow exists in DB for run', () => {
      const wf = workflowService.create(db, {
        name: 'Test',
        source_type: 'prompt',
        source_content: 'Build something',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'T1' }],
      });

      const found = workflowService.get(db, wf.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe('ready');
    });

    it('prompt creates workflow that can be run', () => {
      const wf = workflowService.create(db, {
        name: 'Build a feature'.slice(0, 80),
        source_type: 'prompt',
        source_content: 'Build a feature',
      });

      expect(wf.id).toMatch(/^wf_/);
      expect(wf.source_type).toBe('prompt');
      expect(wf.source_content).toBe('Build a feature');
    });

    it('missing workflow returns null from service', () => {
      const found = workflowService.get(db, 'wf_nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('maxAgents resolution', () => {
    it('defaults to workflow max_parallel_tasks', () => {
      const wf = workflowService.create(db, {
        name: 'Test',
        source_type: 'prompt',
        max_parallel_tasks: 5,
      });

      // Simulate: options.maxAgents ?? workflow.max_parallel_tasks ?? 3
      const cliOverride: number | undefined = undefined;
      const maxAgents = cliOverride ?? wf.max_parallel_tasks ?? 3;
      expect(maxAgents).toBe(5);
    });

    it('uses workflow default of 1 when no override', () => {
      const wf = workflowService.create(db, {
        name: 'Test',
        source_type: 'prompt',
      });

      const cliOverride: number | undefined = undefined;
      const maxAgents = cliOverride ?? wf.max_parallel_tasks ?? 3;
      expect(maxAgents).toBe(1); // default max_parallel_tasks is 1
    });

    it('cli option takes priority', () => {
      const wf = workflowService.create(db, {
        name: 'Test',
        source_type: 'prompt',
        max_parallel_tasks: 5,
      });

      const cliOverride: number | undefined = 7;
      const maxAgents = cliOverride ?? wf.max_parallel_tasks ?? 3;
      expect(maxAgents).toBe(7);
    });
  });
});
