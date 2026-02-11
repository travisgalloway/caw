import { describe, expect, test } from 'bun:test';
import { MessageDetailScreen } from './MessageDetailScreen';

describe('MessageDetailScreen', () => {
  test('exports MessageDetailScreen as a function component', () => {
    expect(typeof MessageDetailScreen).toBe('function');
  });

  test('has the expected function name', () => {
    expect(MessageDetailScreen.name).toBe('MessageDetailScreen');
  });
});
