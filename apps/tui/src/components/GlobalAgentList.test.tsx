import { describe, expect, test } from 'bun:test';
import { GlobalAgentList } from './GlobalAgentList';

describe('GlobalAgentList', () => {
  test('exports GlobalAgentList as a function component', () => {
    expect(typeof GlobalAgentList).toBe('function');
  });
});
