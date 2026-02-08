import { describe, expect, test } from 'bun:test';
import { SystemInfo } from './SystemInfo';

describe('SystemInfo', () => {
  test('exports SystemInfo as a function component', () => {
    expect(typeof SystemInfo).toBe('function');
  });

  test('SystemInfo has the expected function name', () => {
    expect(SystemInfo.name).toBe('SystemInfo');
  });
});
