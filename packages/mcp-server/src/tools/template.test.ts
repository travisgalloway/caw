import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, workflowService } from '@caw/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../server';
import { getToolHandler, parseContent, parseError } from './__test-utils';

describe('template tools', () => {
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

  // --- template_create ---

  describe('template_create', () => {
    it('creates a template from definition', () => {
      const result = call('template_create', {
        name: 'My Template',
        template: {
          tasks: [{ name: 'Setup' }, { name: 'Build', depends_on: ['Setup'] }],
        },
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string };
      expect(data.id).toMatch(/^tmpl_/);
    });

    it('creates a template from an existing workflow', () => {
      const wf = workflowService.create(db, {
        name: 'Source WF',
        source_type: 'prompt',
        source_content: 'test',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'plan',
        tasks: [{ name: 'Task 1' }],
      });

      const result = call('template_create', {
        name: 'From Workflow',
        from_workflow_id: wf.id,
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string };
      expect(data.id).toMatch(/^tmpl_/);
    });

    it('returns INVALID_INPUT when both from_workflow_id and template provided', () => {
      const result = call('template_create', {
        name: 'Bad Template',
        from_workflow_id: 'wf_123',
        template: { tasks: [{ name: 'Task' }] },
      });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_INPUT');
      expect(err.recoverable).toBe(true);
    });

    it('returns INVALID_INPUT when neither from_workflow_id nor template provided', () => {
      const result = call('template_create', { name: 'Empty Template' });
      const err = parseError(result);
      expect(err.code).toBe('INVALID_INPUT');
      expect(err.recoverable).toBe(true);
    });

    it('returns WORKFLOW_NOT_FOUND for missing workflow', () => {
      const result = call('template_create', {
        name: 'Bad Ref',
        from_workflow_id: 'wf_nonexistent',
      });
      const err = parseError(result);
      expect(err.code).toBe('WORKFLOW_NOT_FOUND');
    });

    it('returns DUPLICATE_TEMPLATE for duplicate name', () => {
      call('template_create', {
        name: 'Unique Name',
        template: { tasks: [{ name: 'Task' }] },
      });
      const result = call('template_create', {
        name: 'Unique Name',
        template: { tasks: [{ name: 'Task' }] },
      });
      const err = parseError(result);
      expect(err.code).toBe('DUPLICATE_TEMPLATE');
      expect(err.recoverable).toBe(true);
    });
  });

  // --- template_list ---

  describe('template_list', () => {
    it('returns empty list when no templates', () => {
      const result = call('template_list', {});
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { templates: unknown[] };
      expect(data.templates).toEqual([]);
    });

    it('returns created templates', () => {
      call('template_create', {
        name: 'Template 1',
        template: { tasks: [{ name: 'Task' }] },
      });
      call('template_create', {
        name: 'Template 2',
        template: { tasks: [{ name: 'Task' }] },
      });

      const result = call('template_list', {});
      const data = parseContent(result) as { templates: unknown[] };
      expect(data.templates).toHaveLength(2);
    });
  });

  // --- template_apply ---

  describe('template_apply', () => {
    it('creates a workflow from a template', () => {
      const created = parseContent(
        call('template_create', {
          name: 'Apply Template',
          template: {
            tasks: [{ name: 'Setup' }, { name: 'Build', depends_on: ['Setup'] }],
          },
        }),
      ) as { id: string };

      const result = call('template_apply', {
        template_id: created.id,
        workflow_name: 'New Workflow',
      });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { workflow_id: string };
      expect(data.workflow_id).toMatch(/^wf_/);
    });

    it('returns TEMPLATE_NOT_FOUND for missing template', () => {
      const result = call('template_apply', {
        template_id: 'tmpl_nonexistent',
        workflow_name: 'Test',
      });
      const err = parseError(result);
      expect(err.code).toBe('TEMPLATE_NOT_FOUND');
      expect(err.recoverable).toBe(false);
    });

    it('returns MISSING_VARIABLES when required variables not provided', () => {
      const created = parseContent(
        call('template_create', {
          name: 'Vars Template',
          template: {
            tasks: [{ name: '{{component}} setup' }],
            variables: ['component'],
          },
        }),
      ) as { id: string };

      const result = call('template_apply', {
        template_id: created.id,
        workflow_name: 'Test',
      });
      const err = parseError(result);
      expect(err.code).toBe('MISSING_VARIABLES');
      expect(err.recoverable).toBe(true);
    });
  });
});
