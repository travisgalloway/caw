import { describe, expect, test } from 'bun:test';
import type { Checkpoint } from '@caw/core';
import { render } from 'ink-testing-library';
import { CheckpointTimeline } from './CheckpointTimeline';

describe('CheckpointTimeline', () => {
  const mockCheckpoint = (
    id: string,
    sequence: number,
    type: Checkpoint['checkpoint_type'],
    summary: string,
    createdAt: number,
  ): Checkpoint => ({
    id,
    task_id: 'tk_test123',
    sequence,
    checkpoint_type: type,
    summary,
    detail: null,
    files_changed: null,
    created_at: createdAt,
  });

  test('renders empty state when no checkpoints', () => {
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('No checkpoints yet');
  });

  test('renders checkpoint with sequence number', () => {
    const checkpoint = mockCheckpoint('cp_1', 5, 'progress', 'Test checkpoint', Date.now());
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('#5');
  });

  test('renders checkpoint type badge - PLAN', () => {
    const checkpoint = mockCheckpoint('cp_1', 1, 'plan', 'Initial plan', Date.now());
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[PLAN]');
  });

  test('renders checkpoint type badge - PROGRESS', () => {
    const checkpoint = mockCheckpoint('cp_1', 2, 'progress', 'Making progress', Date.now());
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[PROGRESS]');
  });

  test('renders checkpoint type badge - DECISION', () => {
    const checkpoint = mockCheckpoint('cp_1', 3, 'decision', 'Made a choice', Date.now());
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[DECISION]');
  });

  test('renders checkpoint type badge - ERROR', () => {
    const checkpoint = mockCheckpoint('cp_1', 4, 'error', 'Something failed', Date.now());
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[ERROR]');
  });

  test('renders checkpoint type badge - RECOVERY', () => {
    const checkpoint = mockCheckpoint('cp_1', 5, 'recovery', 'Recovering from error', Date.now());
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[RECOVERY]');
  });

  test('renders checkpoint type badge - COMPLETE', () => {
    const checkpoint = mockCheckpoint('cp_1', 6, 'complete', 'Task done', Date.now());
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[COMPLETE]');
  });

  test('renders checkpoint type badge - REPLAN', () => {
    const checkpoint = mockCheckpoint('cp_1', 7, 'replan', 'Replanning', Date.now());
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[REPLAN]');
  });

  test('renders checkpoint summary', () => {
    const checkpoint = mockCheckpoint(
      'cp_1',
      1,
      'progress',
      'Successfully created file',
      Date.now(),
    );
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Successfully created file');
  });

  test('renders relative timestamp', () => {
    // Create a checkpoint from 5 minutes ago
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const checkpoint = mockCheckpoint('cp_1', 1, 'progress', 'Test', fiveMinutesAgo);
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('5m ago');
  });

  test('renders multiple checkpoints', () => {
    const checkpoints = [
      mockCheckpoint('cp_1', 1, 'plan', 'Initial plan', Date.now() - 10000),
      mockCheckpoint('cp_2', 2, 'progress', 'Making progress', Date.now() - 5000),
      mockCheckpoint('cp_3', 3, 'complete', 'Done', Date.now()),
    ];
    const { lastFrame } = render(<CheckpointTimeline checkpoints={checkpoints} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[PLAN]');
    expect(frame).toContain('[PROGRESS]');
    expect(frame).toContain('[COMPLETE]');
    expect(frame).toContain('Initial plan');
    expect(frame).toContain('Making progress');
    expect(frame).toContain('Done');
  });

  test('sorts checkpoints with most recent first', () => {
    const checkpoints = [
      mockCheckpoint('cp_1', 1, 'plan', 'First', Date.now()),
      mockCheckpoint('cp_2', 5, 'complete', 'Last', Date.now()),
      mockCheckpoint('cp_3', 3, 'progress', 'Middle', Date.now()),
    ];
    const { lastFrame } = render(<CheckpointTimeline checkpoints={checkpoints} />);
    const frame = lastFrame() ?? '';

    // Check that the sequence numbers appear in descending order
    const seq5Index = frame.indexOf('#5');
    const seq3Index = frame.indexOf('#3');
    const seq1Index = frame.indexOf('#1');

    expect(seq5Index).toBeLessThan(seq3Index);
    expect(seq3Index).toBeLessThan(seq1Index);
  });

  test('renders all fields together correctly', () => {
    const now = Date.now();
    const checkpoint = mockCheckpoint('cp_1', 42, 'error', 'Failed to compile', now - 120000);
    const { lastFrame } = render(<CheckpointTimeline checkpoints={[checkpoint]} />);
    const frame = lastFrame() ?? '';

    expect(frame).toContain('#42');
    expect(frame).toContain('[ERROR]');
    expect(frame).toContain('Failed to compile');
    expect(frame).toContain('2m ago');
  });
});
