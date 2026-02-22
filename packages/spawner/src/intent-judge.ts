import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface IntentJudgeResult {
  verdict: 'pass' | 'fail';
  confidence: number;
  reason: string;
  scopeCreep: string[];
  missingRequirements: string[];
}

export interface IntentJudgeOptions {
  /** Model to use for the judge call (default: claude-haiku-4-5-20251001) */
  model?: string;
  /** Working directory for git diff (defaults to cwd) */
  cwd?: string;
  /** Git branch or ref to diff against (default: HEAD~1) */
  diffBase?: string;
  /** Custom spawn function for testing */
  spawnFn?: (command: string, args: string[], options: { cwd: string }) => ChildProcess;
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function buildJudgePrompt(taskDescription: string, taskOutcome: string, diff: string): string {
  return [
    'You are an intent verification judge. Compare a git diff against the original task requirements.',
    '',
    '## Task Description (what was requested)',
    taskDescription,
    '',
    '## Task Outcome (what the agent reported)',
    taskOutcome,
    '',
    '## Git Diff (what actually changed)',
    diff.slice(0, 15_000), // Cap diff to avoid token explosion
    '',
    '## Instructions',
    'Analyze whether the diff faithfully implements the task description. Check for:',
    '1. Scope creep: changes unrelated to the task',
    '2. Missing requirements: things described but not implemented',
    '3. Unrelated changes: formatting-only, unrelated refactoring, etc.',
    '',
    '## Output Format',
    'You MUST output exactly one JSON object on the last line of your response:',
    '```',
    '{',
    '  "verdict": "pass" or "fail",',
    '  "confidence": 0.0 to 1.0,',
    '  "reason": "brief explanation",',
    '  "scope_creep": ["list of unrelated changes, if any"],',
    '  "missing_requirements": ["list of missing items, if any"]',
    '}',
    '```',
    '',
    'Be pragmatic: minor formatting fixes alongside real changes are fine.',
    'Only fail if there are significant deviations from the task.',
  ].join('\n');
}

/**
 * Get the git diff for the work done by an agent.
 * Uses the workspace path and branch to compute the diff.
 */
async function getGitDiff(cwd: string, diffBase: string, spawnFn: typeof spawn): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const proc = spawnFn('git', ['diff', diffBase, '--stat', '--patch'], { cwd });

    let stdout = '';
    let stderr = '';

    if (proc.stdout) {
      const rl = createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        stdout += `${line}\n`;
      });
    }
    if (proc.stderr) {
      const rl = createInterface({ input: proc.stderr });
      rl.on('line', (line) => {
        stderr += `${line}\n`;
      });
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`git diff failed (code ${code}): ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Run the intent judge: spawn a cheap Claude call to verify the diff matches the task.
 * Returns null if the diff is empty (nothing to judge).
 */
export async function runIntentJudge(
  taskDescription: string,
  taskOutcome: string,
  options?: IntentJudgeOptions,
): Promise<IntentJudgeResult | null> {
  const cwd = options?.cwd ?? process.cwd();
  const diffBase = options?.diffBase ?? 'HEAD~1';
  const model = options?.model ?? DEFAULT_MODEL;
  const spawnFn = options?.spawnFn ?? spawn;

  // Get the git diff
  let diff: string;
  try {
    diff = await getGitDiff(cwd, diffBase, spawnFn as typeof spawn);
  } catch {
    // If git diff fails (e.g., no commits), skip the judge
    return null;
  }

  if (diff.trim().length === 0) {
    return null; // Nothing changed, nothing to judge
  }

  const prompt = buildJudgePrompt(taskDescription, taskOutcome, diff);

  // Spawn claude --print for a one-shot, cheap evaluation
  return new Promise<IntentJudgeResult>((resolve, reject) => {
    const proc = spawnFn('claude', ['-p', prompt, '--model', model, '--output-format', 'text'], {
      cwd,
    });

    let stdout = '';
    let stderr = '';

    if (proc.stdout) {
      const rl = createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        stdout += `${line}\n`;
      });
    }
    if (proc.stderr) {
      const rl = createInterface({ input: proc.stderr });
      rl.on('line', (line) => {
        stderr += `${line}\n`;
      });
    }

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Intent judge failed (code ${code}): ${stderr}`));
        return;
      }

      // Parse the last JSON object in the output
      const result = parseJudgeOutput(stdout);
      if (result) {
        resolve(result);
      } else {
        reject(new Error(`Failed to parse intent judge output: ${stdout.slice(0, 500)}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Parse the judge output, looking for a JSON object in the last lines.
 */
function parseJudgeOutput(output: string): IntentJudgeResult | null {
  const lines = output.trim().split('\n');

  // Try from the last line backwards to find valid JSON
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;

    try {
      const parsed = JSON.parse(line);
      if (parsed.verdict && typeof parsed.confidence === 'number') {
        return {
          verdict: parsed.verdict === 'pass' ? 'pass' : 'fail',
          confidence: Math.max(0, Math.min(1, parsed.confidence)),
          reason: parsed.reason ?? '',
          scopeCreep: Array.isArray(parsed.scope_creep) ? parsed.scope_creep : [],
          missingRequirements: Array.isArray(parsed.missing_requirements)
            ? parsed.missing_requirements
            : [],
        };
      }
    } catch {
      // Not valid JSON, try next line
    }
  }

  return null;
}
