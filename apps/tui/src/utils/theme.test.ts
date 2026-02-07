import { describe, expect, test } from 'bun:test';
import { horizontalRule, LOGO_LINES, VERSION } from './theme';

describe('theme', () => {
  test('LOGO_LINES has 3 lines', () => {
    expect(LOGO_LINES).toHaveLength(3);
  });

  test('horizontalRule returns correct width', () => {
    expect(horizontalRule(10)).toBe('──────────');
    expect(horizontalRule(10)).toHaveLength(10);
  });

  test('horizontalRule with zero width returns empty string', () => {
    expect(horizontalRule(0)).toBe('');
  });

  test('VERSION is a string', () => {
    expect(typeof VERSION).toBe('string');
  });
});
