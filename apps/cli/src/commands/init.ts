import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { CawConfig } from '@caw/core';
import { EXAMPLE_TEMPLATES, stringifyYaml, writeConfig } from '@caw/core';
import { setupClaudeCode } from './setup-claude-code';

export interface InitOptions {
  yes?: boolean;
  repoPath: string;
}

interface InitResult {
  configPath: string;
  config: CawConfig;
  claudeCodeSetup: boolean;
  messages: string[];
}

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function writeExampleTemplates(configDir: string): string[] {
  const templatesDir = join(configDir, 'templates');
  const messages: string[] = [];

  if (!existsSync(templatesDir)) {
    mkdirSync(templatesDir, { recursive: true });
  }

  for (const [name, def] of Object.entries(EXAMPLE_TEMPLATES)) {
    const filePath = join(templatesDir, `${name}.yaml`);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, stringifyYaml(def), 'utf-8');
      messages.push(`Created example template: ${filePath}`);
    }
  }

  return messages;
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
          claudeCodeSetup: false,
          messages,
        };
      }
    }

    // Claude Code setup
    const setupAnswer = await prompt(rl, 'Set up Claude Code integration? (Y/n) ');
    const doSetup = setupAnswer.trim().toLowerCase() !== 'n';

    // Write config
    const config: CawConfig = {};
    if (doSetup) {
      config.agent = { runtime: 'claude-code', autoSetup: true };
    }

    writeConfig(configPath, config);
    messages.push(`Created ${configPath}`);

    // Claude Code setup
    let claudeCodeSetup = false;
    if (doSetup) {
      const result = setupClaudeCode({ repoPath });
      claudeCodeSetup = result.mcpConfigured || result.claudeMdUpdated;
      messages.push(...result.messages);
    }

    // Write example templates
    messages.push(...writeExampleTemplates(configDir));

    return { configPath, config, claudeCodeSetup, messages };
  } finally {
    rl.close();
  }
}

function runNonInteractive(repoPath: string, configDir: string): InitResult {
  const messages: string[] = [];
  const configPath = join(configDir, 'config.json');
  const config: CawConfig = {
    agent: { runtime: 'claude-code', autoSetup: true },
  };

  writeConfig(configPath, config);
  messages.push(`Created ${configPath}`);

  const result = setupClaudeCode({ repoPath });
  messages.push(...result.messages);
  const claudeCodeSetup = result.mcpConfigured || result.claudeMdUpdated;

  // Write example templates
  messages.push(...writeExampleTemplates(configDir));

  return { configPath, config, claudeCodeSetup, messages };
}

export async function runInit(opts: InitOptions): Promise<void> {
  const { repoPath } = opts;

  // Always target ~/.caw/
  const configDir = join(homedir(), '.caw');

  let result: InitResult;
  if (opts.yes) {
    result = runNonInteractive(repoPath, configDir);
  } else {
    result = await runInteractive(repoPath, configDir);
  }

  console.log('');
  for (const msg of result.messages) {
    console.log(`  ${msg}`);
  }
  console.log('');
}
