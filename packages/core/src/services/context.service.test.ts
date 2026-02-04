import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { Task } from '../types/task';
import { estimateObjectTokens } from '../utils/tokens';
import * as checkpointService from './checkpoint.service';
import * as contextService from './context.service';
import * as taskService from './task.service';
import * as workflowService from './workflow.service';

interface TestData {
  workflowId: string;
  taskIds: string[];
}

function setupTestWorkflow(db: DatabaseType): TestData {
  const wf = workflowService.create(db, {
    name: 'Test Workflow',
    source_type: 'issue',
    source_content: 'Implement feature X with acceptance criteria A, B, C',
  });

  workflowService.setPlan(db, wf.id, {
    summary: 'Build feature X in three phases',
    tasks: [
      { name: 'Task 1: Setup', description: 'Initialize project structure' },
      { name: 'Task 2: Core', description: 'Implement core logic', depends_on: ['Task 1: Setup'] },
      {
        name: 'Task 3A: UI',
        description: 'Build UI components',
        parallel_group: 'phase3',
        depends_on: ['Task 2: Core'],
      },
      {
        name: 'Task 3B: API',
        description: 'Build API endpoints',
        parallel_group: 'phase3',
        depends_on: ['Task 2: Core'],
      },
    ],
  });

  const tasks = db
    .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence ASC')
    .all(wf.id) as Task[];

  return {
    workflowId: wf.id,
    taskIds: tasks.map((t) => t.id),
  };
}

