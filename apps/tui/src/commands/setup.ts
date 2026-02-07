import { setupClaudeCode } from './setup-claude-code';

export interface SetupOptions {
  target: string;
  repoPath: string;
  print?: boolean;
  mcpOnly?: boolean;
  claudeMdOnly?: boolean;
}

export function runSetup(opts: SetupOptions): void {
  if (opts.target !== 'claude-code') {
    console.error(`Unknown setup target: ${opts.target}`);
    console.error('Available targets: claude-code');
    process.exit(1);
  }

  const result = setupClaudeCode({
    repoPath: opts.repoPath,
    printOnly: opts.print,
    mcpOnly: opts.mcpOnly,
    claudeMdOnly: opts.claudeMdOnly,
  });

  for (const msg of result.messages) {
    console.log(msg);
  }
}
