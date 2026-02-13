import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, sessionService, workflowService } from '@caw/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../server';
import { getToolHandler, parseContent, parseError } from './__test-utils';

describe('workflow tools', () => {
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

  // --- workflow_create ---

  describe('workflow_create', () => {
    it('creates a workflow and returns expected shape', () => {
      const result = call('workflow_create', {
        name: 'Test Workflow',
        source_type: 'prompt',
        source_content: 'Build something',
      });

      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as {
        id: string;
        name: string;
        status: string;
        max_parallel_tasks: number;
      };
      expect(data.id).toMatch(/^wf_/);
      expect(data.name).toBe('Test Workflow');
      expect(data.status).toBe('planning');
      expect(data.max_parallel_tasks).toBe(1);
    });

    it('accepts optional parallelism settings', () => {
      const result = call('workflow_create', {
        name: 'Parallel Workflow',
        source_type: 'prompt',
        source_content: 'Build in parallel',
        max_parallel_tasks: 3,
        auto_create_workspaces: true,
      });

      const data = parseContent(result) as { max_parallel_tasks: number };
      expect(data.max_parallel_tasks).toBe(3);
    });

    it('accepts repository_paths array', () => {
      const result = call('workflow_create', {
        name: 'Multi-repo WF',
        source_type: 'prompt',
        source_content: 'content',
        repository_paths: ['/repo/backend', '/repo/frontend'],
      });

      const data = parseContent(result) as { id: string };
      const repos = workflowService.listRepositories(db, data.id);
      expect(repos).toHaveLength(2);
    });
  });

  // --- workflow_get ---

  describe('workflow_get', () => {
    it('returns workflow details', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'Fetch Me',
          source_type: 'prompt',
          source_content: 'content',
        }),
      ) as { id: string };

      const result = call('workflow_get', { id: created.id });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string; name: string };
      expect(data.id).toBe(created.id);
      expect(data.name).toBe('Fetch Me');
    });

    it('returns structured error for missing workflow', () => {
      const result = call('workflow_get', { id: 'wf_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
      expect(err.recoverable).toBe(false);
      expect(err.suggestion).toContain('Check the workflow ID');
    });
  });

  // --- workflow_list ---

  describe('workflow_list', () => {
    it('returns empty list when no workflows', () => {
      const result = call('workflow_list', {});
      const data = parseContent(result) as { workflows: unknown[]; total: number };
      expect(data.workflows).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('returns created workflows', () => {
      call('workflow_create', {
        name: 'WF 1',
        source_type: 'prompt',
        source_content: 'a',
      });
      call('workflow_create', {
        name: 'WF 2',
        source_type: 'prompt',
        source_content: 'b',
      });

      const result = call('workflow_list', {});
      const data = parseContent(result) as { workflows: unknown[]; total: number };
      expect(data.total).toBe(2);
      expect(data.workflows).toHaveLength(2);
    });

    it('filters by status', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      // Move to ready by setting a plan
      workflowService.setPlan(db, created.id, {
        summary: 'plan',
        tasks: [{ name: 'task1' }],
      });

      const planningOnly = call('workflow_list', { status: ['planning'] });
      const planningData = parseContent(planningOnly) as { total: number };
      expect(planningData.total).toBe(0);

      const readyOnly = call('workflow_list', { status: ['ready'] });
      const readyData = parseContent(readyOnly) as { total: number };
      expect(readyData.total).toBe(1);
    });

    it('filters by repository_path via join table', () => {
      call('workflow_create', {
        name: 'WF1',
        source_type: 'prompt',
        source_content: 'a',
        repository_paths: ['/repo/backend'],
      });
      call('workflow_create', {
        name: 'WF2',
        source_type: 'prompt',
        source_content: 'b',
      });

      const result = call('workflow_list', { repository_path: '/repo/backend' });
      const data = parseContent(result) as { total: number };
      expect(data.total).toBe(1);
    });
  });

  // --- workflow_set_plan ---

  describe('workflow_set_plan', () => {
    it('creates tasks from plan', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'Planned WF',
          source_type: 'prompt',
          source_content: 'content',
        }),
      ) as { id: string };

      const result = call('workflow_set_plan', {
        id: created.id,
        plan: {
          summary: 'Build the feature',
          tasks: [
            { name: 'Setup', description: 'Initial setup' },
            { name: 'Implement', depends_on: ['Setup'] },
            { name: 'Test', depends_on: ['Implement'] },
          ],
        },
      });

      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as {
        workflow_id: string;
        tasks_created: number;
        status: string;
      };
      expect(data.workflow_id).toBe(created.id);
      expect(data.tasks_created).toBe(3);
      expect(data.status).toBe('ready');
    });

    it('accepts repository_path on tasks', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'Multi-repo WF',
          source_type: 'prompt',
          source_content: 'content',
        }),
      ) as { id: string };

      const result = call('workflow_set_plan', {
        id: created.id,
        plan: {
          summary: 'Multi-repo plan',
          tasks: [
            { name: 'Backend', repository_path: '/repo/backend' },
            { name: 'Frontend', repository_path: '/repo/frontend' },
          ],
        },
      });

      expect(result.isError).toBeUndefined();
      const repos = workflowService.listRepositories(db, created.id);
      expect(repos).toHaveLength(2);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('workflow_set_plan', {
        id: 'wf_nonexistent',
        plan: { summary: 'x', tasks: [] },
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });

    it('returns INVALID_STATE when workflow is not in planning status', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      // Set plan to move to 'ready'
      call('workflow_set_plan', {
        id: created.id,
        plan: { summary: 'plan', tasks: [{ name: 'task1' }] },
      });

      // Try to set plan again
      const result = call('workflow_set_plan', {
        id: created.id,
        plan: { summary: 'plan2', tasks: [{ name: 'task2' }] },
      });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_STATE');
      expect(err.recoverable).toBe(false);
    });

    it('returns DUPLICATE_TASK_NAME for duplicate names', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const result = call('workflow_set_plan', {
        id: created.id,
        plan: {
          summary: 'plan',
          tasks: [{ name: 'dup' }, { name: 'dup' }],
        },
      });
      const err = parseError(result);
      expect(err.code).toBe('DUPLICATE_TASK_NAME');
      expect(err.recoverable).toBe(true);
    });

    it('returns SELF_DEPENDENCY for self-referencing tasks', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const result = call('workflow_set_plan', {
        id: created.id,
        plan: {
          summary: 'plan',
          tasks: [{ name: 'circular', depends_on: ['circular'] }],
        },
      });
      const err = parseError(result);
      expect(err.code).toBe('SELF_DEPENDENCY');
      expect(err.recoverable).toBe(true);
    });

    it('returns UNKNOWN_DEPENDENCY for invalid dependency references', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const result = call('workflow_set_plan', {
        id: created.id,
        plan: {
          summary: 'plan',
          tasks: [{ name: 'task1', depends_on: ['nonexistent'] }],
        },
      });
      const err = parseError(result);
      expect(err.code).toBe('UNKNOWN_DEPENDENCY');
      expect(err.recoverable).toBe(true);
    });
  });

  // --- workflow_update_status ---

  describe('workflow_update_status', () => {
    it('updates status with valid transition', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      // planning → ready via set_plan
      call('workflow_set_plan', {
        id: created.id,
        plan: { summary: 'plan', tasks: [{ name: 'task1' }] },
      });

      // ready → in_progress
      const result = call('workflow_update_status', {
        id: created.id,
        status: 'in_progress',
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('workflow_update_status', {
        id: 'wf_nonexistent',
        status: 'in_progress',
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });

    it('returns INVALID_TRANSITION for invalid status change', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      // planning → in_progress is not valid (must go through ready first)
      const result = call('workflow_update_status', {
        id: created.id,
        status: 'in_progress',
      });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_TRANSITION');
      expect(err.recoverable).toBe(false);
      expect(err.suggestion).toContain('state machine');
    });
  });

  // --- workflow_set_parallelism ---

  describe('workflow_set_parallelism', () => {
    it('updates parallelism settings', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const result = call('workflow_set_parallelism', {
        id: created.id,
        max_parallel_tasks: 4,
        auto_create_workspaces: true,
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean };
      expect(data.success).toBe(true);

      // Verify the change persisted
      const getResult = call('workflow_get', { id: created.id });
      const wf = parseContent(getResult) as {
        max_parallel_tasks: number;
        auto_create_workspaces: number;
      };
      expect(wf.max_parallel_tasks).toBe(4);
      expect(wf.auto_create_workspaces).toBe(1);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('workflow_set_parallelism', {
        id: 'wf_nonexistent',
        max_parallel_tasks: 2,
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });
  });

  // --- workflow_get_summary ---

  describe('workflow_get_summary', () => {
    it('returns json summary', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'Summary WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const result = call('workflow_get_summary', { id: created.id, format: 'json' });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { summary: string; token_estimate: number };
      expect(data.token_estimate).toBeGreaterThan(0);

      const summary = JSON.parse(data.summary);
      expect(summary.name).toBe('Summary WF');
      expect(summary.status).toBe('planning');
    });

    it('returns markdown summary', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'Markdown WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const result = call('workflow_get_summary', { id: created.id, format: 'markdown' });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { summary: string };
      expect(data.summary).toContain('# Markdown WF');
      expect(data.summary).toContain('**Status:** planning');
    });

    it('defaults to json format', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'Default WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const result = call('workflow_get_summary', { id: created.id });
      const data = parseContent(result) as { summary: string };
      // JSON format produces a parseable JSON string
      expect(() => JSON.parse(data.summary)).not.toThrow();
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('workflow_get_summary', { id: 'wf_nonexistent' });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });
  });

  // --- structured error format ---

  describe('structured error format', () => {
    it('includes all required fields in error responses', () => {
      const result = call('workflow_get', { id: 'wf_missing' });
      const err = parseError(result);
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

  // --- workflow_lock ---

  describe('workflow_lock', () => {
    it('locks a workflow', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const session = sessionService.register(db, { pid: 1234 });

      const result = call('workflow_lock', { id: created.id, session_id: session.id });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { success: boolean; locked_by: string };
      expect(data.success).toBe(true);
      expect(data.locked_by).toBe(session.id);
    });

    it('fails when locked by another session', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const sessionA = sessionService.register(db, { pid: 1000 });
      const sessionB = sessionService.register(db, { pid: 2000 });

      call('workflow_lock', { id: created.id, session_id: sessionA.id });
      const result = call('workflow_lock', { id: created.id, session_id: sessionB.id });
      const data = parseContent(result) as { success: boolean; locked_by: string };
      expect(data.success).toBe(false);
      expect(data.locked_by).toBe(sessionA.id);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const session = sessionService.register(db, { pid: 1234 });
      const result = call('workflow_lock', { id: 'wf_nonexistent', session_id: session.id });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });
  });

  // --- workflow_unlock ---

  describe('workflow_unlock', () => {
    it('unlocks a locked workflow', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const session = sessionService.register(db, { pid: 1234 });

      call('workflow_lock', { id: created.id, session_id: session.id });
      const result = call('workflow_unlock', { id: created.id, session_id: session.id });
      expect(result.isError).toBeUndefined();
    });

    it('returns error when unlocking with wrong session', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const sessionA = sessionService.register(db, { pid: 1000 });
      const sessionB = sessionService.register(db, { pid: 2000 });

      call('workflow_lock', { id: created.id, session_id: sessionA.id });
      const result = call('workflow_unlock', { id: created.id, session_id: sessionB.id });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_LOCKED');
    });
  });

  // --- workflow_lock_info ---

  describe('workflow_lock_info', () => {
    it('returns unlocked info for unlocked workflow', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const result = call('workflow_lock_info', { id: created.id });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { locked: boolean; session_id: null };
      expect(data.locked).toBe(false);
      expect(data.session_id).toBeNull();
    });

    it('returns lock info for locked workflow', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const session = sessionService.register(db, { pid: 5678 });
      call('workflow_lock', { id: created.id, session_id: session.id });

      const result = call('workflow_lock_info', { id: created.id });
      const data = parseContent(result) as {
        locked: boolean;
        session_id: string;
        session_pid: number;
      };
      expect(data.locked).toBe(true);
      expect(data.session_id).toBe(session.id);
      expect(data.session_pid).toBe(5678);
    });
  });

  // --- lock guard integration ---

  describe('lock guard integration', () => {
    it('blocks workflow_update_status when locked by another session', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      // Set plan so we can try updating status
      call('workflow_set_plan', {
        id: created.id,
        plan: { summary: 'plan', tasks: [{ name: 'task1' }] },
      });

      const sessionA = sessionService.register(db, { pid: 1000 });
      const sessionB = sessionService.register(db, { pid: 2000 });

      call('workflow_lock', { id: created.id, session_id: sessionA.id });

      // Session B should be blocked
      const result = call('workflow_update_status', {
        id: created.id,
        session_id: sessionB.id,
        status: 'in_progress',
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_LOCKED');
    });

    it('allows workflow_update_status without session_id (backward compat)', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      call('workflow_set_plan', {
        id: created.id,
        plan: { summary: 'plan', tasks: [{ name: 'task1' }] },
      });

      const session = sessionService.register(db, { pid: 1000 });
      call('workflow_lock', { id: created.id, session_id: session.id });

      // No session_id — should pass through (backward compat)
      const result = call('workflow_update_status', {
        id: created.id,
        status: 'in_progress',
      });
      expect(result.isError).toBeUndefined();
    });

    it('allows workflow_update_status when locked by same session', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      call('workflow_set_plan', {
        id: created.id,
        plan: { summary: 'plan', tasks: [{ name: 'task1' }] },
      });

      const session = sessionService.register(db, { pid: 1000 });
      call('workflow_lock', { id: created.id, session_id: session.id });

      const result = call('workflow_update_status', {
        id: created.id,
        session_id: session.id,
        status: 'in_progress',
      });
      expect(result.isError).toBeUndefined();
    });
  });

  // --- workflow_add_repository ---

  describe('workflow_add_repository', () => {
    it('adds a repository to a workflow', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const result = call('workflow_add_repository', {
        workflow_id: created.id,
        repository_path: '/repo/new',
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as {
        workflow_id: string;
        repository_id: string;
      };
      expect(data.workflow_id).toBe(created.id);
      expect(data.repository_id).toMatch(/^rp_/);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('workflow_add_repository', {
        workflow_id: 'wf_nonexistent',
        repository_path: '/repo/new',
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });
  });

  // --- workflow_remove_repository ---

  describe('workflow_remove_repository', () => {
    it('removes a repository from a workflow', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
          repository_paths: ['/repo/a'],
        }),
      ) as { id: string };

      const repos = workflowService.listRepositories(db, created.id);
      expect(repos).toHaveLength(1);

      const result = call('workflow_remove_repository', {
        workflow_id: created.id,
        repository_id: repos[0].id,
      });
      expect(result.isError).toBeUndefined();

      const remaining = workflowService.listRepositories(db, created.id);
      expect(remaining).toHaveLength(0);
    });

    it('returns REPOSITORY_IN_USE when tasks reference the repo', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      call('workflow_set_plan', {
        id: created.id,
        plan: {
          summary: 'plan',
          tasks: [{ name: 'Task', repository_path: '/repo/backend' }],
        },
      });

      const repos = workflowService.listRepositories(db, created.id);
      const result = call('workflow_remove_repository', {
        workflow_id: created.id,
        repository_id: repos[0].id,
      });
      const err = parseError(result);
      expect(err.code).toBe('REPOSITORY_IN_USE');
    });
  });

  // --- workflow_list_repositories ---

  describe('workflow_list_repositories', () => {
    it('returns empty list for workflow with no repos', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
        }),
      ) as { id: string };

      const result = call('workflow_list_repositories', {
        workflow_id: created.id,
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { repositories: unknown[] };
      expect(data.repositories).toEqual([]);
    });

    it('returns associated repositories', () => {
      const created = parseContent(
        call('workflow_create', {
          name: 'WF',
          source_type: 'prompt',
          source_content: 'x',
          repository_paths: ['/repo/backend', '/repo/frontend'],
        }),
      ) as { id: string };

      const result = call('workflow_list_repositories', {
        workflow_id: created.id,
      });
      const data = parseContent(result) as {
        repositories: { id: string; path: string }[];
      };
      expect(data.repositories).toHaveLength(2);
      const paths = data.repositories.map((r) => r.path);
      expect(paths).toContain('/repo/backend');
      expect(paths).toContain('/repo/frontend');
    });
  });
});
