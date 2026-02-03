import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { TemplateDefinition } from './template.service';
import * as templateService from './template.service';
import * as workflowService from './workflow.service';

function createBasicTemplate(db: DatabaseType, overrides?: Partial<templateService.CreateParams>) {
  return templateService.create(db, {
    name: 'Test Template',
    template: {
      tasks: [
        { name: 'Setup', description: 'Initial setup' },
        { name: 'Build', depends_on: ['Setup'] },
        { name: 'Test', depends_on: ['Build'] },
      ],
    },
    ...overrides,
  });
}

describe('templateService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- create ---

  describe('create', () => {
    it('creates a template from direct definition', () => {
      const tmpl = createBasicTemplate(db);

      expect(tmpl.id).toMatch(/^tmpl_[0-9a-z]{12}$/);
      expect(tmpl.name).toBe('Test Template');
      expect(tmpl.version).toBe(1);

      const parsed = JSON.parse(tmpl.template) as TemplateDefinition;
      expect(parsed.tasks).toHaveLength(3);
      expect(parsed.tasks[0].name).toBe('Setup');
    });

    it('sets description when provided', () => {
      const tmpl = createBasicTemplate(db, {
        description: 'A reusable template',
      });
      expect(tmpl.description).toBe('A reusable template');
    });

    it('defaults description to null', () => {
      const tmpl = createBasicTemplate(db);
      expect(tmpl.description).toBeNull();
    });

    it('creates a template from existing workflow', () => {
      const wf = workflowService.create(db, {
        name: 'Source Workflow',
        source_type: 'issue',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          { name: 'Setup', description: 'Do setup', parallel_group: 'init' },
          { name: 'Build', depends_on: ['Setup'] },
        ],
      });

      const tmpl = templateService.create(db, {
        name: 'From Workflow',
        fromWorkflowId: wf.id,
      });

      const parsed = JSON.parse(tmpl.template) as TemplateDefinition;
      expect(parsed.tasks).toHaveLength(2);
      expect(parsed.tasks[0].name).toBe('Setup');
      expect(parsed.tasks[0].description).toBe('Do setup');
      expect(parsed.tasks[0].parallel_group).toBe('init');
      expect(parsed.tasks[1].depends_on).toEqual(['Setup']);
    });

    it('captures estimated_complexity and files_likely_affected from workflow', () => {
      const wf = workflowService.create(db, {
        name: 'Source',
        source_type: 'issue',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [
          {
            name: 'Task',
            estimated_complexity: 'high',
            files_likely_affected: ['src/main.ts'],
          },
        ],
      });

      const tmpl = templateService.create(db, {
        name: 'With Context',
        fromWorkflowId: wf.id,
      });

      const parsed = JSON.parse(tmpl.template) as TemplateDefinition;
      expect(parsed.tasks[0].estimated_complexity).toBe('high');
      expect(parsed.tasks[0].files_likely_affected).toEqual(['src/main.ts']);
    });

    it('throws when providing both fromWorkflowId and template', () => {
      const wf = workflowService.create(db, {
        name: 'Source',
        source_type: 'issue',
      });

      expect(() =>
        templateService.create(db, {
          name: 'Bad',
          fromWorkflowId: wf.id,
          template: { tasks: [] },
        }),
      ).toThrow('Cannot provide both');
    });

    it('throws when providing neither fromWorkflowId nor template', () => {
      expect(() => templateService.create(db, { name: 'Bad' })).toThrow('Must provide either');
    });

    it('throws when workflow not found for fromWorkflowId', () => {
      expect(() =>
        templateService.create(db, {
          name: 'Bad',
          fromWorkflowId: 'wf_nonexistent',
        }),
      ).toThrow('Workflow not found');
    });

    it('throws on duplicate name', () => {
      createBasicTemplate(db);
      expect(() => createBasicTemplate(db)).toThrow('Template name already exists');
    });

    it('persists to database', () => {
      const tmpl = createBasicTemplate(db);
      const fetched = templateService.get(db, tmpl.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe('Test Template');
    });
  });

  // --- get ---

  describe('get', () => {
    it('returns template when found', () => {
      const tmpl = createBasicTemplate(db);
      const result = templateService.get(db, tmpl.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(tmpl.id);
    });

    it('returns null when not found', () => {
      const result = templateService.get(db, 'tmpl_nonexistent');
      expect(result).toBeNull();
    });
  });

  // --- list ---

  describe('list', () => {
    it('returns all templates', () => {
      createBasicTemplate(db, { name: 'Template A' });
      createBasicTemplate(db, { name: 'Template B' });

      const result = templateService.list(db);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no templates', () => {
      const result = templateService.list(db);
      expect(result).toEqual([]);
    });

    it('orders by name', () => {
      createBasicTemplate(db, { name: 'Zebra' });
      createBasicTemplate(db, { name: 'Alpha' });
      createBasicTemplate(db, { name: 'Middle' });

      const result = templateService.list(db);
      expect(result[0].name).toBe('Alpha');
      expect(result[1].name).toBe('Middle');
      expect(result[2].name).toBe('Zebra');
    });
  });

  // --- apply ---

  describe('apply', () => {
    it('creates a workflow from template', () => {
      const tmpl = createBasicTemplate(db);
      const result = templateService.apply(db, tmpl.id, {
        workflowName: 'My Workflow',
      });

      expect(result.workflow_id).toMatch(/^wf_[0-9a-z]{12}$/);

      const wf = workflowService.get(db, result.workflow_id, { includeTasks: true });
      expect(wf?.name).toBe('My Workflow');
      expect(wf?.status).toBe('ready');
      expect(wf?.tasks).toHaveLength(3);
    });

    it('creates tasks with correct dependencies', () => {
      const tmpl = createBasicTemplate(db);
      const result = templateService.apply(db, tmpl.id, {
        workflowName: 'My Workflow',
      });

      const wf = workflowService.get(db, result.workflow_id, { includeTasks: true });
      const tasks = wf?.tasks ?? [];
      const buildTask = tasks.find((t) => t.name === 'Build');

      const deps = db
        .prepare('SELECT * FROM task_dependencies WHERE task_id = ?')
        .all(buildTask?.id) as { depends_on_id: string }[];
      expect(deps).toHaveLength(1);

      const setupTask = tasks.find((t) => t.name === 'Setup');
      expect(deps[0].depends_on_id).toBe(setupTask?.id);
    });

    it('performs variable interpolation', () => {
      const tmpl = templateService.create(db, {
        name: 'Variable Template',
        template: {
          tasks: [
            {
              name: 'Setup {{component}}',
              description: 'Initialize {{component}} module',
            },
            {
              name: 'Test {{component}}',
              depends_on: ['Setup {{component}}'],
            },
          ],
          variables: ['component'],
        },
      });

      const result = templateService.apply(db, tmpl.id, {
        workflowName: 'Auth Workflow',
        variables: { component: 'auth' },
      });

      const wf = workflowService.get(db, result.workflow_id, { includeTasks: true });
      const tasks = wf?.tasks ?? [];
      expect(tasks[0].name).toBe('Setup auth');
      expect(tasks[0].description).toBe('Initialize auth module');
      expect(tasks[1].name).toBe('Test auth');
    });

    it('throws when required variables are missing', () => {
      const tmpl = templateService.create(db, {
        name: 'Var Template',
        template: {
          tasks: [{ name: 'Setup {{component}}' }],
          variables: ['component'],
        },
      });

      expect(() =>
        templateService.apply(db, tmpl.id, {
          workflowName: 'Workflow',
        }),
      ).toThrow('Missing required variables: component');
    });

    it('discovers variables from task content even without explicit variables list', () => {
      const tmpl = templateService.create(db, {
        name: 'Implicit Vars',
        template: {
          tasks: [{ name: 'Deploy to {{env}}', description: 'Deploy {{service}} to {{env}}' }],
        },
      });

      expect(() =>
        templateService.apply(db, tmpl.id, {
          workflowName: 'Workflow',
          variables: { env: 'staging' },
        }),
      ).toThrow('Missing required variables: service');
    });

    it('sets source_type to template and source_ref to template id', () => {
      const tmpl = createBasicTemplate(db);
      const result = templateService.apply(db, tmpl.id, {
        workflowName: 'Workflow',
      });

      const wf = workflowService.get(db, result.workflow_id);
      expect(wf?.source_type).toBe('template');
      expect(wf?.source_ref).toBe(tmpl.id);
    });

    it('associates repository when repoPath provided', () => {
      const tmpl = createBasicTemplate(db);
      const result = templateService.apply(db, tmpl.id, {
        workflowName: 'Workflow',
        repoPath: '/home/user/project',
      });

      const wf = workflowService.get(db, result.workflow_id);
      expect(wf?.repository_id).toMatch(/^rp_[0-9a-z]{12}$/);
    });

    it('sets maxParallel when provided', () => {
      const tmpl = createBasicTemplate(db);
      const result = templateService.apply(db, tmpl.id, {
        workflowName: 'Workflow',
        maxParallel: 4,
      });

      const wf = workflowService.get(db, result.workflow_id);
      expect(wf?.max_parallel_tasks).toBe(4);
    });

    it('throws when template not found', () => {
      expect(() =>
        templateService.apply(db, 'tmpl_nonexistent', {
          workflowName: 'Workflow',
        }),
      ).toThrow('Template not found');
    });

    it('is atomic — rolls back on error', () => {
      const tmpl = templateService.create(db, {
        name: 'Bad Template',
        template: {
          tasks: [{ name: 'Setup' }, { name: 'Build', depends_on: ['Nonexistent'] }],
        },
      });

      try {
        templateService.apply(db, tmpl.id, {
          workflowName: 'Workflow',
        });
      } catch {
        // expected
      }

      // No workflows should have been created
      const wfResult = workflowService.list(db);
      expect(wfResult.total).toBe(0);
    });
  });

  // --- updateVersion ---

  describe('updateVersion', () => {
    it('increments version and updates template', () => {
      const tmpl = createBasicTemplate(db);

      const newDef: TemplateDefinition = {
        tasks: [{ name: 'New Setup' }, { name: 'New Build', depends_on: ['New Setup'] }],
      };

      const updated = templateService.updateVersion(db, tmpl.id, newDef);
      expect(updated.version).toBe(2);

      const parsed = JSON.parse(updated.template) as TemplateDefinition;
      expect(parsed.tasks).toHaveLength(2);
      expect(parsed.tasks[0].name).toBe('New Setup');
    });

    it('updates updated_at timestamp', () => {
      const tmpl = createBasicTemplate(db);
      const updated = templateService.updateVersion(db, tmpl.id, { tasks: [] });
      expect(updated.updated_at).toBeGreaterThanOrEqual(tmpl.updated_at);
    });

    it('persists changes to database', () => {
      const tmpl = createBasicTemplate(db);
      templateService.updateVersion(db, tmpl.id, {
        tasks: [{ name: 'Updated' }],
      });

      const fetched = templateService.get(db, tmpl.id);
      expect(fetched?.version).toBe(2);

      const parsed = JSON.parse(fetched?.template as string) as TemplateDefinition;
      expect(parsed.tasks[0].name).toBe('Updated');
    });

    it('increments version on each update', () => {
      const tmpl = createBasicTemplate(db);
      templateService.updateVersion(db, tmpl.id, { tasks: [] });
      const v3 = templateService.updateVersion(db, tmpl.id, { tasks: [] });
      expect(v3.version).toBe(3);
    });

    it('throws when template not found', () => {
      expect(() => templateService.updateVersion(db, 'tmpl_nonexistent', { tasks: [] })).toThrow(
        'Template not found',
      );
    });
  });
});
