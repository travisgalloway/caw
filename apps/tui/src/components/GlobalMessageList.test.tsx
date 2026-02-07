import { describe, expect, test } from 'bun:test';
import { GlobalMessageList } from './GlobalMessageList';

describe('GlobalMessageList', () => {
  test('exports GlobalMessageList as a function component', () => {
    expect(typeof GlobalMessageList).toBe('function');
  });
});
