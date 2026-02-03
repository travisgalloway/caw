import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { Task } from '../types/task';
import * as checkpointService from './checkpoint.service';
import * as workflowService from './workflow.service';

function setupWorkflowWithTask(db: DatabaseType): { workflowId: string; taskId: string } {
  const wf = workflowService.create(db, {
    name: 'Test Workflow',
    source_type: 'issue',
  });
  workflowService.setPlan(db, wf.id, {
    summary: 'Test plan',
    tasks: [{ name: 'Task A' }],
  });
  const tasks = db.prepare('SELECT * FROM tasks WHERE workflow_id = ?').all(wf.id) as Task[];
  return { workflowId: wf.id, taskId: tasks[0].id };
}

describe('checkpointService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- add ---

  describe('add', () => {
    it('creates a checkpoint with auto-incrementing sequence', () => {
      const { taskId } = setupWorkflowWithTask(db);

      const cp1 = checkpointService.add(db, taskId, {
        type: 'progress',
        summary: 'First checkpoint',
      });
      expect(cp1.id).toMatch(/^cp_[0-9a-z]{12}$/);
      expect(cp1.sequence).toBe(1);

      const cp2 = checkpointService.add(db, taskId, {
        type: 'progress',
        summary: 'Second checkpoint',
      });
      expect(cp2.sequence).toBe(2);

      const cp3 = checkpointService.add(db, taskId, {
        type: 'complete',
        summary: 'Third checkpoint',
      });
      expect(cp3.sequence).toBe(3);
    });

    it('serializes detail as JSON', () => {
      const { taskId } = setupWorkflowWithTask(db);

      checkpointService.add(db, taskId, {
        type: 'decision',
        summary: 'Chose approach A',
        detail: { options: ['A', 'B'], rationale: 'simpler' },
      });

      const checkpoints = checkpointService.list(db, taskId);
      expect(checkpoints).toHaveLength(1);
      const detail = JSON.parse(checkpoints[0].detail as string);
      expect(detail.options).toEqual(['A', 'B']);
      expect(detail.rationale).toBe('simpler');
    });

    it('serializes filesChanged as JSON', () => {
      const { taskId } = setupWorkflowWithTask(db);

      checkpointService.add(db, taskId, {
        type: 'progress',
        summary: 'Modified files',
        filesChanged: ['src/main.ts', 'src/utils.ts'],
      });

      const checkpoints = checkpointService.list(db, taskId);
      const files = JSON.parse(checkpoints[0].files_changed as string);
      expect(files).toEqual(['src/main.ts', 'src/utils.ts']);
    });

    it('stores null for optional fields when not provided', () => {
      const { taskId } = setupWorkflowWithTask(db);

      checkpointService.add(db, taskId, {
        type: 'progress',
        summary: 'Simple checkpoint',
      });

      const checkpoints = checkpointService.list(db, taskId);
      expect(checkpoints[0].detail).toBeNull();
      expect(checkpoints[0].files_changed).toBeNull();
    });

    it('throws when task not found', () => {
      expect(() => {
        checkpointService.add(db, 'tk_nonexistent', {
          type: 'progress',
          summary: 'Should fail',
        });
      }).toThrow('Task not found: tk_nonexistent');
    });

    it('sequences are scoped per task', () => {
      const wf = workflowService.create(db, {
        name: 'Multi-task Workflow',
        source_type: 'issue',
      });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Task A' }, { name: 'Task B' }],
      });
      const tasks = db.prepare('SELECT * FROM tasks WHERE workflow_id = ?').all(wf.id) as Task[];

      const cp1 = checkpointService.add(db, tasks[0].id, {
        type: 'progress',
        summary: 'A checkpoint',
      });
      const cp2 = checkpointService.add(db, tasks[1].id, {
        type: 'progress',
        summary: 'B checkpoint',
      });

      expect(cp1.sequence).toBe(1);
      expect(cp2.sequence).toBe(1);
    });
  });

  // --- list ---

  describe('list', () => {
    it('returns checkpoints in sequence order', () => {
      const { taskId } = setupWorkflowWithTask(db);

      checkpointService.add(db, taskId, { type: 'plan', summary: 'Planned' });
      checkpointService.add(db, taskId, { type: 'progress', summary: 'Working' });
      checkpointService.add(db, taskId, { type: 'complete', summary: 'Done' });

      const checkpoints = checkpointService.list(db, taskId);
      expect(checkpoints).toHaveLength(3);
      expect(checkpoints[0].sequence).toBe(1);
      expect(checkpoints[0].checkpoint_type).toBe('plan');
      expect(checkpoints[1].sequence).toBe(2);
      expect(checkpoints[2].sequence).toBe(3);
    });

    it('returns empty array when no checkpoints', () => {
      const { taskId } = setupWorkflowWithTask(db);
      const checkpoints = checkpointService.list(db, taskId);
      expect(checkpoints).toEqual([]);
    });

    it('filters by checkpoint type', () => {
      const { taskId } = setupWorkflowWithTask(db);

      checkpointService.add(db, taskId, { type: 'plan', summary: 'Planned' });
      checkpointService.add(db, taskId, { type: 'progress', summary: 'Working' });
      checkpointService.add(db, taskId, { type: 'error', summary: 'Error' });
      checkpointService.add(db, taskId, { type: 'progress', summary: 'Resumed' });

      const progress = checkpointService.list(db, taskId, { types: ['progress'] });
      expect(progress).toHaveLength(2);
      expect(progress[0].summary).toBe('Working');
      expect(progress[1].summary).toBe('Resumed');
    });

    it('filters by multiple types', () => {
      const { taskId } = setupWorkflowWithTask(db);

      checkpointService.add(db, taskId, { type: 'plan', summary: 'Planned' });
      checkpointService.add(db, taskId, { type: 'progress', summary: 'Working' });
      checkpointService.add(db, taskId, { type: 'error', summary: 'Error' });

      const filtered = checkpointService.list(db, taskId, { types: ['plan', 'error'] });
      expect(filtered).toHaveLength(2);
      expect(filtered[0].checkpoint_type).toBe('plan');
      expect(filtered[1].checkpoint_type).toBe('error');
    });

    it('filters by since_sequence', () => {
      const { taskId } = setupWorkflowWithTask(db);

      checkpointService.add(db, taskId, { type: 'plan', summary: 'Planned' });
      checkpointService.add(db, taskId, { type: 'progress', summary: 'Working' });
      checkpointService.add(db, taskId, { type: 'complete', summary: 'Done' });

      const since = checkpointService.list(db, taskId, { since_sequence: 1 });
      expect(since).toHaveLength(2);
      expect(since[0].sequence).toBe(2);
      expect(since[1].sequence).toBe(3);
    });

    it('applies limit', () => {
      const { taskId } = setupWorkflowWithTask(db);

      for (let i = 0; i < 5; i++) {
        checkpointService.add(db, taskId, { type: 'progress', summary: `Step ${i}` });
      }

      const limited = checkpointService.list(db, taskId, { limit: 2 });
      expect(limited).toHaveLength(2);
      expect(limited[0].sequence).toBe(1);
      expect(limited[1].sequence).toBe(2);
    });

    it('combines filters', () => {
      const { taskId } = setupWorkflowWithTask(db);

      checkpointService.add(db, taskId, { type: 'plan', summary: 'Planned' });
      checkpointService.add(db, taskId, { type: 'progress', summary: 'Step 1' });
      checkpointService.add(db, taskId, { type: 'progress', summary: 'Step 2' });
      checkpointService.add(db, taskId, { type: 'progress', summary: 'Step 3' });
      checkpointService.add(db, taskId, { type: 'complete', summary: 'Done' });

      const filtered = checkpointService.list(db, taskId, {
        types: ['progress'],
        since_sequence: 2,
        limit: 1,
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].summary).toBe('Step 2');
    });
  });
});
