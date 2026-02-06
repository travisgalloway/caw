import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  test('renders full bar when all completed', () => {
    const { lastFrame } = render(<ProgressBar completed={5} total={5} width={10} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[5/5]');
    expect(frame).toContain('██████████');
  });

  test('renders empty bar when none completed', () => {
    const { lastFrame } = render(<ProgressBar completed={0} total={5} width={10} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[0/5]');
    expect(frame).toContain('░░░░░░░░░░');
  });

  test('renders partial bar', () => {
    const { lastFrame } = render(<ProgressBar completed={5} total={10} width={10} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[5/10]');
    expect(frame).toContain('█████');
    expect(frame).toContain('░░░░░');
  });

  test('handles total of 0 (empty bar)', () => {
    const { lastFrame } = render(<ProgressBar completed={0} total={0} width={10} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[0/0]');
    expect(frame).toContain('░░░░░░░░░░');
  });

  test('clamps ratio to 1 when completed > total', () => {
    const { lastFrame } = render(<ProgressBar completed={15} total={10} width={10} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[15/10]');
    expect(frame).toContain('██████████');
  });

  test('uses default width of 10 when not specified', () => {
    const { lastFrame } = render(<ProgressBar completed={5} total={10} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[5/10]');
  });
});
