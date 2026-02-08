import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { HelpView } from './HelpView';

describe('HelpView', () => {
  test('renders the help title', () => {
    const { lastFrame } = render(<HelpView />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Help');
  });

  test('renders navigation commands', () => {
    const { lastFrame } = render(<HelpView />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('/workflows');
    expect(frame).toContain('/back');
    expect(frame).toContain('/help');
    expect(frame).toContain('/quit');
  });

  test('renders tab commands for workflow detail', () => {
    const { lastFrame } = render(<HelpView />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('/tasks');
    expect(frame).toContain('/messages');
    expect(frame).toContain('/agents');
    expect(frame).toContain('/all');
  });

  test('renders task view commands', () => {
    const { lastFrame } = render(<HelpView />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('/table');
    expect(frame).toContain('/tree');
    expect(frame).toContain('/dag');
  });

  test('renders action commands', () => {
    const { lastFrame } = render(<HelpView />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('/refresh');
    expect(frame).toContain('/lock');
    expect(frame).toContain('/unlock');
    expect(frame).toContain('/resume');
    expect(frame).toContain('/unread');
  });

  test('renders keyboard shortcuts section', () => {
    const { lastFrame } = render(<HelpView />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Keyboard');
    expect(frame).toContain('Esc');
    expect(frame).toContain('navigate');
    expect(frame).toContain('Enter');
  });

  test('renders section headers', () => {
    const { lastFrame } = render(<HelpView />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Navigation');
    expect(frame).toContain('Task Views');
    expect(frame).toContain('Actions');
    expect(frame).toContain('Setup');
  });
});
