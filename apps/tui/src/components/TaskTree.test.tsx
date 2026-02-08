import { describe, expect, test } from 'bun:test';
import { TaskTree } from './TaskTree';

describe('TaskTree', () => {
  test('exports TaskTree as a function component', () => {
    expect(typeof TaskTree).toBe('function');
  });

  test('has the expected function name', () => {
    expect(TaskTree.name).toBe('TaskTree');
  });
});
