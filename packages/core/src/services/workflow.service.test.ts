import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { Task } from '../types/task';
import * as agentService from './agent.service';
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

    it('auto-registers repositories from paths', () => {
      const wf = createBasicWorkflow(db, {
        repository_paths: ['/home/user/project'],
      });

      const repos = workflowService.listRepositories(db, wf.id);
      expect(repos).toHaveLength(1);
      expect(repos[0].path).toBe('/home/user/project');
    });

    it('registers multiple repositories', () => {
      const wf = createBasicWorkflow(db, {
        repository_paths: ['/repo/backend', '/repo/frontend'],
      });

      const repos = workflowService.listRepositories(db, wf.id);
      expect(repos).toHaveLength(2);
      const paths = repos.map((r) => r.path);
      expect(paths).toContain('/repo/backend');
      expect(paths).toContain('/repo/frontend');
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

    it('filters by repository_id via join table', () => {
      const repo = repositoryService.register(db, { path: '/project-a' });
      createBasicWorkflow(db, { name: 'WF1', repository_paths: ['/project-a'] });
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
      const wf1 = createBasicWorkflow(db, { name: 'WF1', repository_paths: ['/project-a'] });
      createBasicWorkflow(db, { name: 'WF2', repository_paths: ['/project-a'] });
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
      const buildTask = tasks.find((t) => t.name === 'Build');
      const setupTask = tasks.find((t) => t.name === 'Setup');
      if (!buildTask || !setupTask) throw new Error('expected Build and Setup tasks');

      const deps = db
        .prepare('SELECT * FROM task_dependencies WHERE task_id = ?')
        .all(buildTask.id) as {
        task_id: string;
        depends_on_id: string;
        dependency_type: string;
      }[];
      expect(deps).toHaveLength(1);
      expect(deps[0].depends_on_id).toBe(setupTask.id);
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

    it('sets repository_id on tasks with repository_path', () => {
      const wf = createBasicWorkflow(db);
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          { name: 'Backend', repository_path: '/repo/backend' },
          { name: 'Frontend', repository_path: '/repo/frontend' },
          { name: 'Shared' },
        ],
      });

      const result = workflowService.get(db, wf.id, { includeTasks: true });
      const tasks = result?.tasks ?? [];

      const backend = tasks.find((t) => t.name === 'Backend');
      const frontend = tasks.find((t) => t.name === 'Frontend');
      const shared = tasks.find((t) => t.name === 'Shared');

      expect(backend?.repository_id).toMatch(/^rp_/);
      expect(frontend?.repository_id).toMatch(/^rp_/);
      expect(backend?.repository_id).not.toBe(frontend?.repository_id);
      expect(shared?.repository_id).toBeNull();

      // Also auto-adds repos to workflow_repositories
      const repos = workflowService.listRepositories(db, wf.id);
      expect(repos).toHaveLength(2);
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

    it('includes repositories in JSON summary', () => {
      const wf = createBasicWorkflow(db, {
        repository_paths: ['/repo/backend', '/repo/frontend'],
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Multi-repo plan',
        tasks: [{ name: 'T1' }],
      });

      const result = workflowService.getSummary(db, wf.id, 'json');
      const parsed = JSON.parse(result.summary);
      expect(parsed.repositories).toHaveLength(2);
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

    it('includes repositories section in markdown summary', () => {
      const wf = createBasicWorkflow(db, {
        repository_paths: ['/repo/backend'],
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'T1' }],
      });

      const result = workflowService.getSummary(db, wf.id, 'markdown');
      expect(result.summary).toContain('## Repositories');
      expect(result.summary).toContain('/repo/backend');
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

  // --- addRepository ---

  describe('addRepository', () => {
    it('adds a repository to a workflow', () => {
      const wf = createBasicWorkflow(db);
      const wr = workflowService.addRepository(db, wf.id, { path: '/repo/new' });

      expect(wr.workflow_id).toBe(wf.id);
      expect(wr.repository_id).toMatch(/^rp_/);
      expect(wr.added_at).toBeGreaterThan(0);
    });

    it('returns existing association when re-adding same repo', () => {
      const wf = createBasicWorkflow(db);
      const first = workflowService.addRepository(db, wf.id, { path: '/repo/new' });
      const second = workflowService.addRepository(db, wf.id, { path: '/repo/new' });

      expect(second.repository_id).toBe(first.repository_id);
    });

    it('throws when workflow not found', () => {
      expect(() => {
        workflowService.addRepository(db, 'wf_nonexistent', { path: '/repo' });
      }).toThrow('Workflow not found');
    });

    it('shows up in listRepositories', () => {
      const wf = createBasicWorkflow(db);
      workflowService.addRepository(db, wf.id, { path: '/repo/a' });
      workflowService.addRepository(db, wf.id, { path: '/repo/b' });

      const repos = workflowService.listRepositories(db, wf.id);
      expect(repos).toHaveLength(2);
    });
  });

  // --- removeRepository ---

  describe('removeRepository', () => {
    it('removes a repository from a workflow', () => {
      const wf = createBasicWorkflow(db, {
        repository_paths: ['/repo/a', '/repo/b'],
      });

      const repos = workflowService.listRepositories(db, wf.id);
      expect(repos).toHaveLength(2);

      workflowService.removeRepository(db, wf.id, repos[0].id);

      const remaining = workflowService.listRepositories(db, wf.id);
      expect(remaining).toHaveLength(1);
    });

    it('throws when workflow not found', () => {
      expect(() => {
        workflowService.removeRepository(db, 'wf_nonexistent', 'rp_abc');
      }).toThrow('Workflow not found');
    });

    it('throws when tasks reference the repository', () => {
      const wf = createBasicWorkflow(db, {
        repository_paths: ['/repo/backend'],
      });

      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Backend task', repository_path: '/repo/backend' }],
      });

      const repos = workflowService.listRepositories(db, wf.id);
      expect(() => {
        workflowService.removeRepository(db, wf.id, repos[0].id);
      }).toThrow('Cannot remove repository');
    });
  });

  // --- listRepositories ---

  describe('listRepositories', () => {
    it('returns empty array for workflow with no repos', () => {
      const wf = createBasicWorkflow(db);
      const repos = workflowService.listRepositories(db, wf.id);
      expect(repos).toEqual([]);
    });

    it('returns repos with enriched data', () => {
      const wf = createBasicWorkflow(db, {
        repository_paths: ['/repo/backend'],
      });

      const repos = workflowService.listRepositories(db, wf.id);
      expect(repos).toHaveLength(1);
      expect(repos[0].id).toMatch(/^rp_/);
      expect(repos[0].path).toBe('/repo/backend');
      expect(repos[0].added_at).toBeGreaterThan(0);
    });

    it('orders by added_at', () => {
      const wf = createBasicWorkflow(db, {
        repository_paths: ['/repo/first'],
      });
      // Bump added_at so the second repo has a strictly later timestamp
      const repo2 = workflowService.addRepository(db, wf.id, { path: '/repo/second' });
      db.prepare('UPDATE workflow_repositories SET added_at = ? WHERE repository_id = ?').run(
        repo2.added_at + 1,
        repo2.repository_id,
      );

      const repos = workflowService.listRepositories(db, wf.id);
      expect(repos).toHaveLength(2);
      expect(repos[0].path).toBe('/repo/first');
      expect(repos[1].path).toBe('/repo/second');
    });
  });

  // --- addTask ---

  describe('addTask', () => {
    function createReadyWorkflow(
      database: DatabaseType,
      tasks: workflowService.PlanTask[] = [{ name: 'Task A' }, { name: 'Task B' }],
    ) {
      const wf = createBasicWorkflow(database);
      workflowService.setPlan(database, wf.id, { summary: 'Plan', tasks });
      return wf;
    }

    it('adds a task to a ready workflow', () => {
      const wf = createReadyWorkflow(db);
      const result = workflowService.addTask(db, wf.id, { name: 'Task C' });

      expect(result.task_id).toMatch(/^tk_/);
      expect(result.sequence).toBe(3);
      expect(result.workflow_id).toBe(wf.id);

      const fetched = workflowService.get(db, wf.id, { includeTasks: true });
      expect(fetched?.tasks).toHaveLength(3);
      expect(fetched?.tasks[2].name).toBe('Task C');
    });

    it('adds a task to an in_progress workflow', () => {
      const wf = createReadyWorkflow(db);
      workflowService.updateStatus(db, wf.id, 'in_progress');

      const result = workflowService.addTask(db, wf.id, { name: 'Task C' });
      expect(result.task_id).toMatch(/^tk_/);
    });

    it('adds a task to a paused workflow', () => {
      const wf = createReadyWorkflow(db);
      workflowService.updateStatus(db, wf.id, 'in_progress');
      workflowService.updateStatus(db, wf.id, 'paused');

      const result = workflowService.addTask(db, wf.id, { name: 'Task C' });
      expect(result.task_id).toMatch(/^tk_/);
    });

    it('inserts after specified task with sequence shift', () => {
      const wf = createReadyWorkflow(db, [
        { name: 'First' },
        { name: 'Second' },
        { name: 'Third' },
      ]);

      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      const firstTask = tasks.find((t) => t.name === 'First');

      const result = workflowService.addTask(db, wf.id, {
        name: 'Inserted',
        after_task: firstTask?.id,
      });
      expect(result.sequence).toBe(2);

      const updated = workflowService.get(db, wf.id, { includeTasks: true });
      const names = updated?.tasks.map((t) => t.name) ?? [];
      expect(names).toEqual(['First', 'Inserted', 'Second', 'Third']);
    });

    it('inserts after task by name', () => {
      const wf = createReadyWorkflow(db, [{ name: 'Alpha' }, { name: 'Beta' }]);

      const result = workflowService.addTask(db, wf.id, {
        name: 'Gamma',
        after_task: 'Alpha',
      });
      expect(result.sequence).toBe(2);
    });

    it('creates dependencies on existing tasks', () => {
      const wf = createReadyWorkflow(db, [{ name: 'Setup' }, { name: 'Build' }]);

      const result = workflowService.addTask(db, wf.id, {
        name: 'Deploy',
        depends_on: ['Build'],
      });

      const deps = db
        .prepare('SELECT * FROM task_dependencies WHERE task_id = ?')
        .all(result.task_id) as { depends_on_id: string }[];
      expect(deps).toHaveLength(1);

      const buildTask = workflowService
        .get(db, wf.id, { includeTasks: true })
        ?.tasks.find((t) => t.name === 'Build');
      expect(deps[0].depends_on_id).toBe(buildTask?.id ?? '');
    });

    it('creates dependencies using task ID (tk_ prefix)', () => {
      const wf = createReadyWorkflow(db, [{ name: 'Setup' }]);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];

      const result = workflowService.addTask(db, wf.id, {
        name: 'Build',
        depends_on: [tasks[0].id],
      });

      const deps = db
        .prepare('SELECT * FROM task_dependencies WHERE task_id = ?')
        .all(result.task_id) as { depends_on_id: string }[];
      expect(deps).toHaveLength(1);
      expect(deps[0].depends_on_id).toBe(tasks[0].id);
    });

    it('rejects duplicate name', () => {
      const wf = createReadyWorkflow(db);
      expect(() => {
        workflowService.addTask(db, wf.id, { name: 'Task A' });
      }).toThrow("Duplicate task name 'Task A' in workflow");
    });

    it('rejects terminal workflow status', () => {
      const wf = createBasicWorkflow(db);
      workflowService.updateStatus(db, wf.id, 'abandoned');
      expect(() => {
        workflowService.addTask(db, wf.id, { name: 'New' });
      }).toThrow('Cannot modify plan');
    });

    it('rejects self-dependency', () => {
      const wf = createReadyWorkflow(db);
      expect(() => {
        workflowService.addTask(db, wf.id, { name: 'Loop', depends_on: ['Loop'] });
      }).toThrow("Task 'Loop' cannot depend on itself");
    });

    it('rejects unknown dependency', () => {
      const wf = createReadyWorkflow(db);
      expect(() => {
        workflowService.addTask(db, wf.id, { name: 'New', depends_on: ['Nonexistent'] });
      }).toThrow("Unknown dependency 'Nonexistent'");
    });

    it('rejects unknown after_task', () => {
      const wf = createReadyWorkflow(db);
      expect(() => {
        workflowService.addTask(db, wf.id, { name: 'New', after_task: 'ghost' });
      }).toThrow("Task not found for after_task: 'ghost'");
    });

    it('updates workflow.updated_at', () => {
      const wf = createReadyWorkflow(db);
      const before = workflowService.get(db, wf.id)?.updated_at ?? 0;
      workflowService.addTask(db, wf.id, { name: 'Task C' });
      const after = workflowService.get(db, wf.id)?.updated_at ?? 0;
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  // --- removeTask ---

  describe('removeTask', () => {
    function createReadyWorkflow(
      database: DatabaseType,
      tasks: workflowService.PlanTask[] = [
        { name: 'A' },
        { name: 'B', depends_on: ['A'] },
        { name: 'C', depends_on: ['B'] },
      ],
    ) {
      const wf = createBasicWorkflow(database);
      workflowService.setPlan(database, wf.id, { summary: 'Plan', tasks });
      return wf;
    }

    it('removes a pending task', () => {
      const wf = createReadyWorkflow(db, [{ name: 'Solo' }]);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];

      const result = workflowService.removeTask(db, wf.id, tasks[0].id);
      expect(result.removed_task_id).toBe(tasks[0].id);

      const remaining = workflowService.get(db, wf.id, { includeTasks: true });
      expect(remaining?.tasks).toHaveLength(0);
    });

    it('re-wires dependencies: A→B→C becomes A→C when B removed', () => {
      const wf = createReadyWorkflow(db);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      const taskA = tasks.find((t) => t.name === 'A');
      const taskB = tasks.find((t) => t.name === 'B');
      const taskC = tasks.find((t) => t.name === 'C');

      const result = workflowService.removeTask(db, wf.id, taskB?.id ?? '');
      expect(result.dependencies_rewired).toBe(1);

      // C should now depend on A
      const deps = db
        .prepare('SELECT * FROM task_dependencies WHERE task_id = ?')
        .all(taskC?.id ?? '') as { depends_on_id: string }[];
      expect(deps).toHaveLength(1);
      expect(deps[0].depends_on_id).toBe(taskA?.id ?? '');
    });

    it('renumbers sequences after removal', () => {
      const wf = createReadyWorkflow(db, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      const taskA = tasks.find((t) => t.name === 'A');

      const result = workflowService.removeTask(db, wf.id, taskA?.id ?? '');
      expect(result.tasks_renumbered).toBe(2);

      const updated = workflowService.get(db, wf.id, { includeTasks: true });
      expect(updated?.tasks[0].sequence).toBe(1);
      expect(updated?.tasks[0].name).toBe('B');
      expect(updated?.tasks[1].sequence).toBe(2);
      expect(updated?.tasks[1].name).toBe('C');
    });

    it('rejects removal of in_progress task', () => {
      const wf = createReadyWorkflow(db, [{ name: 'Active' }]);
      workflowService.updateStatus(db, wf.id, 'in_progress');
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      db.prepare("UPDATE tasks SET status = 'in_progress' WHERE id = ?").run(tasks[0].id);

      expect(() => {
        workflowService.removeTask(db, wf.id, tasks[0].id);
      }).toThrow("Cannot remove task: status is 'in_progress'");
    });

    it('rejects removal of completed task', () => {
      const wf = createReadyWorkflow(db, [{ name: 'Done' }]);
      workflowService.updateStatus(db, wf.id, 'in_progress');
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(tasks[0].id);

      expect(() => {
        workflowService.removeTask(db, wf.id, tasks[0].id);
      }).toThrow("Cannot remove task: status is 'completed'");
    });

    it('rejects removal of claimed task', () => {
      const wf = createReadyWorkflow(db, [{ name: 'Claimed' }]);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      const agent = agentService.register(db, {
        name: 'test-agent',
        runtime: 'claude-code',
        workflow_id: wf.id,
      });
      db.prepare('UPDATE tasks SET assigned_agent_id = ? WHERE id = ?').run(agent.id, tasks[0].id);

      expect(() => {
        workflowService.removeTask(db, wf.id, tasks[0].id);
      }).toThrow('Cannot remove task: task is claimed by agent');
    });

    it('rejects removal from wrong workflow', () => {
      const wf = createReadyWorkflow(db, [{ name: 'A' }]);
      expect(() => {
        workflowService.removeTask(db, wf.id, 'tk_nonexistent');
      }).toThrow('Task not found');
    });

    it('rejects removal from terminal workflow status', () => {
      const wf = createBasicWorkflow(db);
      workflowService.updateStatus(db, wf.id, 'abandoned');
      expect(() => {
        workflowService.removeTask(db, wf.id, 'tk_anything');
      }).toThrow('Cannot modify plan');
    });

    it('updates workflow.updated_at', () => {
      const wf = createReadyWorkflow(db, [{ name: 'X' }]);
      const before = workflowService.get(db, wf.id)?.updated_at ?? 0;
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      workflowService.removeTask(db, wf.id, tasks[0].id);
      const after = workflowService.get(db, wf.id)?.updated_at ?? 0;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('cleans up checkpoints for removed task', () => {
      const wf = createReadyWorkflow(db, [{ name: 'A' }]);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];

      // Add a checkpoint directly
      db.prepare(
        "INSERT INTO checkpoints (id, task_id, sequence, checkpoint_type, summary, created_at) VALUES ('cp_test12345678', ?, 1, 'progress', 'test', ?)",
      ).run(tasks[0].id, Date.now());

      workflowService.removeTask(db, wf.id, tasks[0].id);

      const cps = db.prepare('SELECT * FROM checkpoints WHERE task_id = ?').all(tasks[0].id);
      expect(cps).toHaveLength(0);
    });
  });

  // --- replan ---

  describe('replan', () => {
    function createInProgressWorkflow(
      database: DatabaseType,
      tasks: workflowService.PlanTask[] = [
        { name: 'Setup' },
        { name: 'Build', depends_on: ['Setup'] },
        { name: 'Test', depends_on: ['Build'] },
        { name: 'Deploy', depends_on: ['Test'] },
      ],
    ) {
      const wf = createBasicWorkflow(database);
      workflowService.setPlan(database, wf.id, { summary: 'Original plan', tasks });
      workflowService.updateStatus(database, wf.id, 'in_progress');
      return wf;
    }

    it('replans in_progress workflow: removes pending, adds new, preserves completed', () => {
      const wf = createInProgressWorkflow(db);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];

      // Mark Setup as completed
      const setupTask = tasks.find((t) => t.name === 'Setup');
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(setupTask?.id ?? '');

      const result = workflowService.replan(db, wf.id, {
        summary: 'Revised plan',
        reason: 'Requirements changed',
        tasks: [
          { name: 'New Build', depends_on: ['Setup'] },
          { name: 'New Test', depends_on: ['New Build'] },
        ],
      });

      expect(result.workflow_id).toBe(wf.id);
      expect(result.tasks_preserved).toBe(1); // Setup
      expect(result.tasks_removed).toBe(3); // Build, Test, Deploy
      expect(result.tasks_added).toBe(2); // New Build, New Test
      expect(result.new_status).toBe('in_progress');

      const updated = workflowService.get(db, wf.id, { includeTasks: true });
      expect(updated?.tasks).toHaveLength(3);
      expect(updated?.plan_summary).toBe('Revised plan');
    });

    it('new tasks can depend on preserved tasks by name', () => {
      const wf = createInProgressWorkflow(db);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      const setupTask = tasks.find((t) => t.name === 'Setup');
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(setupTask?.id ?? '');

      workflowService.replan(db, wf.id, {
        summary: 'Depends on preserved',
        reason: 'test',
        tasks: [{ name: 'Rebuild', depends_on: ['Setup'] }],
      });

      const updatedTasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      const rebuild = updatedTasks.find((t) => t.name === 'Rebuild');

      const deps = db
        .prepare('SELECT * FROM task_dependencies WHERE task_id = ?')
        .all(rebuild?.id ?? '') as { depends_on_id: string }[];
      expect(deps).toHaveLength(1);
      expect(deps[0].depends_on_id).toBe(setupTask?.id ?? '');
    });

    it('rejects name collision with preserved task', () => {
      const wf = createInProgressWorkflow(db);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      const setupTask = tasks.find((t) => t.name === 'Setup');
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(setupTask?.id ?? '');

      expect(() => {
        workflowService.replan(db, wf.id, {
          summary: 'Collision',
          reason: 'test',
          tasks: [{ name: 'Setup' }], // collides with preserved
        });
      }).toThrow("Task name 'Setup' conflicts with a preserved task");
    });

    it('rejects unknown dependency', () => {
      const wf = createInProgressWorkflow(db);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(tasks[0].id);

      expect(() => {
        workflowService.replan(db, wf.id, {
          summary: 'Bad dep',
          reason: 'test',
          tasks: [{ name: 'New', depends_on: ['Ghost'] }],
        });
      }).toThrow("Unknown dependency 'Ghost'");
    });

    it('rejects terminal workflow status', () => {
      const wf = createBasicWorkflow(db);
      workflowService.updateStatus(db, wf.id, 'abandoned');

      expect(() => {
        workflowService.replan(db, wf.id, {
          summary: 'x',
          reason: 'x',
          tasks: [],
        });
      }).toThrow('Cannot modify plan');
    });

    it('empty new task list removes all pending tasks', () => {
      const wf = createInProgressWorkflow(db);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      const setupTask = tasks.find((t) => t.name === 'Setup');
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(setupTask?.id ?? '');

      const result = workflowService.replan(db, wf.id, {
        summary: 'Cleared',
        reason: 'test',
        tasks: [],
      });

      expect(result.tasks_removed).toBe(3);
      expect(result.tasks_added).toBe(0);
      expect(result.tasks_preserved).toBe(1);

      const updated = workflowService.get(db, wf.id, { includeTasks: true });
      expect(updated?.tasks).toHaveLength(1);
      expect(updated?.tasks[0].name).toBe('Setup');
    });

    it('updates plan_summary and appends to config.replan_history', () => {
      const wf = createInProgressWorkflow(db);

      workflowService.replan(db, wf.id, {
        summary: 'New direction',
        reason: 'Customer feedback',
        tasks: [],
      });

      const updated = workflowService.get(db, wf.id);
      expect(updated?.plan_summary).toBe('New direction');

      const config = JSON.parse(updated?.config as string);
      expect(config.replan_history).toHaveLength(1);
      expect(config.replan_history[0].summary).toBe('New direction');
      expect(config.replan_history[0].reason).toBe('Customer feedback');
    });

    it('preserves tasks claimed by agent regardless of status', () => {
      const wf = createInProgressWorkflow(db, [{ name: 'ClaimedPending' }]);
      const tasks = workflowService.get(db, wf.id, { includeTasks: true })?.tasks ?? [];
      const agent = agentService.register(db, {
        name: 'test-agent',
        runtime: 'claude-code',
        workflow_id: wf.id,
      });
      db.prepare('UPDATE tasks SET assigned_agent_id = ? WHERE id = ?').run(agent.id, tasks[0].id);

      const result = workflowService.replan(db, wf.id, {
        summary: 'Replan around claimed',
        reason: 'test',
        tasks: [],
      });

      expect(result.tasks_preserved).toBe(1);
      expect(result.tasks_removed).toBe(0);
    });
  });
});
