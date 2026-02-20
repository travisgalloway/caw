export type CommandType = 'slash' | 'text';

export interface ParsedCommand {
  type: CommandType;
  command?: string;
  args?: string;
  text?: string;
}

export const SLASH_COMMANDS = [
  'quit',
  'help',
  'workflows',
  'tasks',
  'agents',
  'messages',
  'refresh',
  'unread',
  'lock',
  'unlock',
  'dag',
  'tree',
  'table',
  'all',
  'resume',
  'back',
  'setup',
  'add-task',
  'remove-task',
  'mark-read',
  'reply',
  'merge',
  'rebase',
  'work',
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number];

export const COMMAND_DESCRIPTIONS: Record<SlashCommand, string> = {
  quit: 'Exit caw',
  help: 'Show help screen',
  workflows: 'Go to workflow list',
  tasks: 'Switch to tasks tab',
  agents: 'Switch to agents tab',
  messages: 'Switch to messages tab',
  refresh: 'Refresh data',
  unread: 'Toggle unread filter',
  lock: 'Lock a workflow',
  unlock: 'Unlock a workflow',
  dag: 'DAG task view',
  tree: 'Tree task view',
  table: 'Table task view',
  all: 'Toggle all/active workflows',
  resume: 'Resume paused workflow',
  back: 'Go back',
  setup: 'Configuration setup',
  'add-task': 'Add a task to current workflow',
  'remove-task': 'Remove a task from current workflow',
  'mark-read': 'Mark messages as read',
  reply: 'Reply to agent query',
  merge: 'Mark workspace as merged',
  rebase: 'Rebase workspace branch onto main',
  work: 'Work on GitHub issue(s)',
};

export function isValidSlashCommand(command: string): command is SlashCommand {
  return SLASH_COMMANDS.includes(command as SlashCommand);
}

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  if (!trimmed.startsWith('/')) {
    return { type: 'text', text: trimmed };
  }

  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(' ');

  if (spaceIndex === -1) {
    return { type: 'slash', command: withoutSlash.toLowerCase() };
  }

  const command = withoutSlash.slice(0, spaceIndex).toLowerCase();
  const args = withoutSlash.slice(spaceIndex + 1).trim();

  return { type: 'slash', command, args: args || undefined };
}

export function completeCommand(partial: string): {
  completed: string;
  candidates: string[];
} {
  if (!partial.startsWith('/')) {
    return { completed: partial, candidates: [] };
  }

  const withoutSlash = partial.slice(1).toLowerCase();

  if (!withoutSlash) {
    return { completed: partial, candidates: [...SLASH_COMMANDS] };
  }

  const matches = SLASH_COMMANDS.filter((cmd) => cmd.startsWith(withoutSlash));

  if (matches.length === 0) {
    return { completed: partial, candidates: [] };
  }

  if (matches.length === 1) {
    return { completed: `/${matches[0]}`, candidates: [...matches] };
  }

  // Find longest common prefix among matches
  let prefix: string = matches[0];
  for (let i = 1; i < matches.length; i++) {
    let j = 0;
    while (j < prefix.length && j < matches[i].length && prefix[j] === matches[i][j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
  }

  return { completed: `/${prefix}`, candidates: [...matches] };
}
