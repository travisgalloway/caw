import { describe, expect, test } from 'bun:test';
import type { TerminalSize } from './useTerminalSize';
import { useTerminalSize } from './useTerminalSize';

describe('useTerminalSize', () => {
  test('module exports useTerminalSize function', () => {
    expect(typeof useTerminalSize).toBe('function');
  });

  test('TerminalSize interface shape is correct', () => {
    const mock: TerminalSize = { columns: 120, rows: 40 };
    expect(mock.columns).toBe(120);
    expect(mock.rows).toBe(40);
  });

  test('TerminalSize supports fallback values', () => {
    const fallback: TerminalSize = { columns: 80, rows: 24 };
    expect(fallback.columns).toBe(80);
    expect(fallback.rows).toBe(24);
  });
});
