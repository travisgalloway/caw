import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection, runMigrations, templateService } from '@caw/core';

const CLI_PATH = join(import.meta.dir, 'cli.ts');

function runCli(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = Bun.spawn(['bun', CLI_PATH, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    proc.exited.then((exitCode) => {
      const readStream = async (stream: ReadableStream<Uint8Array> | null) => {
        if (!stream) return '';
        const chunks: Uint8Array[] = [];
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        return Buffer.concat(chunks).toString('utf-8');
      };
      Promise.all([readStream(proc.stdout), readStream(proc.stderr)]).then(([stdout, stderr]) => {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
      });
    });
  });
}

describe('CLI', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'caw-cli-test-'));
    dbPath = join(tmpDir, 'test.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('--help', () => {
    it('shows usage and exits 0', async () => {
      const result = await runCli('--help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--template');
      expect(result.stdout).toContain('--list-templates');
    });
  });

  describe('--list-templates', () => {
    it('shows "No templates found." with empty DB', async () => {
      const result = await runCli('--db', dbPath, '--list-templates');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('No templates found.');
    });

    it('shows template table when templates exist', async () => {
      // Seed the DB
      const db = createConnection(dbPath);
      runMigrations(db);
      templateService.create(db, {
        name: 'my-template',
        description: 'A test template',
        template: { tasks: [{ name: 'Setup' }] },
      });
      db.close();

      const result = await runCli('--db', dbPath, '--list-templates');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('my-template');
      expect(result.stdout).toContain('A test template');
    });
  });

  describe('--template', () => {
    it('creates workflow and prints ID', async () => {
      // Seed a template
      const db = createConnection(dbPath);
      runMigrations(db);
      templateService.create(db, {
        name: 'basic',
        template: { tasks: [{ name: 'Init' }] },
      });
      db.close();

      const result = await runCli('--db', dbPath, '--template', 'basic', 'My workflow');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^wf_[0-9a-z]{12}$/);
    });

    it('exits 1 without description', async () => {
      const result = await runCli('--db', dbPath, '--template', 'basic');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('requires a description');
    });

    it('exits 1 for nonexistent template', async () => {
      // Create DB so migrations run
      const db = createConnection(dbPath);
      runMigrations(db);
      db.close();

      const result = await runCli('--db', dbPath, '--template', 'nonexistent', 'desc');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Template not found: nonexistent');
    });

    it('shows available templates when template not found', async () => {
      const db = createConnection(dbPath);
      runMigrations(db);
      templateService.create(db, {
        name: 'existing-one',
        template: { tasks: [{ name: 'Task' }] },
      });
      db.close();

      const result = await runCli('--db', dbPath, '--template', 'wrong', 'desc');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('existing-one');
    });
  });
});
