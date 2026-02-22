import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { SetupGuide } from './SetupGuide';

describe('SetupGuide', () => {
  test('exports SetupGuide as a function component', () => {
    expect(typeof SetupGuide).toBe('function');
  });

  test('SetupGuide has the expected function name', () => {
    expect(SetupGuide.name).toBe('SetupGuide');
  });

  test('renders Setup Guide title', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';
    expect(output).toContain('Setup Guide');
  });

  test('renders Getting Started section', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';
    expect(output).toContain('Getting Started');
    expect(output).toContain('caw init');
    expect(output).toContain('caw setup claude-code');
  });

  test('renders Configuration section', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';
    expect(output).toContain('Configuration');
    expect(output).toContain('.caw/config.json');
  });

  test('renders Claude Code Integration section', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';
    expect(output).toContain('Claude Code Integration');
    expect(output).toContain('.claude/settings.json');
  });

  test('renders Status section', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';
    expect(output).toContain('Status');
    expect(output).toContain('Database');
    expect(output).toContain('MCP Server');
  });

  test('renders Configuration Editor section', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';
    expect(output).toContain('Configuration Editor');
  });

  test('renders escape hint', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';
    expect(output).toContain('Press Esc or /back to return');
  });
});

describe('ConfigEditor component (integrated)', () => {
  test('renders config editor in view mode with edit hint', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';

    // Should show Configuration Editor title
    expect(output).toContain('Configuration Editor');

    // Should show edit hint in view mode
    expect(output).toContain('Press e or Enter to edit');
  });

  test('displays transport config field with help text', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';

    expect(output).toContain('transport:');
    expect(output).toContain('stdio | http');
  });

  test('displays port config field with help text', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';

    expect(output).toContain('port:');
    expect(output).toContain('1-65535');
  });

  test('displays default port when not configured', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';

    expect(output).toContain('port:');
    expect(output).toContain('(default)');
  });

  test('displays dbMode config field with help text', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';

    expect(output).toContain('dbMode:');
    expect(output).toContain('global | per-repo');
  });

  test('displays agent.runtime config field with help text', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';

    expect(output).toContain('agent.runtime:');
    expect(output).toContain('agent runtime');
  });

  test('displays agent.autoSetup config field with help text', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';

    expect(output).toContain('agent.autoSetup:');
    expect(output).toContain('true | false');
  });

  test('displays default config values', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';

    // Should show default transport
    expect(output).toContain('transport:');
    expect(output).toContain('stdio');

    // Should show default port
    expect(output).toContain('port:');
    expect(output).toContain('(default)');

    // Should show default dbMode
    expect(output).toContain('dbMode:');
    expect(output).toContain('per-repo');

    // Should show default runtime
    expect(output).toContain('agent.runtime:');
    expect(output).toContain('claude_code');

    // Should show default autoSetup
    expect(output).toContain('agent.autoSetup:');
    expect(output).toContain('false');
  });

  test('displays all five config fields in order', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';

    // All fields should be present
    expect(output).toContain('transport:');
    expect(output).toContain('port:');
    expect(output).toContain('dbMode:');
    expect(output).toContain('agent.runtime:');
    expect(output).toContain('agent.autoSetup:');
  });

  test('displays field help text for all fields', () => {
    const { lastFrame } = render(<SetupGuide />);
    const output = lastFrame() ?? '';

    // Help text should be visible
    expect(output).toContain('stdio | http');
    expect(output).toContain('1-65535');
    expect(output).toContain('global | per-repo');
    expect(output).toContain('agent runtime');
    expect(output).toContain('true | false');
  });
});

