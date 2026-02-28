import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { CawConfig, DbMode } from '@caw/core';
import { ensureGitignore, writeConfig } from '@caw/core';
import { setupClaudeCode } from './setup-claude-code';

export interface InitOptions {
  yes?: boolean;
  global?: boolean;
  repoPath: string;
}

interface InitResult {
  configPath: string;
  config: CawConfig;
  gitignoreUpdated: boolean;
  claudeCodeSetup: boolean;
  messages: string[];
}

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function runInteractive(repoPath: string, configDir: string): Promise<InitResult> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const messages: string[] = [];

  try {
    // Check existing config
    const configPath = join(configDir, 'config.json');
    if (existsSync(configPath)) {
      const answer = await prompt(rl, `${configPath} already exists. Overwrite? (y/N) `);
      if (answer.toLowerCase() !== 'y') {
        messages.push('Init cancelled.');
        return {
          configPath,
          config: {},
          gitignoreUpdated: false,
          claudeCodeSetup: false,
          messages,
        };
      }
    }

    // Database mode
    const modeAnswer = await prompt(rl, 'Database mode? (per-repo/global) [per-repo] ');
    const dbMode: DbMode = modeAnswer.trim().toLowerCase() === 'global' ? 'global' : 'per-repo';

    // Claude Code setup
    const setupAnswer = await prompt(rl, 'Set up Claude Code integration? (Y/n) ');
    const doSetup = setupAnswer.trim().toLowerCase() !== 'n';

    // Write config
    const config: CawConfig = { dbMode };
    if (doSetup) {
      config.agent = { runtime: 'claude_code', autoSetup: true };
    }

    writeConfig(configPath, config);
    messages.push(`Created ${configPath}`);

    // Gitignore (only for per-repo)
    let gitignoreUpdated = false;
    if (dbMode === 'per-repo') {
      gitignoreUpdated = ensureGitignore(repoPath, '.caw/');
      if (gitignoreUpdated) {
        messages.push('Added .caw/ to .gitignore');
      }
    }

    // Claude Code setup
    let claudeCodeSetup = false;
    if (doSetup) {
      const result = setupClaudeCode({ repoPath });
      claudeCodeSetup = result.mcpConfigured || result.claudeMdUpdated;
      messages.push(...result.messages);
    }

    return { configPath, config, gitignoreUpdated, claudeCodeSetup, messages };
  } finally {
    rl.close();
  }
}

function runNonInteractive(repoPath: string, configDir: string, isGlobal: boolean): InitResult {
  const messages: string[] = [];
  const configPath = join(configDir, 'config.json');
  const config: CawConfig = {
    dbMode: isGlobal ? 'global' : 'per-repo',
    agent: { runtime: 'claude_code', autoSetup: true },
  };

  writeConfig(configPath, config);
  messages.push(`Created ${configPath}`);

  let gitignoreUpdated = false;
  if (!isGlobal) {
    gitignoreUpdated = ensureGitignore(repoPath, '.caw/');
    if (gitignoreUpdated) {
      messages.push('Added .caw/ to .gitignore');
    }
  }

  const result = setupClaudeCode({ repoPath });
  messages.push(...result.messages);
  const claudeCodeSetup = result.mcpConfigured || result.claudeMdUpdated;

  return { configPath, config, gitignoreUpdated, claudeCodeSetup, messages };
}

export async function runInit(opts: InitOptions): Promise<void> {
  const { repoPath } = opts;

  let configDir: string;
  if (opts.global) {
    const { homedir } = await import('node:os');
    configDir = join(homedir(), '.caw');
  } else {
    configDir = join(repoPath, '.caw');
  }

  let result: InitResult;
  if (opts.yes) {
    result = runNonInteractive(repoPath, configDir, opts.global ?? false);
  } else {
    result = await runInteractive(repoPath, configDir);
  }

  console.log('');
  for (const msg of result.messages) {
    console.log(`  ${msg}`);
  }
  console.log('');
}
