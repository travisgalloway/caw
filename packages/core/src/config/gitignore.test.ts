import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureGitignore } from './gitignore';

describe('ensureGitignore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `caw-test-gi-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates .gitignore if it does not exist', () => {
    const result = ensureGitignore(tmpDir, '.caw/');
    expect(result).toBe(true);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toBe('.caw/\n');
  });

  test('appends entry if not present', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/\n');
    const result = ensureGitignore(tmpDir, '.caw/');
    expect(result).toBe(true);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toBe('node_modules/\n.caw/\n');
  });

  test('does not duplicate entry', () => {
    writeFileSync(join(tmpDir, '.gitignore'), '.caw/\nnode_modules/\n');
    const result = ensureGitignore(tmpDir, '.caw/');
    expect(result).toBe(false);
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toBe('.caw/\nnode_modules/\n');
  });

  test('handles file without trailing newline', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/');
    ensureGitignore(tmpDir, '.caw/');
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toBe('node_modules/\n.caw/\n');
  });
});
