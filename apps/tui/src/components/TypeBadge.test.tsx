import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { PriorityIndicator, TypeBadge } from './TypeBadge';

describe('TypeBadge', () => {
  test('renders TASK badge for task_assignment', () => {
    const { lastFrame } = render(<TypeBadge type="task_assignment" />);
    expect(lastFrame()).toContain('[TASK]');
  });

  test('renders STATUS badge for status_update', () => {
    const { lastFrame } = render(<TypeBadge type="status_update" />);
    expect(lastFrame()).toContain('[STATUS]');
  });

  test('renders QUERY badge for query', () => {
    const { lastFrame } = render(<TypeBadge type="query" />);
    expect(lastFrame()).toContain('[QUERY]');
  });

  test('renders REPLY badge for response', () => {
    const { lastFrame } = render(<TypeBadge type="response" />);
    expect(lastFrame()).toContain('[REPLY]');
  });

  test('renders BCAST badge for broadcast', () => {
    const { lastFrame } = render(<TypeBadge type="broadcast" />);
    expect(lastFrame()).toContain('[BCAST]');
  });

  test('renders uppercased type for unknown message type', () => {
    const { lastFrame } = render(<TypeBadge type="custom_type" />);
    expect(lastFrame()).toContain('[CUSTOM_TYPE]');
  });
});

describe('PriorityIndicator', () => {
  test('renders !! for urgent priority', () => {
    const { lastFrame } = render(<PriorityIndicator priority="urgent" />);
    expect(lastFrame()).toContain('!!');
  });

  test('renders ! for high priority', () => {
    const { lastFrame } = render(<PriorityIndicator priority="high" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('!');
    expect(frame).not.toContain('!!');
  });

  test('renders dot for low priority', () => {
    const { lastFrame } = render(<PriorityIndicator priority="low" />);
    expect(lastFrame()).toContain('·');
  });

  test('renders nothing for normal priority', () => {
    const { lastFrame } = render(<PriorityIndicator priority="normal" />);
    expect(lastFrame()).toBe('');
  });
});
