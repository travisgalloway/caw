import { describe, expect, it } from 'bun:test';
import type { TaskDependency } from '@caw/core';
import { buildTaskTree, type RawTaskData } from './useTasks';

function task(overrides: Partial<RawTaskData> & { id: string; name: string }): RawTaskData {
  return {
    status: 'pending',
    sequence: 0,
    parallel_group: null,
    assigned_agent_id: null,
    ...overrides,
  };
}

function dep(taskId: string, dependsOnId: string): TaskDependency {
  return { task_id: taskId, depends_on_id: dependsOnId, dependency_type: 'blocks' };
}

function findNode(result: ReturnType<typeof buildTaskTree>, id: string) {
  const node = result.find((n) => n.id === id);
  expect(node).toBeDefined();
  return node;
}

describe('buildTaskTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildTaskTree([], [], new Map(), new Map())).toEqual([]);
  });

  it('builds a single task with no dependencies', () => {
    const tasks = [task({ id: 'tk_a', name: 'Task A' })];
    const result = buildTaskTree(tasks, [], new Map(), new Map());

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tk_a');
    expect(result[0].name).toBe('Task A');
    expect(result[0].depth).toBe(0);
    expect(result[0].blockedBy).toEqual([]);
  });

  it('calculates depth for linear chain A->B->C', () => {
    const tasks = [
      task({ id: 'tk_a', name: 'A', sequence: 0 }),
      task({ id: 'tk_b', name: 'B', sequence: 1 }),
      task({ id: 'tk_c', name: 'C', sequence: 2 }),
    ];
    const deps: TaskDependency[] = [
      dep('tk_b', 'tk_a'), // B is blocked by A
      dep('tk_c', 'tk_b'), // C is blocked by B
    ];

    const result = buildTaskTree(tasks, deps, new Map(), new Map());
    const byId = new Map(result.map((n) => [n.id, n]));

    expect(byId.get('tk_a')?.depth).toBe(0);
    expect(byId.get('tk_b')?.depth).toBe(1);
    expect(byId.get('tk_c')?.depth).toBe(2);
  });

  it('assigns depth 0 to parallel tasks with no dependencies', () => {
    const tasks = [
      task({ id: 'tk_a', name: 'A', sequence: 0 }),
      task({ id: 'tk_b', name: 'B', sequence: 1 }),
      task({ id: 'tk_c', name: 'C', sequence: 2 }),
    ];

    const result = buildTaskTree(tasks, [], new Map(), new Map());
    for (const node of result) {
      expect(node.depth).toBe(0);
    }
  });

  it('handles diamond dependency (A->B, A->C, B->D, C->D)', () => {
    const tasks = [
      task({ id: 'tk_a', name: 'A', sequence: 0 }),
      task({ id: 'tk_b', name: 'B', sequence: 1 }),
      task({ id: 'tk_c', name: 'C', sequence: 1 }),
      task({ id: 'tk_d', name: 'D', sequence: 2 }),
    ];
    const deps: TaskDependency[] = [
      dep('tk_b', 'tk_a'), // B blocked by A
      dep('tk_c', 'tk_a'), // C blocked by A
      dep('tk_d', 'tk_b'), // D blocked by B
      dep('tk_d', 'tk_c'), // D blocked by C
    ];

    const result = buildTaskTree(tasks, deps, new Map(), new Map());
    const byId = new Map(result.map((n) => [n.id, n]));

    expect(byId.get('tk_a')?.depth).toBe(0);
    expect(byId.get('tk_b')?.depth).toBe(1);
    expect(byId.get('tk_c')?.depth).toBe(1);
    expect(byId.get('tk_d')?.depth).toBe(2);
  });

  it('handles circular dependencies without infinite loop', () => {
    const tasks = [
      task({ id: 'tk_a', name: 'A', sequence: 0 }),
      task({ id: 'tk_b', name: 'B', sequence: 1 }),
    ];
    const deps: TaskDependency[] = [
      dep('tk_a', 'tk_b'), // A blocked by B
      dep('tk_b', 'tk_a'), // B blocked by A (circular)
    ];

    // Should not hang or throw
    const result = buildTaskTree(tasks, deps, new Map(), new Map());
    expect(result).toHaveLength(2);
  });

  it('detects incomplete blockers (pending dependencies)', () => {
    const tasks = [
      task({ id: 'tk_a', name: 'A', status: 'pending', sequence: 0 }),
      task({ id: 'tk_b', name: 'B', status: 'pending', sequence: 1 }),
    ];
    const deps: TaskDependency[] = [dep('tk_b', 'tk_a')];

    const result = buildTaskTree(tasks, deps, new Map(), new Map());
    const nodeB = findNode(result, 'tk_b');

    expect(nodeB?.blockedBy).toHaveLength(1);
    expect(nodeB?.blockedBy[0].id).toBe('tk_a');
    expect(nodeB?.blockedBy[0].status).toBe('pending');
  });

  it('excludes completed/skipped tasks from blockedBy', () => {
    const tasks = [
      task({ id: 'tk_a', name: 'A', status: 'completed', sequence: 0 }),
      task({ id: 'tk_b', name: 'B', status: 'pending', sequence: 1 }),
    ];
    const deps: TaskDependency[] = [dep('tk_b', 'tk_a')];

    const result = buildTaskTree(tasks, deps, new Map(), new Map());
    const nodeB = findNode(result, 'tk_b');

    expect(nodeB?.blockedBy).toHaveLength(0);
  });

  it('excludes skipped tasks from blockedBy', () => {
    const tasks = [
      task({ id: 'tk_a', name: 'A', status: 'skipped', sequence: 0 }),
      task({ id: 'tk_b', name: 'B', status: 'pending', sequence: 1 }),
    ];
    const deps: TaskDependency[] = [dep('tk_b', 'tk_a')];

    const result = buildTaskTree(tasks, deps, new Map(), new Map());
    const nodeB = findNode(result, 'tk_b');
    expect(nodeB?.blockedBy).toHaveLength(0);
  });

  it('sorts by sequence, then parallel_group, then name', () => {
    const tasks = [
      task({ id: 'tk_c', name: 'C', sequence: 1, parallel_group: 'g1' }),
      task({ id: 'tk_a', name: 'A', sequence: 0 }),
      task({ id: 'tk_b', name: 'B', sequence: 1, parallel_group: 'g1' }),
      task({ id: 'tk_d', name: 'D', sequence: 2 }),
    ];

    const result = buildTaskTree(tasks, [], new Map(), new Map());
    expect(result.map((n) => n.id)).toEqual(['tk_a', 'tk_b', 'tk_c', 'tk_d']);
  });

  it('marks last task in parallel group', () => {
    const tasks = [
      task({ id: 'tk_a', name: 'A', sequence: 0, parallel_group: 'g1' }),
      task({ id: 'tk_b', name: 'B', sequence: 0, parallel_group: 'g1' }),
    ];

    const result = buildTaskTree(tasks, [], new Map(), new Map());
    const nodeA = findNode(result, 'tk_a');
    const nodeB = findNode(result, 'tk_b');
    expect(nodeA?.isLastInGroup).toBe(false);
    expect(nodeB?.isLastInGroup).toBe(true);
  });

  it('non-group tasks have isLastInGroup = false', () => {
    const tasks = [task({ id: 'tk_a', name: 'A' })];
    const result = buildTaskTree(tasks, [], new Map(), new Map());
    expect(result[0].isLastInGroup).toBe(false);
  });

  it('maps agent names from agentNames map', () => {
    const tasks = [task({ id: 'tk_a', name: 'A', assigned_agent_id: 'ag_1' })];
    const agentNames = new Map([['ag_1', 'Claude']]);

    const result = buildTaskTree(tasks, [], agentNames, new Map());
    expect(result[0].agentName).toBe('Claude');
  });

  it('returns null agentName for unknown agent id', () => {
    const tasks = [task({ id: 'tk_a', name: 'A', assigned_agent_id: 'ag_unknown' })];

    const result = buildTaskTree(tasks, [], new Map(), new Map());
    expect(result[0].agentName).toBeNull();
  });

  it('returns null agentName when no agent assigned', () => {
    const tasks = [task({ id: 'tk_a', name: 'A', assigned_agent_id: null })];

    const result = buildTaskTree(tasks, [], new Map(), new Map());
    expect(result[0].agentName).toBeNull();
  });

  it('maps checkpoint counts from checkpointCounts map', () => {
    const tasks = [task({ id: 'tk_a', name: 'A' })];
    const checkpointCounts = new Map([['tk_a', 3]]);

    const result = buildTaskTree(tasks, [], new Map(), checkpointCounts);
    expect(result[0].checkpointCount).toBe(3);
  });

  it('defaults checkpoint count to 0 when not in map', () => {
    const tasks = [task({ id: 'tk_a', name: 'A' })];

    const result = buildTaskTree(tasks, [], new Map(), new Map());
    expect(result[0].checkpointCount).toBe(0);
  });

  it('ignores "informs" dependency type (only processes "blocks")', () => {
    const tasks = [
      task({ id: 'tk_a', name: 'A', sequence: 0 }),
      task({ id: 'tk_b', name: 'B', sequence: 1 }),
    ];
    const deps: TaskDependency[] = [
      { task_id: 'tk_b', depends_on_id: 'tk_a', dependency_type: 'informs' },
    ];

    const result = buildTaskTree(tasks, deps, new Map(), new Map());
    const nodeB = findNode(result, 'tk_b');

    expect(nodeB?.depth).toBe(0);
    expect(nodeB?.blockedBy).toHaveLength(0);
  });

  it('preserves task status in output', () => {
    const tasks = [
      task({ id: 'tk_a', name: 'A', status: 'in_progress' }),
      task({ id: 'tk_b', name: 'B', status: 'completed' }),
    ];

    const result = buildTaskTree(tasks, [], new Map(), new Map());
    const byId = new Map(result.map((n) => [n.id, n]));

    expect(byId.get('tk_a')?.status).toBe('in_progress');
    expect(byId.get('tk_b')?.status).toBe('completed');
  });
});
