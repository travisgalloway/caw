import { beforeEach, describe, expect, test } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations, taskService, workflowService } from '@caw/core';
import { render } from 'ink-testing-library';
import type React from 'react';
import { DbContext } from '../context/db';
import { TaskDependencyList } from './TaskDependencyList';

interface TestSetup {
  db: DatabaseType;
  workflowId: string;
  task1Id: string;
  task2Id: string;
  task3Id: string;
}

function setupTestData(): TestSetup {
  const db = createConnection(':memory:');
  runMigrations(db);

  // Create a workflow with dependent tasks
  const workflow = workflowService.create(db, {
    name: 'Test Workflow',
    source_type: 'prompt',
    source_content: 'Test workflow',
  });

  // Create a plan with three tasks: Task 1 -> Task 2 -> Task 3
  workflowService.setPlan(db, workflow.id, {
    summary: 'Test plan with dependencies',
    tasks: [
      { name: 'Task 1', description: 'First task' },
      { name: 'Task 2', description: 'Second task', depends_on: ['Task 1'] },
      { name: 'Task 3', description: 'Third task', depends_on: ['Task 2'] },
    ],
  });

  // Get the created tasks
  const tasks = db
    .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
    .all(workflow.id) as Array<{ id: string; name: string }>;

  return {
    db,
    workflowId: workflow.id,
    task1Id: tasks[0].id,
    task2Id: tasks[1].id,
    task3Id: tasks[2].id,
  };
}

function renderWithDb(component: React.ReactElement, db: DatabaseType): ReturnType<typeof render> {
  return render(<DbContext.Provider value={db}>{component}</DbContext.Provider>);
}

