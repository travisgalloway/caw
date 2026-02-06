import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { StatusIndicator } from './StatusIndicator';

describe('StatusIndicator', () => {
  describe('workflow statuses', () => {
    test('renders for in_progress', () => {
      const { lastFrame } = render(<StatusIndicator kind="workflow" status="in_progress" />);
      expect(lastFrame()).toContain('●');
    });

    test('renders for paused', () => {
      const { lastFrame } = render(<StatusIndicator kind="workflow" status="paused" />);
      expect(lastFrame()).toContain('◐');
    });

    test('renders for completed', () => {
      const { lastFrame } = render(<StatusIndicator kind="workflow" status="completed" />);
      expect(lastFrame()).toContain('✓');
    });

    test('renders for failed', () => {
      const { lastFrame } = render(<StatusIndicator kind="workflow" status="failed" />);
      expect(lastFrame()).toContain('✗');
    });

    test('renders for abandoned', () => {
      const { lastFrame } = render(<StatusIndicator kind="workflow" status="abandoned" />);
      expect(lastFrame()).toContain('○');
    });

    test('renders for planning', () => {
      const { lastFrame } = render(<StatusIndicator kind="workflow" status="planning" />);
      expect(lastFrame()).toContain('○');
    });

    test('renders for ready', () => {
      const { lastFrame } = render(<StatusIndicator kind="workflow" status="ready" />);
      expect(lastFrame()).toContain('○');
    });
  });

  describe('agent statuses', () => {
    test('renders for online', () => {
      const { lastFrame } = render(<StatusIndicator kind="agent" status="online" />);
      expect(lastFrame()).toContain('●');
    });

    test('renders for busy', () => {
      const { lastFrame } = render(<StatusIndicator kind="agent" status="busy" />);
      expect(lastFrame()).toContain('●');
    });

    test('renders for offline', () => {
      const { lastFrame } = render(<StatusIndicator kind="agent" status="offline" />);
      expect(lastFrame()).toContain('○');
    });
  });

  describe('task statuses', () => {
    test('renders for completed', () => {
      const { lastFrame } = render(<StatusIndicator kind="task" status="completed" />);
      expect(lastFrame()).toContain('✓');
    });

    test('renders for in_progress', () => {
      const { lastFrame } = render(<StatusIndicator kind="task" status="in_progress" />);
      expect(lastFrame()).toContain('●');
    });

    test('renders for planning', () => {
      const { lastFrame } = render(<StatusIndicator kind="task" status="planning" />);
      expect(lastFrame()).toContain('◐');
    });

    test('renders for pending', () => {
      const { lastFrame } = render(<StatusIndicator kind="task" status="pending" />);
      expect(lastFrame()).toContain('○');
    });

    test('renders for blocked', () => {
      const { lastFrame } = render(<StatusIndicator kind="task" status="blocked" />);
      expect(lastFrame()).toContain('⊘');
    });

    test('renders for failed', () => {
      const { lastFrame } = render(<StatusIndicator kind="task" status="failed" />);
      expect(lastFrame()).toContain('✗');
    });

    test('renders for skipped', () => {
      const { lastFrame } = render(<StatusIndicator kind="task" status="skipped" />);
      expect(lastFrame()).toContain('○');
    });

    test('renders for paused', () => {
      const { lastFrame } = render(<StatusIndicator kind="task" status="paused" />);
      expect(lastFrame()).toContain('◐');
    });
  });

  describe('workspace statuses', () => {
    test('renders for active', () => {
      const { lastFrame } = render(<StatusIndicator kind="workspace" status="active" />);
      expect(lastFrame()).toContain('●');
    });

    test('renders for merged', () => {
      const { lastFrame } = render(<StatusIndicator kind="workspace" status="merged" />);
      expect(lastFrame()).toContain('✓');
    });

    test('renders for abandoned', () => {
      const { lastFrame } = render(<StatusIndicator kind="workspace" status="abandoned" />);
      expect(lastFrame()).toContain('○');
    });
  });

  describe('fallback', () => {
    test('renders ? for unknown status', () => {
      const { lastFrame } = render(<StatusIndicator kind="workflow" status="unknown_status" />);
      expect(lastFrame()).toContain('?');
    });
  });
});
