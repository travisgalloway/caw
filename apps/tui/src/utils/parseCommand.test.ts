import { describe, expect, test } from 'bun:test';
import { completeCommand, isValidSlashCommand, parseCommand, SLASH_COMMANDS } from './parseCommand';

describe('parseCommand', () => {
  test('parses simple slash command', () => {
    expect(parseCommand('/help')).toEqual({ type: 'slash', command: 'help' });
  });

  test('parses slash command with args', () => {
    expect(parseCommand('/lock wf_abc123')).toEqual({
      type: 'slash',
      command: 'lock',
      args: 'wf_abc123',
    });
  });

  test('normalizes command to lowercase', () => {
    expect(parseCommand('/HELP')).toEqual({ type: 'slash', command: 'help' });
    expect(parseCommand('/Lock WF_ID')).toEqual({
      type: 'slash',
      command: 'lock',
      args: 'WF_ID',
    });
  });

  test('parses plain text as text type', () => {
    expect(parseCommand('hello world')).toEqual({ type: 'text', text: 'hello world' });
  });

  test('handles empty string', () => {
    expect(parseCommand('')).toEqual({ type: 'text', text: '' });
  });

  test('handles slash alone', () => {
    expect(parseCommand('/')).toEqual({ type: 'slash', command: '' });
  });

  test('trims whitespace', () => {
    expect(parseCommand('  /help  ')).toEqual({ type: 'slash', command: 'help' });
    expect(parseCommand('  hello  ')).toEqual({ type: 'text', text: 'hello' });
  });

  test('handles args with extra whitespace', () => {
    expect(parseCommand('/lock   wf_abc  ')).toEqual({
      type: 'slash',
      command: 'lock',
      args: 'wf_abc',
    });
  });

  test('handles command with empty args', () => {
    expect(parseCommand('/help ')).toEqual({ type: 'slash', command: 'help' });
  });

  test('all defined slash commands parse correctly', () => {
    for (const cmd of SLASH_COMMANDS) {
      const result = parseCommand(`/${cmd}`);
      expect(result.type).toBe('slash');
      expect(result.command).toBe(cmd);
    }
  });
});

describe('isValidSlashCommand', () => {
  test('returns true for valid commands', () => {
    expect(isValidSlashCommand('help')).toBe(true);
    expect(isValidSlashCommand('quit')).toBe(true);
    expect(isValidSlashCommand('workflows')).toBe(true);
    expect(isValidSlashCommand('lock')).toBe(true);
    expect(isValidSlashCommand('dashboard')).toBe(true);
    expect(isValidSlashCommand('all')).toBe(true);
    expect(isValidSlashCommand('resume')).toBe(true);
  });

  test('returns false for invalid commands', () => {
    expect(isValidSlashCommand('foo')).toBe(false);
    expect(isValidSlashCommand('')).toBe(false);
    expect(isValidSlashCommand('HELP')).toBe(false);
  });
});

describe('completeCommand', () => {
  test('completes single match', () => {
    expect(completeCommand('/he')).toEqual({
      completed: '/help',
      candidates: ['help'],
    });
  });

  test('completes exact match', () => {
    expect(completeCommand('/workflows')).toEqual({
      completed: '/workflows',
      candidates: ['workflows'],
    });
  });

  test('returns common prefix for ambiguous input', () => {
    const result = completeCommand('/un');
    expect(result.completed).toBe('/un');
    expect(result.candidates).toContain('unread');
    expect(result.candidates).toContain('unlock');
    expect(result.candidates.length).toBe(2);
  });

  test('no-op for non-slash input', () => {
    expect(completeCommand('hello')).toEqual({
      completed: 'hello',
      candidates: [],
    });
  });

  test('no matches for unknown prefix', () => {
    expect(completeCommand('/xyz')).toEqual({
      completed: '/xyz',
      candidates: [],
    });
  });

  test('slash alone returns all commands', () => {
    const result = completeCommand('/');
    expect(result.completed).toBe('/');
    expect(result.candidates.length).toBe(SLASH_COMMANDS.length);
  });

  test('completes single-char prefix', () => {
    const result = completeCommand('/q');
    expect(result.completed).toBe('/quit');
    expect(result.candidates).toEqual(['quit']);
  });

  test('handles lock/unlock ambiguity with /l prefix', () => {
    const result = completeCommand('/l');
    expect(result.completed).toBe('/lock');
    expect(result.candidates).toEqual(['lock']);
  });

  test('handles /da prefix matching dag and dashboard', () => {
    const result = completeCommand('/da');
    expect(result.completed).toBe('/da');
    expect(result.candidates).toContain('dag');
    expect(result.candidates).toContain('dashboard');
    expect(result.candidates.length).toBe(2);
  });

  test('completes /res to /resume', () => {
    const result = completeCommand('/res');
    expect(result.completed).toBe('/resume');
    expect(result.candidates).toEqual(['resume']);
  });

  test('completes /al to /all', () => {
    const result = completeCommand('/al');
    expect(result.completed).toBe('/all');
    expect(result.candidates).toEqual(['all']);
  });
});