describe('TaskDependencyList', () => {
  let setup: TestSetup;

  beforeEach(() => {
    setup = setupTestData();
  });

  describe('empty state', () => {
    test('renders "No dependencies" for task with no upstream dependencies', () => {
      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={setup.task1Id} direction="dependsOn" onSelectTask={() => {}} />,
        setup.db,
      );
      expect(lastFrame()).toContain('No dependencies');
    });

    test('renders "Not blocking any tasks" for task with no downstream dependencies', () => {
      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={setup.task3Id} direction="blocks" onSelectTask={() => {}} />,
        setup.db,
      );
      expect(lastFrame()).toContain('Not blocking any tasks');
    });
  });

  describe('single dependency', () => {
    test('renders single upstream dependency', () => {
      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={setup.task2Id} direction="dependsOn" onSelectTask={() => {}} />,
        setup.db,
      );
      const output = lastFrame();
      expect(output).toContain('Task 1');
      expect(output).toContain(setup.task1Id);
    });

    test('renders single downstream dependency (blocking)', () => {
      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={setup.task2Id} direction="blocks" onSelectTask={() => {}} />,
        setup.db,
      );
      const output = lastFrame();
      expect(output).toContain('Task 3');
      expect(output).toContain(setup.task3Id);
    });
  });

  describe('multiple dependencies', () => {
    test('renders multiple upstream dependencies', () => {
      // Create a new workflow with a task that depends on both Task 1 and Task 2
      const workflow2 = workflowService.create(setup.db, {
        name: 'Test Workflow 2',
        source_type: 'prompt',
        source_content: 'Test workflow 2',
      });

      workflowService.setPlan(setup.db, workflow2.id, {
        summary: 'Test plan with multiple dependencies',
        tasks: [
          { name: 'Task A' },
          { name: 'Task B' },
          { name: 'Task C', depends_on: ['Task A', 'Task B'] },
        ],
      });

      const tasks = setup.db
        .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
        .all(workflow2.id) as Array<{ id: string; name: string }>;

      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={tasks[2].id} direction="dependsOn" onSelectTask={() => {}} />,
        setup.db,
      );
      const output = lastFrame();
      expect(output).toContain('Task A');
      expect(output).toContain('Task B');
    });

    test('renders multiple downstream dependencies (blocking)', () => {
      // Create a workflow where one task blocks multiple others
      const workflow3 = workflowService.create(setup.db, {
        name: 'Test Workflow 3',
        source_type: 'prompt',
        source_content: 'Test workflow 3',
      });

      workflowService.setPlan(setup.db, workflow3.id, {
        summary: 'Test plan where one task blocks many',
        tasks: [
          { name: 'Base Task' },
          { name: 'Dependent 1', depends_on: ['Base Task'] },
          { name: 'Dependent 2', depends_on: ['Base Task'] },
        ],
      });

      const tasks = setup.db
        .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
        .all(workflow3.id) as Array<{ id: string; name: string }>;

      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={tasks[0].id} direction="blocks" onSelectTask={() => {}} />,
        setup.db,
      );
      const output = lastFrame();
      // Base Task blocks both Dependent 1 and Dependent 2
      expect(output).toContain('Dependent 1');
      expect(output).toContain('Dependent 2');
    });
  });

  describe('status color coding', () => {
    test('renders completed status indicator', () => {
      // Update Task 1 to completed status (must follow state transitions: pending → planning → completed)
      taskService.updateStatus(setup.db, setup.task1Id, 'planning');
      taskService.updateStatus(setup.db, setup.task1Id, 'completed', {
        outcome: 'Task completed',
      });

      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={setup.task2Id} direction="dependsOn" onSelectTask={() => {}} />,
        setup.db,
      );
      const output = lastFrame();
      // StatusIndicator for completed tasks shows ✓
      expect(output).toContain('✓');
      expect(output).toContain('Task 1');
    });

    test('renders in_progress status indicator', () => {
      // Update Task 1 to in_progress (must follow state transitions: pending → planning → in_progress)
      taskService.updateStatus(setup.db, setup.task1Id, 'planning');
      taskService.updateStatus(setup.db, setup.task1Id, 'in_progress');

      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={setup.task2Id} direction="dependsOn" onSelectTask={() => {}} />,
        setup.db,
      );
      const output = lastFrame();
      // StatusIndicator for in_progress tasks shows ●
      expect(output).toContain('●');
      expect(output).toContain('Task 1');
    });

    test('renders failed status indicator', () => {
      // Update Task 1 to failed status (must follow: pending → planning → in_progress → failed)
      taskService.updateStatus(setup.db, setup.task1Id, 'planning');
      taskService.updateStatus(setup.db, setup.task1Id, 'in_progress');
      taskService.updateStatus(setup.db, setup.task1Id, 'failed', { error: 'Task failed' });

      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={setup.task2Id} direction="dependsOn" onSelectTask={() => {}} />,
        setup.db,
      );
      const output = lastFrame();
      // StatusIndicator for failed tasks shows ✗
      expect(output).toContain('✗');
      expect(output).toContain('Task 1');
    });

    test('renders planning status indicator', () => {
      // Update Task 1 to planning status (pending → planning)
      taskService.updateStatus(setup.db, setup.task1Id, 'planning');

      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={setup.task2Id} direction="dependsOn" onSelectTask={() => {}} />,
        setup.db,
      );
      const output = lastFrame();
      // StatusIndicator for planning tasks shows ◐
      expect(output).toContain('◐');
      expect(output).toContain('Task 1');
    });

    test('renders pending status indicator', () => {
      // Task 1 starts in pending status by default
      const { lastFrame } = renderWithDb(
        <TaskDependencyList taskId={setup.task2Id} direction="dependsOn" onSelectTask={() => {}} />,
        setup.db,
      );
      const output = lastFrame();
      // StatusIndicator for pending tasks shows ○
      expect(output).toContain('○');
      expect(output).toContain('Task 1');
    });
  });

  describe('component structure', () => {
    test('exports TaskDependencyList as a function component', () => {
      expect(typeof TaskDependencyList).toBe('function');
    });

    test('has the expected function name', () => {
      expect(TaskDependencyList.name).toBe('TaskDependencyList');
    });
  });
});
