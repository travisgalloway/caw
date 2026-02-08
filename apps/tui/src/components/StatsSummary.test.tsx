import { describe, expect, test } from 'bun:test';
import { StatsSummary } from './StatsSummary';

describe('StatsSummary', () => {
  test('exports StatsSummary as a function component', () => {
    expect(typeof StatsSummary).toBe('function');
  });

  test('StatsSummary has the expected function name', () => {
    expect(StatsSummary.name).toBe('StatsSummary');
  });
});