describe('contextService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  describe('loadTaskContext', () => {
    it('returns result with all sections present', () => {
      const { taskIds } = setupTestWorkflow(db);
      const result = contextService.loadTaskContext(db, taskIds[0]);

      expect(result).toHaveProperty('workflow');
      expect(result).toHaveProperty('current_task');
      expect(result).toHaveProperty('prior_tasks');
      expect(result).toHaveProperty('token_estimate');
      expect(result.workflow).toBeDefined();
      expect(result.current_task).toBeDefined();
      expect(result.prior_tasks).toBeDefined();
      expect(typeof result.token_estimate).toBe('number');
    });

    it('throws when task not found', () => {
      expect(() => {
        contextService.loadTaskContext(db, 'tk_nonexistent');
      }).toThrow('Task not found: tk_nonexistent');
    });

    it('populates workflow context with source_summary and plan_summary', () => {
      const { taskIds } = setupTestWorkflow(db);
      const result = contextService.loadTaskContext(db, taskIds[0]);

      expect(result.workflow).toBeDefined();
      expect(result.workflow?.source_summary).toContain('Implement feature X');
      expect(result.workflow?.plan_summary).toBe('Build feature X in three phases');
    });

    it('includes current task checkpoints', () => {
      const { taskIds } = setupTestWorkflow(db);

      checkpointService.add(db, taskIds[0], {
        type: 'progress',
        summary: 'Set up structure',
      });

      const result = contextService.loadTaskContext(db, taskIds[0]);

      expect(result.current_task).toBeDefined();
      expect(result.current_task?.checkpoints).toHaveLength(1);
      expect(result.current_task?.checkpoints[0].summary).toBe('Set up structure');
    });

    it('compresses older checkpoints by stripping detail', () => {
      const { taskIds } = setupTestWorkflow(db);

      // Add 7 checkpoints (> default recent count of 5)
      for (let i = 1; i <= 7; i++) {
        checkpointService.add(db, taskIds[0], {
          type: 'progress',
          summary: `Step ${i}`,
          detail: { info: `detail ${i}` },
          filesChanged: [`file${i}.ts`],
        });
      }

      const result = contextService.loadTaskContext(db, taskIds[0]);
      const cps = result.current_task?.checkpoints;

      if (!cps) throw new Error('expected checkpoints');
      expect(cps).toHaveLength(7);
      // Older checkpoints (first 2) should have detail stripped
      expect(cps[0].detail).toBeNull();
      expect(cps[1].detail).toBeNull();
      // Recent checkpoints (last 5) should have detail preserved
      expect(cps[2].detail).not.toBeNull();
      expect(cps[6].detail).not.toBeNull();
    });

    it('preserves all checkpoint detail when all_checkpoints is true', () => {
      const { taskIds } = setupTestWorkflow(db);

      for (let i = 1; i <= 7; i++) {
        checkpointService.add(db, taskIds[0], {
          type: 'progress',
          summary: `Step ${i}`,
          detail: { info: `detail ${i}` },
        });
      }

      const result = contextService.loadTaskContext(db, taskIds[0], {
        include: { all_checkpoints: true },
      });
      const cps = result.current_task?.checkpoints;

      if (!cps) throw new Error('expected checkpoints');
      expect(cps).toHaveLength(7);
      // All checkpoints should have detail preserved
      for (const cp of cps) {
        expect(cp.detail).not.toBeNull();
      }
    });

    it('includes completed prior tasks with outcomes', () => {
      const { taskIds } = setupTestWorkflow(db);

      // Complete Task 1
      taskService.updateStatus(db, taskIds[0], 'planning');
      taskService.updateStatus(db, taskIds[0], 'in_progress');
      taskService.updateStatus(db, taskIds[0], 'completed', {
        outcome: 'Project structure initialized',
      });

      // Load context for Task 2
      const result = contextService.loadTaskContext(db, taskIds[1]);

      expect(result.prior_tasks).toBeDefined();
      expect(result.prior_tasks).toHaveLength(1);
      expect(result.prior_tasks?.[0].name).toBe('Task 1: Setup');
      expect(result.prior_tasks?.[0].outcome).toBe('Project structure initialized');
    });

    it('excludes prior tasks when flag is false', () => {
      const { taskIds } = setupTestWorkflow(db);

      taskService.updateStatus(db, taskIds[0], 'planning');
      taskService.updateStatus(db, taskIds[0], 'in_progress');
      taskService.updateStatus(db, taskIds[0], 'completed', {
        outcome: 'Done',
      });

      const result = contextService.loadTaskContext(db, taskIds[1], {
        include: { prior_tasks: false },
      });

      expect(result.prior_tasks).toBeUndefined();
    });

    it('lists sibling tasks in parallel group', () => {
      const { taskIds } = setupTestWorkflow(db);

      // Task 3A and 3B are in parallel_group 'phase3'
      // Load context for Task 3A (index 2), expect Task 3B (index 3) as sibling
      const result = contextService.loadTaskContext(db, taskIds[2]);

      expect(result.sibling_tasks).toBeDefined();
      expect(result.sibling_tasks).toHaveLength(1);
      expect(result.sibling_tasks?.[0].name).toBe('Task 3B: API');
    });

    it('returns undefined sibling_tasks when no parallel_group', () => {
      const { taskIds } = setupTestWorkflow(db);

      // Task 1 has no parallel_group
      const result = contextService.loadTaskContext(db, taskIds[0]);

      expect(result.sibling_tasks).toBeUndefined();
    });

    it('includes dependency outcomes', () => {
      const { taskIds } = setupTestWorkflow(db);

      // Complete Task 2's dependency (Task 1)
      taskService.updateStatus(db, taskIds[0], 'planning');
      taskService.updateStatus(db, taskIds[0], 'in_progress');
      taskService.updateStatus(db, taskIds[0], 'completed', {
        outcome: 'Setup complete',
      });

      // Load context for Task 2 (depends on Task 1)
      const result = contextService.loadTaskContext(db, taskIds[1]);

      expect(result.dependency_outcomes).toBeDefined();
      expect(result.dependency_outcomes).toHaveLength(1);
      expect(result.dependency_outcomes?.[0].name).toBe('Task 1: Setup');
      expect(result.dependency_outcomes?.[0].outcome).toBe('Setup complete');
    });

    it('truncates large source_content to fit budget', () => {
      const wf = workflowService.create(db, {
        name: 'Large Workflow',
        source_type: 'issue',
        source_content: 'a'.repeat(10000), // Very large content
      });

      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Task 1' }],
      });

      const tasks = db.prepare('SELECT * FROM tasks WHERE workflow_id = ?').all(wf.id) as Task[];

      const result = contextService.loadTaskContext(db, tasks[0].id);

      expect(result.workflow).toBeDefined();
      // Source summary should be truncated
      expect(result.workflow?.source_summary?.length).toBeLessThan(10000);
      expect(result.workflow?.source_summary).toContain('... [truncated]');
    });

    it('respects custom max_tokens for more aggressive compression', () => {
      const wf = workflowService.create(db, {
        name: 'Budget Workflow',
        source_type: 'issue',
        source_content: 'a'.repeat(5000),
      });

      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Task 1' }],
      });

      const tasks = db.prepare('SELECT * FROM tasks WHERE workflow_id = ?').all(wf.id) as Task[];

      const smallBudget = contextService.loadTaskContext(db, tasks[0].id, {
        max_tokens: 500,
      });

      const largeBudget = contextService.loadTaskContext(db, tasks[0].id, {
        max_tokens: 8000,
      });

      // Smaller budget should result in more compression
      expect(smallBudget.token_estimate).toBeLessThanOrEqual(largeBudget.token_estimate);
    });

    it('populates only requested sections via include flags', () => {
      const { taskIds } = setupTestWorkflow(db);

      const result = contextService.loadTaskContext(db, taskIds[0], {
        include: {
          workflow: false,
          current_task: true,
          prior_tasks: false,
          siblings: false,
          dependencies: false,
        },
      });

      expect(result.workflow).toBeUndefined();
      expect(result.current_task).toBeDefined();
      expect(result.prior_tasks).toBeUndefined();
      expect(result.sibling_tasks).toBeUndefined();
      expect(result.dependency_outcomes).toBeUndefined();
    });

    it('token_estimate roughly matches estimateObjectTokens of result', () => {
      const { taskIds } = setupTestWorkflow(db);

      checkpointService.add(db, taskIds[0], {
        type: 'progress',
        summary: 'Working on it',
      });

      const result = contextService.loadTaskContext(db, taskIds[0]);

      // The token_estimate is computed as sum of individual sections,
      // so it should be in the same ballpark as full object estimate
      const fullEstimate = estimateObjectTokens(result);
      // Allow reasonable variance (token_estimate counts sections individually)
      expect(result.token_estimate).toBeGreaterThan(0);
      expect(result.token_estimate).toBeLessThan(fullEstimate * 2);
    });
  });
});
