import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { Task } from '../types/task';
import * as repositoryService from './repository.service';
import * as workflowService from './workflow.service';

function createBasicWorkflow(db: DatabaseType, overrides?: Partial<workflowService.CreateParams>) {
  return workflowService.create(db, {
    name: 'Test Workflow',
    source_type: 'issue',
    ...overrides,
  });
}

describe('workflowService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- create ---

  describe('create', () => {
    it('creates a workflow with required fields', () => {
      const wf = createBasicWorkflow(db);
      expect(wf.id).toMatch(/^wf_[0-9a-z]{12}$/);
      expect(wf.name).toBe('Test Workflow');
      expect(wf.source_type).toBe('issue');
      expect(wf.status).toBe('planning');
    });

    it('defaults optional fields', () => {
      const wf = createBasicWorkflow(db);
      expect(wf.repository_id).toBeNull();
      expect(wf.source_ref).toBeNull();
      expect(wf.source_content).toBeNull();
      expect(wf.initial_plan).toBeNull();
      expect(wf.plan_summary).toBeNull();
      expect(wf.max_parallel_tasks).toBe(1);
      expect(wf.auto_create_workspaces).toBe(0);
      expect(wf.config).toBeNull();
    });

    it('serializes config as JSON', () => {
      const wf = createBasicWorkflow(db, {
        config: { retries: 3, verbose: true },
      });
      expect(wf.config).toBe('{"retries":3,"verbose":true}');
    });

    it('sets source fields when provided', () => {
      const wf = createBasicWorkflow(db, {
        source_ref: 'issue-42',
        source_content: 'Fix the bug',
      });
      expect(wf.source_ref).toBe('issue-42');
      expect(wf.source_content).toBe('Fix the bug');
    });

    it('auto-registers repository from path', () => {
      const wf = createBasicWorkflow(db, {
        repository_path: '/home/user/project',
      });
      expect(wf.repository_id).toMatch(/^rp_[0-9a-z]{12}$/);

      const repo = repositoryService.getByPath(db, '/home/user/project');
      expect(repo).not.toBeNull();
      expect(repo?.id).toBe(wf.repository_id);
    });

    it('uses provided repository_id over repository_path', () => {
      const repo = repositoryService.register(db, { path: '/existing' });
      const wf = createBasicWorkflow(db, { repository_id: repo.id });
      expect(wf.repository_id).toBe(repo.id);
    });

    it('converts auto_create_workspaces boolean to 0/1', () => {
      const wfTrue = createBasicWorkflow(db, { auto_create_workspaces: true });
      expect(wfTrue.auto_create_workspaces).toBe(1);

      const wfFalse = createBasicWorkflow(db, { auto_create_workspaces: false });
      expect(wfFalse.auto_create_workspaces).toBe(0);
    });

    it('persists to database', () => {
      const wf = createBasicWorkflow(db);
      const fetched = workflowService.get(db, wf.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe('Test Workflow');
    });
  });

  // --- get ---

  describe('get', () => {
    it('returns workflow when found', () => {
      const wf = createBasicWorkflow(db);
      const result = workflowService.get(db, wf.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(wf.id);
    });

    it('returns null when not found', () => {
      const result = workflowService.get(db, 'wf_nonexistent');
      expect(result).toBeNull();
    });

    it('returns empty tasks array by default', () => {
      const wf = createBasicWorkflow(db);
      const result = workflowService.get(db, wf.id);
      expect(result?.tasks).toEqual([]);
    });

    it('includes tasks when requested', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Test plan',
        tasks: [{ name: 'Task A' }, { name: 'Task B' }],
      });

      const result = workflowService.get(db, wf.id, { includeTasks: true });
      expect(result?.tasks).toHaveLength(2);
    });

    it('returns tasks ordered by sequence then name', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Test plan',
        tasks: [{ name: 'Setup' }, { name: 'Build' }, { name: 'Deploy' }],
      });

      const result = workflowService.get(db, wf.id, { includeTasks: true });
      expect(result?.tasks[0].name).toBe('Setup');
      expect(result?.tasks[0].sequence).toBe(1);
      expect(result?.tasks[1].name).toBe('Build');
      expect(result?.tasks[1].sequence).toBe(2);
      expect(result?.tasks[2].name).toBe('Deploy');
      expect(result?.tasks[2].sequence).toBe(3);
    });
  });

  // --- list ---

  describe('list', () => {
    it('returns empty list when no workflows', () => {
      const result = workflowService.list(db);
      expect(result.workflows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns workflow summaries', () => {
      createBasicWorkflow(db, { name: 'WF1' });
      createBasicWorkflow(db, { name: 'WF2' });

      const result = workflowService.list(db);
      expect(result.workflows).toHaveLength(2);
      expect(result.total).toBe(2);

      // Summary fields only
      const wf = result.workflows[0];
      expect(wf).toHaveProperty('id');
      expect(wf).toHaveProperty('name');
      expect(wf).toHaveProperty('status');
      expect(wf).toHaveProperty('created_at');
      expect(wf).toHaveProperty('updated_at');
    });

    it('filters by repository_id', () => {
      const repo = repositoryService.register(db, { path: '/project-a' });
      createBasicWorkflow(db, { name: 'WF1', repository_id: repo.id });
      createBasicWorkflow(db, { name: 'WF2' });

      const result = workflowService.list(db, { repository_id: repo.id });
      expect(result.workflows).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.workflows[0].name).toBe('WF1');
    });

    it('filters by single status', () => {
      const wf = createBasicWorkflow(db, { name: 'WF1' });
      createBasicWorkflow(db, { name: 'WF2' });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'T1' }],
      });

      const result = workflowService.list(db, { status: 'ready' });
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0].name).toBe('WF1');
    });

    it('filters by multiple statuses', () => {
      const wf1 = createBasicWorkflow(db, { name: 'WF1' });
      createBasicWorkflow(db, { name: 'WF2' });
      workflowService.setPlan(db, wf1.id, {
        summary: 'Plan',
        tasks: [{ name: 'T1' }],
      });

      const result = workflowService.list(db, { status: ['planning', 'ready'] });
      expect(result.workflows).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('combines filters', () => {
      const repo = repositoryService.register(db, { path: '/project-a' });
      const wf1 = createBasicWorkflow(db, { name: 'WF1', repository_id: repo.id });
      createBasicWorkflow(db, { name: 'WF2', repository_id: repo.id });
      createBasicWorkflow(db, { name: 'WF3' });

      workflowService.setPlan(db, wf1.id, {
        summary: 'Plan',
        tasks: [{ name: 'T1' }],
      });

      const result = workflowService.list(db, {
        repository_id: repo.id,
        status: 'ready',
      });
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0].name).toBe('WF1');
    });

    it('paginates results', () => {
      for (let i = 0; i < 5; i++) {
        createBasicWorkflow(db, { name: `WF${i}` });
      }

      const page1 = workflowService.list(db, { limit: 2 });
      expect(page1.workflows).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = workflowService.list(db, { limit: 2, offset: 2 });
      expect(page2.workflows).toHaveLength(2);

      const page3 = workflowService.list(db, { limit: 2, offset: 4 });
      expect(page3.workflows).toHaveLength(1);
    });

    it('returns correct total with filters', () => {
      createBasicWorkflow(db, { name: 'WF1' });
      createBasicWorkflow(db, { name: 'WF2' });
      createBasicWorkflow(db, { name: 'WF3' });

      const result = workflowService.list(db, { status: 'planning', limit: 1 });
      expect(result.workflows).toHaveLength(1);
      expect(result.total).toBe(3);
    });
  });

  // --- setPlan ---

  describe('setPlan', () => {
    it('sets plan and transitions to ready', () => {
      const wf = createBasicWorkflow(db);
      const result = workflowService.setPlan(db, wf.id, {
        summary: 'Build the feature',
        tasks: [
          { name: 'Setup', description: 'Initial setup' },
          { name: 'Implement', description: 'Core implementation' },
        ],
      });

      expect(result.workflow_id).toBe(wf.id);
      expect(result.tasks_created).toBe(2);
      expect(result.status).toBe('ready');

      const updated = workflowService.get(db, wf.id);
      expect(updated?.status).toBe('ready');
      expect(updated?.plan_summary).toBe('Build the feature');
      expect(updated?.initial_plan).not.toBeNull();
    });

    it('creates tasks with correct sequences', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'First' }, { name: 'Second' }, { name: 'Third' }],
      });

      const result = workflowService.get(db, wf.id, { includeTasks: true });
      expect(result?.tasks[0].sequence).toBe(1);
      expect(result?.tasks[1].sequence).toBe(2);
      expect(result?.tasks[2].sequence).toBe(3);
    });

    it('creates task dependencies', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          { name: 'Setup' },
          { name: 'Build', depends_on: ['Setup'] },
          { name: 'Test', depends_on: ['Build'] },
        ],
      });

      const wfResult = workflowService.get(db, wf.id, { includeTasks: true });
      const tasks = wfResult?.tasks ?? [];
      const buildId = tasks.find((t) => t.name === 'Build')?.id;
      const setupId = tasks.find((t) => t.name === 'Setup')?.id;

      const deps = db.prepare('SELECT * FROM task_dependencies WHERE task_id = ?').all(buildId) as {
        task_id: string;
        depends_on_id: string;
        dependency_type: string;
      }[];
      expect(deps).toHaveLength(1);
      expect(deps[0].depends_on_id).toBe(setupId);
      expect(deps[0].dependency_type).toBe('blocks');
    });

    it('tracks parallel groups', () => {
      const wf = createBasicWorkflow(db);
      const result = workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          { name: 'A', parallel_group: 'group-1' },
          { name: 'B', parallel_group: 'group-1' },
          { name: 'C', parallel_group: 'group-2' },
          { name: 'D' },
        ],
      });

      expect(result.parallelizable_groups).toHaveLength(2);
      expect(result.parallelizable_groups).toContain('group-1');
      expect(result.parallelizable_groups).toContain('group-2');
    });

    it('stores estimated_complexity and files_likely_affected in context', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          {
            name: 'Task',
            estimated_complexity: 'high',
            files_likely_affected: ['src/main.ts', 'src/utils.ts'],
          },
        ],
      });

      const result = workflowService.get(db, wf.id, { includeTasks: true });
      const context = JSON.parse(result?.tasks[0].context as string);
      expect(context.estimated_complexity).toBe('high');
      expect(context.files_likely_affected).toEqual(['src/main.ts', 'src/utils.ts']);
    });

    it('throws when workflow not found', () => {
      expect(() => {
        workflowService.setPlan(db, 'wf_nonexistent', {
          summary: 'Plan',
          tasks: [],
        });
      }).toThrow('Workflow not found');
    });

    it('throws when workflow is not in planning status', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'T1' }],
      });

      // Now workflow is 'ready'
      expect(() => {
        workflowService.setPlan(db, wf.id, {
          summary: 'New plan',
          tasks: [{ name: 'T2' }],
        });
      }).toThrow("Cannot set plan: workflow status is 'ready', expected 'planning'");
    });

    it('throws on unknown dependency name', () => {
      const wf = createBasicWorkflow(db);
      expect(() => {
        workflowService.setPlan(db, wf.id, {
          summary: 'Plan',
          tasks: [{ name: 'Build', depends_on: ['Nonexistent'] }],
        });
      }).toThrow("Unknown dependency 'Nonexistent' in task 'Build'");
    });

    it('throws on duplicate task names', () => {
      const wf = createBasicWorkflow(db);
      expect(() => {
        workflowService.setPlan(db, wf.id, {
          summary: 'Plan',
          tasks: [{ name: 'Setup' }, { name: 'Setup' }],
        });
      }).toThrow("Duplicate task name 'Setup' in plan");
    });

    it('throws on self-dependency', () => {
      const wf = createBasicWorkflow(db);
      expect(() => {
        workflowService.setPlan(db, wf.id, {
          summary: 'Plan',
          tasks: [{ name: 'Setup', depends_on: ['Setup'] }],
        });
      }).toThrow("Task 'Setup' cannot depend on itself");
    });

    it('is atomic — rolls back on dependency error', () => {
      const wf = createBasicWorkflow(db);
      try {
        workflowService.setPlan(db, wf.id, {
          summary: 'Plan',
          tasks: [{ name: 'Setup' }, { name: 'Build', depends_on: ['Missing'] }],
        });
      } catch {
        // expected
      }

      // Workflow should still be in planning
      const fetched = workflowService.get(db, wf.id);
      expect(fetched?.status).toBe('planning');

      // No tasks should have been created
      const tasks = db.prepare('SELECT * FROM tasks WHERE workflow_id = ?').all(wf.id) as Task[];
      expect(tasks).toHaveLength(0);
    });

    it('handles empty task list', () => {
      const wf = createBasicWorkflow(db);
      const result = workflowService.setPlan(db, wf.id, {
        summary: 'No tasks',
        tasks: [],
      });

      expect(result.tasks_created).toBe(0);
      expect(result.parallelizable_groups).toEqual([]);

      const updated = workflowService.get(db, wf.id);
      expect(updated?.status).toBe('ready');
    });
  });

  // --- updateStatus ---

  describe('updateStatus', () => {
    it('transitions planning → abandoned', () => {
      const wf = createBasicWorkflow(db);
      const updated = workflowService.updateStatus(db, wf.id, 'abandoned');
      expect(updated.status).toBe('abandoned');
    });

    it('transitions ready → in_progress', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'T1' }] });
      const updated = workflowService.updateStatus(db, wf.id, 'in_progress');
      expect(updated.status).toBe('in_progress');
    });

    it('transitions in_progress → paused', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'T1' }] });
      workflowService.updateStatus(db, wf.id, 'in_progress');
      const updated = workflowService.updateStatus(db, wf.id, 'paused');
      expect(updated.status).toBe('paused');
    });

    it('transitions in_progress → completed', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'T1' }] });
      workflowService.updateStatus(db, wf.id, 'in_progress');
      const updated = workflowService.updateStatus(db, wf.id, 'completed');
      expect(updated.status).toBe('completed');
    });

    it('transitions in_progress → failed', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'T1' }] });
      workflowService.updateStatus(db, wf.id, 'in_progress');
      const updated = workflowService.updateStatus(db, wf.id, 'failed');
      expect(updated.status).toBe('failed');
    });

    it('transitions failed → in_progress (retry)', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'T1' }] });
      workflowService.updateStatus(db, wf.id, 'in_progress');
      workflowService.updateStatus(db, wf.id, 'failed');
      const updated = workflowService.updateStatus(db, wf.id, 'in_progress');
      expect(updated.status).toBe('in_progress');
    });

    it('transitions paused → in_progress (resume)', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'T1' }] });
      workflowService.updateStatus(db, wf.id, 'in_progress');
      workflowService.updateStatus(db, wf.id, 'paused');
      const updated = workflowService.updateStatus(db, wf.id, 'in_progress');
      expect(updated.status).toBe('in_progress');
    });

    it('rejects invalid transitions from completed', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'T1' }] });
      workflowService.updateStatus(db, wf.id, 'in_progress');
      workflowService.updateStatus(db, wf.id, 'completed');
      expect(() => workflowService.updateStatus(db, wf.id, 'in_progress')).toThrow(
        'Invalid transition',
      );
    });

    it('rejects invalid transitions from abandoned', () => {
      const wf = createBasicWorkflow(db);
      workflowService.updateStatus(db, wf.id, 'abandoned');
      expect(() => workflowService.updateStatus(db, wf.id, 'in_progress')).toThrow(
        'Invalid transition',
      );
    });

    it('rejects invalid transition from planning to completed', () => {
      const wf = createBasicWorkflow(db);
      expect(() => workflowService.updateStatus(db, wf.id, 'completed')).toThrow(
        'Invalid transition',
      );
    });

    it('stores reason in config', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'T1' }] });
      workflowService.updateStatus(db, wf.id, 'in_progress');
      const updated = workflowService.updateStatus(db, wf.id, 'paused', 'Waiting for review');

      const config = JSON.parse(updated.config as string);
      expect(config.last_status_reason).toBe('Waiting for review');
    });

    it('preserves existing config when adding reason', () => {
      const wf = createBasicWorkflow(db, { config: { retries: 3 } });
      workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'T1' }] });
      workflowService.updateStatus(db, wf.id, 'in_progress');
      const updated = workflowService.updateStatus(db, wf.id, 'paused', 'Waiting');

      const config = JSON.parse(updated.config as string);
      expect(config.retries).toBe(3);
      expect(config.last_status_reason).toBe('Waiting');
    });

    it('throws when workflow not found', () => {
      expect(() => workflowService.updateStatus(db, 'wf_nonexistent', 'ready')).toThrow(
        'Workflow not found',
      );
    });

    it('updates the updated_at timestamp', () => {
      const wf = createBasicWorkflow(db);
      const updated = workflowService.updateStatus(db, wf.id, 'abandoned');
      expect(updated.updated_at).toBeGreaterThanOrEqual(wf.updated_at);
    });
  });

  // --- setParallelism ---

  describe('setParallelism', () => {
    it('updates max_parallel_tasks', () => {
      const wf = createBasicWorkflow(db);
      const updated = workflowService.setParallelism(db, wf.id, 4);
      expect(updated.max_parallel_tasks).toBe(4);
    });

    it('conditionally updates auto_create_workspaces', () => {
      const wf = createBasicWorkflow(db);
      const updated = workflowService.setParallelism(db, wf.id, 2, true);
      expect(updated.auto_create_workspaces).toBe(1);

      const updated2 = workflowService.setParallelism(db, wf.id, 3, false);
      expect(updated2.auto_create_workspaces).toBe(0);
    });

    it('does not change auto_create_workspaces when not provided', () => {
      const wf = createBasicWorkflow(db, { auto_create_workspaces: true });
      const updated = workflowService.setParallelism(db, wf.id, 4);
      expect(updated.auto_create_workspaces).toBe(1);
    });

    it('throws when workflow not found', () => {
      expect(() => workflowService.setParallelism(db, 'wf_nonexistent', 2)).toThrow(
        'Workflow not found',
      );
    });

    it('persists changes to database', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setParallelism(db, wf.id, 5, true);
      const fetched = workflowService.get(db, wf.id);
      expect(fetched?.max_parallel_tasks).toBe(5);
      expect(fetched?.auto_create_workspaces).toBe(1);
    });
  });

  // --- getSummary ---

  describe('getSummary', () => {
    it('returns JSON format summary', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Build feature X',
        tasks: [{ name: 'Setup' }, { name: 'Build' }],
      });

      const result = workflowService.getSummary(db, wf.id, 'json');
      const parsed = JSON.parse(result.summary);
      expect(parsed.name).toBe('Test Workflow');
      expect(parsed.status).toBe('ready');
      expect(parsed.total_tasks).toBe(2);
      expect(parsed.plan_summary).toBe('Build feature X');
      expect(parsed.tasks_by_status.pending).toBe(2);
    });

    it('returns markdown format summary', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Build feature X',
        tasks: [{ name: 'Setup' }],
      });

      const result = workflowService.getSummary(db, wf.id, 'markdown');
      expect(result.summary).toContain('# Test Workflow');
      expect(result.summary).toContain('**Status:** ready');
      expect(result.summary).toContain('**Tasks:** 1 total');
      expect(result.summary).toContain('Build feature X');
      expect(result.summary).toContain('- pending: 1');
    });

    it('estimates token count', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'T1' }],
      });

      const result = workflowService.getSummary(db, wf.id, 'json');
      expect(result.token_estimate).toBe(Math.ceil(result.summary.length / 4));
      expect(result.token_estimate).toBeGreaterThan(0);
    });

    it('throws when workflow not found', () => {
      expect(() => workflowService.getSummary(db, 'wf_nonexistent', 'json')).toThrow(
        'Workflow not found',
      );
    });

    it('handles workflow with no tasks', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, { summary: 'Empty', tasks: [] });

      const result = workflowService.getSummary(db, wf.id, 'json');
      const parsed = JSON.parse(result.summary);
      expect(parsed.total_tasks).toBe(0);
      expect(parsed.tasks_by_status).toEqual({});
    });
  });
});
