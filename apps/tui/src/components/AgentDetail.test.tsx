import { describe, expect, test } from 'bun:test';
import { AgentDetail } from './AgentDetail';

describe('AgentDetail', () => {
  test('exports AgentDetail as a function component', () => {
    expect(typeof AgentDetail).toBe('function');
  });

  test('has the expected function name', () => {
    expect(AgentDetail.name).toBe('AgentDetail');
  });
});
