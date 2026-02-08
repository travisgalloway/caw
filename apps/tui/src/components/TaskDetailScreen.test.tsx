import { describe, expect, test } from 'bun:test';
import { TaskDetailScreen } from './TaskDetailScreen';

describe('TaskDetailScreen', () => {
  test('exports TaskDetailScreen as a function component', () => {
    expect(typeof TaskDetailScreen).toBe('function');
  });

  test('has the expected function name', () => {
    expect(TaskDetailScreen.name).toBe('TaskDetailScreen');
  });
});
