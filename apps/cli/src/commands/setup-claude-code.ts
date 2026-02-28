import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CLAUDE_MD_SECTION = `## Workflow Persistence (caw)

This project uses caw for durable task execution. Workflows, tasks, and checkpoints persist across context clearing.

### Starting a New Workflow

When given a multi-step task:

1. \`workflow_create\` with a name and the task description
2. \`workflow_set_plan\` to break the work into tasks with dependencies
3. \`workflow_next_tasks\` to get the first actionable task

### Working on Tasks

For each task:

1. \`task_set_plan\` — record your approach and files to modify
2. \`task_update_status\` — set to \`in_progress\`
3. \`checkpoint_add\` — record progress after each significant step (type: \`progress\`, \`decision\`, or \`error\`)
4. \`task_update_status\` — set to \`completed\` with an \`outcome\` summary

### Recovering After Context Clear

If your context was cleared and you need to resume:

1. \`workflow_list\` with status \`in_progress\` to find active workflows
2. \`workflow_progress\` to see which task is current
3. \`task_load_context\` with \`all_checkpoints: true\` to reload full state
4. Resume from the last checkpoint`;

export interface SetupClaudeCodeOptions {
  repoPath: string;
  printOnly?: boolean;
  mcpOnly?: boolean;
  claudeMdOnly?: boolean;
}

export interface SetupClaudeCodeResult {
  mcpConfigured: boolean;
  claudeMdUpdated: boolean;
  messages: string[];
}

function getMcpConfig(): { command: string; args: string[] } {
  return { command: 'bunx', args: ['@caw/cli', '--server'] };
}

function configureMcpServer(
  repoPath: string,
  printOnly: boolean,
): { configured: boolean; messages: string[] } {
  const messages: string[] = [];
  const settingsDir = join(repoPath, '.claude');
  const settingsPath = join(settingsDir, 'settings.json');
  const mcpEntry = getMcpConfig();

  const newServerConfig = {
    command: mcpEntry.command,
    args: mcpEntry.args,
  };

  if (printOnly) {
    messages.push('Would write to .claude/settings.json:');
    messages.push(JSON.stringify({ mcpServers: { caw: newServerConfig } }, null, 2));
    return { configured: false, messages };
  }

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      settings = {};
    }
  }

  const mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>;
  mcpServers.caw = newServerConfig;
  settings.mcpServers = mcpServers;

  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  messages.push(`Configured MCP server in ${settingsPath}`);
  return { configured: true, messages };
}

function updateClaudeMd(
  repoPath: string,
  printOnly: boolean,
): { updated: boolean; messages: string[] } {
  const messages: string[] = [];
  const claudeMdPath = join(repoPath, 'CLAUDE.md');

  if (printOnly) {
    messages.push('Would append to CLAUDE.md:');
    messages.push(CLAUDE_MD_SECTION);
    return { updated: false, messages };
  }

  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    if (content.includes('## Workflow Persistence (caw)')) {
      messages.push('CLAUDE.md already contains workflow persistence section — skipped');
      return { updated: false, messages };
    }
    const suffix = content.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(claudeMdPath, `${content}${suffix}${CLAUDE_MD_SECTION}\n`);
    messages.push('Appended workflow persistence section to CLAUDE.md');
  } else {
    writeFileSync(claudeMdPath, `${CLAUDE_MD_SECTION}\n`);
    messages.push('Created CLAUDE.md with workflow persistence section');
  }

  return { updated: true, messages };
}

export function setupClaudeCode(opts: SetupClaudeCodeOptions): SetupClaudeCodeResult {
  const messages: string[] = [];
  let mcpConfigured = false;
  let claudeMdUpdated = false;

  if (!opts.claudeMdOnly) {
    const mcp = configureMcpServer(opts.repoPath, opts.printOnly ?? false);
    mcpConfigured = mcp.configured;
    messages.push(...mcp.messages);
  }

  if (!opts.mcpOnly) {
    const md = updateClaudeMd(opts.repoPath, opts.printOnly ?? false);
    claudeMdUpdated = md.updated;
    messages.push(...md.messages);
  }

  return { mcpConfigured, claudeMdUpdated, messages };
}
