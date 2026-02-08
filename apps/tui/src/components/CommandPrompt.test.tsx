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

  test('renders error feedback with icon', () => {
    useAppStore.setState({ promptError: 'Unknown command' });
    const { lastFrame } = render(<CommandPrompt onSubmit={() => {}} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Unknown command');
    expect(frame).toContain('✗');
    useAppStore.setState({ promptError: null });
  });

  test('renders success feedback with icon', () => {
    useAppStore.setState({ promptSuccess: 'Data refreshed' });
    const { lastFrame } = render(<CommandPrompt onSubmit={() => {}} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Data refreshed');
    expect(frame).toContain('✓');
    useAppStore.setState({ promptSuccess: null });
  });

  test('renders prompt character', () => {
    const { lastFrame } = render(<CommandPrompt onSubmit={() => {}} />);
    expect(lastFrame() ?? '').toContain('❯');
  });

  test('renders separator line', () => {
    const { lastFrame } = render(<CommandPrompt onSubmit={() => {}} />);
    expect(lastFrame() ?? '').toContain('─');
  });

  test('clears feedback when clearPromptFeedback is called', () => {
    useAppStore.setState({ promptError: 'error', promptSuccess: 'success' });
    useAppStore.getState().clearPromptFeedback();
    const state = useAppStore.getState();
    expect(state.promptError).toBeNull();
    expect(state.promptSuccess).toBeNull();
  });
});
