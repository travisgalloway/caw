import { describe, expect, test } from 'bun:test';
import { SetupGuide } from './SetupGuide';

describe('SetupGuide', () => {
  test('exports SetupGuide as a function component', () => {
    expect(typeof SetupGuide).toBe('function');
  });

  test('SetupGuide has the expected function name', () => {
    expect(SetupGuide.name).toBe('SetupGuide');
  });
});
