import { describe, expect, test } from 'bun:test';
import type { DagEdge, DagNode } from './dagLayout';
import { assignLayers, layoutDag, orderLayers } from './dagLayout';

function node(id: string, name?: string): DagNode {
  return { id, name: name ?? id, status: 'pending' };
}

function edge(from: string, to: string, isBlocked = false): DagEdge {
  return { from, to, isBlocked };
}

describe('assignLayers', () => {
  test('single node gets layer 0', () => {
    const layers = assignLayers([node('a')], []);
    expect(layers.get('a')).toBe(0);
  });

  test('linear chain assigns sequential layers', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('a', 'b'), edge('b', 'c')];
    const layers = assignLayers(nodes, edges);
    expect(layers.get('a')).toBe(0);
    expect(layers.get('b')).toBe(1);
    expect(layers.get('c')).toBe(2);
  });

  test('diamond pattern assigns correct layers', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')];
    const layers = assignLayers(nodes, edges);
    expect(layers.get('a')).toBe(0);
    expect(layers.get('b')).toBe(1);
    expect(layers.get('c')).toBe(1);
    expect(layers.get('d')).toBe(2);
  });

  test('independent nodes all get layer 0', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const layers = assignLayers(nodes, []);
    expect(layers.get('a')).toBe(0);
    expect(layers.get('b')).toBe(0);
    expect(layers.get('c')).toBe(0);
  });

  test('empty input returns empty map', () => {
    const layers = assignLayers([], []);
    expect(layers.size).toBe(0);
  });
});

describe('orderLayers', () => {
  test('single layer preserves node order', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const layers = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 0],
    ]);
    const result = orderLayers(layers, [], nodes);
    expect(result.length).toBe(1);
    expect(result[0].length).toBe(3);
  });

  test('orders second layer by barycenter of predecessors', () => {
    // a -> c, b -> d
    // Layer 0: [a, b], Layer 1: [c, d]
    // c depends on a (position 0), d depends on b (position 1)
    // So order should be [c, d]
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const edges = [edge('a', 'c'), edge('b', 'd')];
    const layers = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 1],
      ['d', 1],
    ]);
    const result = orderLayers(layers, edges, nodes);
    expect(result[0]).toEqual(['a', 'b']);
    expect(result[1]).toEqual(['c', 'd']);
  });
});

describe('layoutDag', () => {
  test('empty nodes returns single-row grid', () => {
    const { grid, taskOrder, nodeRows } = layoutDag({ nodes: [], edges: [], width: 40 });
    expect(grid.length).toBe(1);
    expect(grid[0].length).toBe(40);
    expect(taskOrder).toEqual([]);
    expect(nodeRows.size).toBe(0);
  });

  test('single node renders a box', () => {
    const { grid, taskOrder, nodeRows } = layoutDag({
      nodes: [node('a', 'Task A')],
      edges: [],
      width: 40,
    });
    // Should have NODE_HEIGHT (3) rows
    expect(grid.length).toBe(3);

    // Check for box-drawing characters
    const topRow = grid[0].map((c) => c.char).join('');
    expect(topRow).toContain('┌');
    expect(topRow).toContain('┐');

    const midRow = grid[1].map((c) => c.char).join('');
    expect(midRow).toContain('Task A');
    expect(midRow).toContain('│');

    const botRow = grid[2].map((c) => c.char).join('');
    expect(botRow).toContain('└');
    expect(botRow).toContain('┘');

    // taskOrder and nodeRows
    expect(taskOrder).toEqual(['a']);
    expect(nodeRows.get('a')).toBe(0);
  });

  test('linear chain renders multiple layers with edge chars', () => {
    const { grid, taskOrder } = layoutDag({
      nodes: [node('a', 'First'), node('b', 'Second')],
      edges: [edge('a', 'b')],
      width: 40,
    });
    // 2 layers * 3 (node height) + 1 * 2 (edge space) = 8 rows
    expect(grid.length).toBe(8);

    // Check for edge drawing character (arrow or vertical line)
    const allChars = grid.flatMap((row) => row.map((c) => c.char));
    expect(allChars).toContain('▼');

    // taskOrder follows layer order
    expect(taskOrder).toEqual(['a', 'b']);
  });

  test('blocked edge uses red color', () => {
    const { grid } = layoutDag({
      nodes: [node('a', 'First'), node('b', 'Second')],
      edges: [edge('a', 'b', true)],
      width: 40,
    });
    // Find a cell with edge character and red color
    const redCells = grid.flatMap((row) => row.filter((c) => c.color === 'red'));
    expect(redCells.length).toBeGreaterThan(0);
  });

  test('node name truncation when width is tight', () => {
    const { grid } = layoutDag({
      nodes: [node('a', 'A very long task name that should be truncated')],
      edges: [],
      width: 20,
    });
    expect(grid.length).toBe(3);
    // Content row should contain truncation character
    const midRow = grid[1].map((c) => c.char).join('');
    expect(midRow).toContain('…');
  });

  test('diamond pattern renders all four nodes', () => {
    const { grid, taskOrder, nodeRows } = layoutDag({
      nodes: [node('a', 'Root'), node('b', 'Left'), node('c', 'Right'), node('d', 'Merge')],
      edges: [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')],
      width: 60,
    });
    // 3 layers * 3 + 2 * 2 = 13 rows
    expect(grid.length).toBe(13);

    // All node names should appear somewhere in the grid
    const allText = grid.map((row) => row.map((c) => c.char).join('')).join('\n');
    expect(allText).toContain('Root');
    expect(allText).toContain('Left');
    expect(allText).toContain('Right');
    expect(allText).toContain('Merge');

    // taskOrder: layer 0 = [a], layer 1 = [b, c], layer 2 = [d]
    expect(taskOrder).toEqual(['a', 'b', 'c', 'd']);
    // nodeRows should have entries for all four nodes
    expect(nodeRows.size).toBe(4);
    // Layer 0 starts at row 0, layer 1 at row 5, layer 2 at row 10
    expect(nodeRows.get('a')).toBe(0);
    expect(nodeRows.get('d')).toBe(10);
  });

  test('status color is applied to node borders', () => {
    const completedNode: DagNode = { id: 'a', name: 'Done', status: 'completed' };
    const { grid } = layoutDag({
      nodes: [completedNode],
      edges: [],
      width: 40,
    });
    // Border cells should have green color
    const topLeft = grid[0].find((c) => c.char === '┌');
    expect(topLeft?.color).toBe('green');
  });

  test('grid cells have nodeId set for node boxes', () => {
    const { grid } = layoutDag({
      nodes: [node('a', 'Task A')],
      edges: [],
      width: 40,
    });
    // Border cells should have nodeId
    const topLeft = grid[0].find((c) => c.char === '┌');
    expect(topLeft?.nodeId).toBe('a');
    // Content cells should have nodeId
    const contentCells = grid[1].filter((c) => c.nodeId === 'a');
    expect(contentCells.length).toBeGreaterThan(0);
    // Empty cells should have null nodeId
    const emptyCell = grid[0].find((c) => c.char === ' ');
    expect(emptyCell?.nodeId).toBeNull();
  });
});
