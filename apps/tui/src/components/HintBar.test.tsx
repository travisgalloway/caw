import { describe, expect, test } from 'bun:test';
import type { HintItem } from './HintBar';
import { HintBar } from './HintBar';

describe('HintBar', () => {
  test('exports HintBar as a function component', () => {
    expect(typeof HintBar).toBe('function');
  });

  test('HintBar has the expected function name', () => {
    expect(HintBar.name).toBe('HintBar');
  });

  test('HintItem type allows key and desc properties', () => {
    const item: HintItem = { key: 'Esc', desc: 'back' };
    expect(item.key).toBe('Esc');
    expect(item.desc).toBe('back');
  });
});
