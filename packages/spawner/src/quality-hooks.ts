import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface QualityHooksConfig {
  /** Run build/test/lint before Claude completes a task (Stop hook). */
  stopHook?: boolean;
  /** Block dangerous commands during execution (PreToolUse hook). */
  preToolUseHook?: boolean;
  /** Custom stop hook command (default: 'bun run build && bun run test && bun run lint'). */
  stopHookCommand?: string;
  /** Patterns to block in PreToolUse (default: rm -rf, git push --force). */
  blockedPatterns?: string[];
}

interface ClaudeSettings {
  hooks?: {
    Stop?: Array<{ type: 'command'; command: string; matcher?: string }>;
    PreToolUse?: Array<{
      type: 'command';
      command: string;
      matcher?: string;
    }>;
  };
  [key: string]: unknown;
}

const DEFAULT_STOP_COMMAND = 'bun run build && bun run test && bun run lint';
const DEFAULT_BLOCKED_PATTERNS = [
  'rm -rf /',
  'git push --force',
  'git push -f',
  'git reset --hard',
  'git clean -fd',
];

const HOOK_MARKER = '__caw_quality_gate__';

/**
 * Install quality gate hooks into .claude/settings.json at the given workspace path.
 * Returns a cleanup function that removes the hooks.
 */
export function installQualityHooks(
  workspacePath: string,
  config?: QualityHooksConfig,
): () => void {
  const claudeDir = join(workspacePath, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');

  // Read existing settings or create empty
  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      settings = {};
    }
  }

  // Backup original state
  const originalContent = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf-8') : null;

  // Ensure hooks object exists
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Install Stop hook (runs build/test/lint before completion)
  if (config?.stopHook !== false) {
    const stopCommand = config?.stopHookCommand ?? DEFAULT_STOP_COMMAND;
    if (!settings.hooks.Stop) {
      settings.hooks.Stop = [];
    }
    settings.hooks.Stop.push({
      type: 'command',
      command: `echo "${HOOK_MARKER}" && ${stopCommand}`,
    });
  }

  // Install PreToolUse hook (blocks dangerous commands)
  if (config?.preToolUseHook !== false) {
    const patterns = config?.blockedPatterns ?? DEFAULT_BLOCKED_PATTERNS;
    if (!settings.hooks.PreToolUse) {
      settings.hooks.PreToolUse = [];
    }
    // Create a script that checks for blocked patterns in Bash tool input
    const checkScript = patterns
      .map(
        (p) =>
          `echo "$TOOL_INPUT" | grep -q '${p.replace(/'/g, "'\\''")}' && echo "BLOCKED: ${p}" && exit 2`,
      )
      .join('; ');

    settings.hooks.PreToolUse.push({
      type: 'command',
      command: `echo "${HOOK_MARKER}" && if [ "$TOOL_NAME" = "Bash" ]; then ${checkScript}; fi; exit 0`,
      matcher: 'Bash',
    });
  }

  // Write settings
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  // Return cleanup function
  return () => {
    try {
      if (originalContent === null) {
        // Settings file didn't exist before — remove it
        if (existsSync(settingsPath)) {
          unlinkSync(settingsPath);
        }
      } else {
        // Restore original content
        writeFileSync(settingsPath, originalContent);
      }
    } catch {
      // Best effort cleanup
    }
  };
}

/**
 * Remove any caw quality gate hooks from settings.
 * Useful for cleanup after unexpected termination.
 */
export function removeQualityHooks(workspacePath: string): void {
  const settingsPath = join(workspacePath, '.claude', 'settings.json');
  if (!existsSync(settingsPath)) return;

  try {
    const settings: ClaudeSettings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    if (!settings.hooks) return;

    // Remove hooks with our marker
    if (settings.hooks.Stop) {
      settings.hooks.Stop = settings.hooks.Stop.filter((h) => !h.command.includes(HOOK_MARKER));
      if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
    }

    if (settings.hooks.PreToolUse) {
      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
        (h) => !h.command.includes(HOOK_MARKER),
      );
      if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
    }

    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch {
    // Best effort
  }
}
