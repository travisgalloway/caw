import { describe, expect, test } from 'bun:test';
import { ScrollArea } from './ScrollArea';

describe('ScrollArea', () => {
  test('exports ScrollArea as a function component', () => {
    expect(typeof ScrollArea).toBe('function');
  });

  test('ScrollArea has the expected function name', () => {
    expect(ScrollArea.name).toBe('ScrollArea');
  });
});
