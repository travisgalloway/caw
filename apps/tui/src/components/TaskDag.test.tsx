import { describe, expect, test } from 'bun:test';
import { TaskDag } from './TaskDag';

describe('TaskDag', () => {
  test('module exports TaskDag component', () => {
    expect(typeof TaskDag).toBe('function');
  });

  test('TaskDag has the expected function name', () => {
    expect(TaskDag.name).toBe('TaskDag');
  });
});
