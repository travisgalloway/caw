import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { useAppStore } from '../store';
import { CommandPrompt } from './CommandPrompt';

describe('CommandPrompt', () => {
  test('renders default prompt hint', () => {
    const { lastFrame } = render(<CommandPrompt onSubmit={() => {}} />);
    expect(lastFrame() ?? '').toContain('Type / for commands');
  });

  test('renders prompt value when set', () => {
    useAppStore.setState({ promptValue: '/help' });
    const { lastFrame } = render(<CommandPrompt onSubmit={() => {}} />);
    expect(lastFrame() ?? '').toContain('/help');
    useAppStore.setState({ promptValue: '' });
  });

  test('renders error feedback', () => {
    useAppStore.setState({ promptError: 'Unknown command' });
    const { lastFrame } = render(<CommandPrompt onSubmit={() => {}} />);
    expect(lastFrame() ?? '').toContain('Unknown command');
    useAppStore.setState({ promptError: null });
  });

  test('renders success feedback', () => {
    useAppStore.setState({ promptSuccess: 'Data refreshed' });
    const { lastFrame } = render(<CommandPrompt onSubmit={() => {}} />);
    expect(lastFrame() ?? '').toContain('Data refreshed');
    useAppStore.setState({ promptSuccess: null });
  });

  test('renders > prefix', () => {
    const { lastFrame } = render(<CommandPrompt onSubmit={() => {}} />);
    expect(lastFrame() ?? '').toContain('>');
  });
});