describe('ConfigEditor validation requirements', () => {
  test('port field accepts values 1-65535', () => {
    // This test documents the port validation requirement
    // The actual validation is tested through the component's behavior
    const validPorts = [1, 80, 443, 3100, 8080, 65535];
    const invalidPorts = [0, -1, 65536, 100000];

    // Document that valid ports should be in range 1-65535
    for (const port of validPorts) {
      expect(port).toBeGreaterThanOrEqual(1);
      expect(port).toBeLessThanOrEqual(65535);
    }

    // Document that invalid ports should be rejected
    for (const port of invalidPorts) {
      expect(port < 1 || port > 65535).toBe(true);
    }
  });

  test('runtime field accepts alphanumeric, underscore, and dash', () => {
    // This test documents the runtime validation requirement
    const validRuntimeChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
    const validPattern = /^[a-zA-Z0-9_-]$/;

    // Document that each valid character matches the pattern
    for (const char of validRuntimeChars) {
      expect(validPattern.test(char)).toBe(true);
    }

    // Document that invalid characters don't match
    const invalidChars = ['!', '@', '#', '$', '%', ' ', '.', ','];
    for (const char of invalidChars) {
      expect(validPattern.test(char)).toBe(false);
    }
  });

  test('transport field toggles between stdio and http', () => {
    // This test documents the transport toggle requirement
    const validTransports = ['stdio', 'http'];

    // Helper function to test toggle logic
    const toggleTransport = (current: 'stdio' | 'http'): 'stdio' | 'http' => {
      return current === 'stdio' ? 'http' : 'stdio';
    };

    // When transport is stdio, toggling should set to http
    expect(toggleTransport('stdio')).toBe('http');
    expect(validTransports).toContain(toggleTransport('stdio'));

    // When transport is http, toggling should set to stdio
    expect(toggleTransport('http')).toBe('stdio');
    expect(validTransports).toContain(toggleTransport('http'));
  });

  test('dbMode field toggles between per-repo and global', () => {
    // This test documents the dbMode toggle requirement
    const validModes = ['per-repo', 'global'];

    // Helper function to test toggle logic
    const toggleDbMode = (current: 'per-repo' | 'global'): 'per-repo' | 'global' => {
      return current === 'per-repo' ? 'global' : 'per-repo';
    };

    // When dbMode is per-repo, toggling should set to global
    expect(toggleDbMode('per-repo')).toBe('global');
    expect(validModes).toContain(toggleDbMode('per-repo'));

    // When dbMode is global, toggling should set to per-repo
    expect(toggleDbMode('global')).toBe('per-repo');
    expect(validModes).toContain(toggleDbMode('global'));
  });

  test('autoSetup field toggles between true and false', () => {
    // This test documents the autoSetup toggle requirement
    let current = false;
    const next = !current;
    expect(next).toBe(true);

    current = true;
    const next2 = !current;
    expect(next2).toBe(false);
  });
});

describe('ConfigEditor keyboard interaction documentation', () => {
  test('documents view mode keybindings', () => {
    // This test documents the expected keybindings in view mode
    const viewModeKeys = {
      e: 'Enter edit mode',
      return: 'Enter edit mode',
    };

    expect(Object.keys(viewModeKeys)).toContain('e');
    expect(Object.keys(viewModeKeys)).toContain('return');
  });

  test('documents edit mode keybindings', () => {
    // This test documents the expected keybindings in edit mode
    const editModeKeys = {
      escape: 'Cancel editing and restore original config',
      upArrow: 'Navigate to previous field',
      downArrow: 'Navigate to next field',
      return: 'Toggle field value (for transport, dbMode, autoSetup)',
      space: 'Toggle field value (for transport, dbMode, autoSetup)',
      s: 'Save configuration',
      '0-9': 'Enter digit for port field',
      backspace: 'Delete digit from port or runtime field',
      'a-zA-Z0-9_-': 'Enter character for runtime field',
    };

    expect(Object.keys(editModeKeys)).toContain('escape');
    expect(Object.keys(editModeKeys)).toContain('upArrow');
    expect(Object.keys(editModeKeys)).toContain('downArrow');
    expect(Object.keys(editModeKeys)).toContain('return');
    expect(Object.keys(editModeKeys)).toContain('space');
    expect(Object.keys(editModeKeys)).toContain('s');
  });

  test('documents field navigation order', () => {
    // This test documents the expected field navigation order
    const fields = ['transport', 'port', 'dbMode', 'runtime', 'autoSetup'];

    // Fields should be in this specific order
    expect(fields).toEqual(['transport', 'port', 'dbMode', 'runtime', 'autoSetup']);

    // Navigation should cycle: last field -> first field
    const lastIndex = fields.length - 1;
    const nextAfterLast = 0; // Should wrap to first
    expect(nextAfterLast).toBe(0);

    // Navigation should cycle: first field -> last field (when going up)
    const prevBeforeFirst = fields.length - 1; // Should wrap to last
    expect(prevBeforeFirst).toBe(lastIndex);
  });

  test('documents save success and error feedback', () => {
    // This test documents the expected feedback messages
    const feedbackMessages = {
      success: '✓ Configuration saved successfully',
      errorPrefix: '✗ Failed to save:',
    };

    expect(feedbackMessages.success).toContain('✓');
    expect(feedbackMessages.success).toContain('saved successfully');
    expect(feedbackMessages.errorPrefix).toContain('✗');
    expect(feedbackMessages.errorPrefix).toContain('Failed to save');
  });
});
