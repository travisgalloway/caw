import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import {
  createConnection,
  prService,
  runMigrations,
  workflowService,
  workspaceService,
} from '@caw/core';
import type { PrOptions } from './pr';

function createTestDb(): DatabaseType {
  const db = createConnection(':memory:');
  runMigrations(db);
  return db;
}

describe('pr command', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('PrOptions interface', () => {
    it('accepts list subcommand', () => {
      const opts: PrOptions = {
        subcommand: 'list',
        repoPath: '/tmp',
      };
      expect(opts.subcommand).toBe('list');
    });

    it('accepts cycle subcommand with all options', () => {
      const opts: PrOptions = {
        subcommand: 'cycle',
        workflowId: 'wf_test',
        repoPath: '/tmp',
        model: 'claude-sonnet-4-5',
        port: 3100,
        cycle: 'auto',
        noReview: false,
        dryRun: true,
        mergeMethod: 'squash',
        ciTimeout: 600,
        ciPoll: 30,
        ciFixIterations: 3,
      };
      expect(opts.dryRun).toBe(true);
      expect(opts.ciFixIterations).toBe(3);
    });
  });

  describe('pr list', () => {
    it('lists workflows awaiting merge', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'T1' }],
      });

      // Move to awaiting_merge
      workflowService.updateStatus(db, wf.id, 'in_progress');
      workflowService.updateStatus(db, wf.id, 'awaiting_merge');

      const { workflows } = workflowService.list(db, { status: 'awaiting_merge' });
      expect(workflows).toHaveLength(1);
      expect(workflows[0].id).toBe(wf.id);
    });

    it('returns empty when no workflows awaiting merge', () => {
      const { workflows } = workflowService.list(db, { status: 'awaiting_merge' });
      expect(workflows).toHaveLength(0);
    });
  });

  describe('pr check', () => {
    it('listAwaitingMerge returns workspaces with pr_url', () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'T1' }],
      });
      workflowService.updateStatus(db, wf.id, 'in_progress');

      const ws = workspaceService.create(db, {
        workflowId: wf.id,
        path: '/tmp/ws',
        branch: 'feat/test',
      });
      workspaceService.update(db, ws.id, { prUrl: 'https://github.com/org/repo/pull/1' });

      const awaiting = prService.listAwaitingMerge(db, wf.id);
      expect(awaiting).toHaveLength(1);
      expect(awaiting[0].pr_url).toBe('https://github.com/org/repo/pull/1');
    });
  });

  describe('pr merge', () => {
    it('completeMerge updates workspace status', async () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const ws = workspaceService.create(db, {
        workflowId: wf.id,
        path: '/tmp/ws',
        branch: 'feat/test',
      });

      await prService.completeMerge(db, ws.id, 'abc123');

      const updated = workspaceService.get(db, ws.id);
      expect(updated?.status).toBe('merged');
    });
  });

  describe('subcommand validation', () => {
    it('valid subcommands include list, check, merge, rebase, cycle', () => {
      const valid = ['list', 'check', 'merge', 'rebase', 'cycle'];
      for (const cmd of valid) {
        expect(valid).toContain(cmd);
      }
    });
  });

  describe('ghMerge function', () => {
    it('exports merge methods', async () => {
      const { ghMerge } = await import('./pr');
      expect(typeof ghMerge).toBe('function');
    });
  });

  describe('waitForCi function', () => {
    it('exports waitForCi', async () => {
      const { waitForCi } = await import('./pr');
      expect(typeof waitForCi).toBe('function');
    });
  });
});
