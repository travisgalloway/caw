import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { createConnection, runMigrations } from '../../src/db/index';
import * as templateService from '../../src/services/template.service';
import { applyTemplate, getById, getByName, listAll } from './resolver';

let tempDir: string;
let repoDir: string;
let globalDir: string;
let db: ReturnType<typeof createConnection>;

beforeEach(() => {
  tempDir = join(
    tmpdir(),
    `caw-resolver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  repoDir = join(tempDir, 'repo');
  globalDir = join(tempDir, 'global');
  mkdirSync(join(repoDir, '.caw', 'templates'), { recursive: true });
  mkdirSync(join(globalDir, '.caw', 'templates'), { recursive: true });

  db = createConnection(':memory:');
  runMigrations(db);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

function writeRepoTemplate(filename: string, def: Record<string, unknown>) {
  writeFileSync(
    join(repoDir, '.caw', 'templates', filename),
    filename.endsWith('.json') ? JSON.stringify(def) : stringifyYaml(def),
  );
}

describe('listAll', () => {
  test('returns empty when no templates exist', () => {
    const result = listAll(db, repoDir);
    expect(result).toHaveLength(0);
  });

  test('returns DB templates when no file templates exist', () => {
    templateService.create(db, {
      name: 'db-tmpl',
      description: 'From DB',
      template: { tasks: [{ name: 'Task 1' }] },
    });

    const result = listAll(db, repoDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('db-tmpl');
    expect(result[0].source).toBe('db');
  });

  test('returns file templates', () => {
    writeRepoTemplate('my-tmpl.yaml', {
      name: 'my-tmpl',
      tasks: [{ name: 'Task 1' }],
    });

    const result = listAll(db, repoDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('my-tmpl');
    expect(result[0].source).toBe('file:repo');
  });

  test('file templates override DB templates with same name', () => {
    templateService.create(db, {
      name: 'shared',
      description: 'DB version',
      template: { tasks: [{ name: 'DB Task' }] },
    });

    writeRepoTemplate('shared.yaml', {
      name: 'shared',
      description: 'File version',
      tasks: [{ name: 'File Task' }],
    });

    const result = listAll(db, repoDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('shared');
    expect(result[0].source).toBe('file:repo');
    expect(result[0].description).toBe('File version');
  });

  test('results are sorted alphabetically', () => {
    writeRepoTemplate('c.yaml', { name: 'charlie', tasks: [{ name: 'T' }] });
    writeRepoTemplate('a.yaml', { name: 'alpha', tasks: [{ name: 'T' }] });
    templateService.create(db, {
      name: 'bravo',
      template: { tasks: [{ name: 'T' }] },
    });

    const result = listAll(db, repoDir);
    expect(result.map((t) => t.name)).toEqual(['alpha', 'bravo', 'charlie']);
  });
});

describe('getByName', () => {
  test('finds file template by name', () => {
    writeRepoTemplate('feature.yaml', {
      name: 'feature',
      description: 'Feature workflow',
      tasks: [{ name: 'Setup {{feature}}' }],
    });

    const result = getByName(db, 'feature', repoDir);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('feature');
    expect(result?.source).toBe('file:repo');
  });

  test('falls back to DB template', () => {
    templateService.create(db, {
      name: 'db-only',
      template: { tasks: [{ name: 'Task' }] },
    });

    const result = getByName(db, 'db-only', repoDir);
    expect(result).not.toBeNull();
    expect(result?.source).toBe('db');
  });

  test('returns null for non-existent template', () => {
    const result = getByName(db, 'nope', repoDir);
    expect(result).toBeNull();
  });

  test('prefers repo file over DB for same name', () => {
    templateService.create(db, {
      name: 'clash',
      description: 'DB',
      template: { tasks: [{ name: 'T' }] },
    });
    writeRepoTemplate('clash.yaml', {
      name: 'clash',
      description: 'File',
      tasks: [{ name: 'T' }],
    });

    const result = getByName(db, 'clash', repoDir);
    expect(result?.source).toBe('file:repo');
    expect(result?.description).toBe('File');
  });
});

describe('getById', () => {
  test('finds file template by file:repo ID', () => {
    writeRepoTemplate('my-tmpl.yaml', {
      name: 'my-tmpl',
      tasks: [{ name: 'Task' }],
    });

    const result = getById(db, 'file:repo:my-tmpl', repoDir);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('my-tmpl');
  });

  test('finds DB template by tmpl_ ID', () => {
    const created = templateService.create(db, {
      name: 'db-tmpl',
      template: { tasks: [{ name: 'T' }] },
    });

    const result = getById(db, created.id, repoDir);
    expect(result).not.toBeNull();
    expect(result?.source).toBe('db');
  });

  test('returns null for non-existent file ID', () => {
    const result = getById(db, 'file:repo:nope', repoDir);
    expect(result).toBeNull();
  });

  test('returns null for non-existent DB ID', () => {
    const result = getById(db, 'tmpl_notfound12', repoDir);
    expect(result).toBeNull();
  });
});

describe('applyTemplate', () => {
  test('applies DB template', () => {
    const created = templateService.create(db, {
      name: 'db-apply',
      template: { tasks: [{ name: 'Task 1' }] },
    });

    const result = applyTemplate(db, created.id, { workflowName: 'Test WF' }, repoDir);
    expect(result.workflow_id).toBeTruthy();
  });

  test('applies file template', () => {
    writeRepoTemplate('file-apply.yaml', {
      name: 'file-apply',
      tasks: [{ name: 'Task {{name}}' }],
      variables: [{ name: 'name', required: true }],
    });

    const result = applyTemplate(
      db,
      'file:repo:file-apply',
      { workflowName: 'Test', variables: { name: 'hello' } },
      repoDir,
    );
    expect(result.workflow_id).toBeTruthy();
  });

  test('applies file template variable defaults', () => {
    writeRepoTemplate('with-defaults.yaml', {
      name: 'with-defaults',
      tasks: [{ name: '{{greeting}} {{target}}' }],
      variables: [
        { name: 'greeting', default: 'Hello' },
        { name: 'target', required: true },
      ],
    });

    const result = applyTemplate(
      db,
      'file:repo:with-defaults',
      { workflowName: 'Test', variables: { target: 'World' } },
      repoDir,
    );
    expect(result.workflow_id).toBeTruthy();
  });

  test('throws for missing file template', () => {
    expect(() => applyTemplate(db, 'file:repo:nope', { workflowName: 'Test' }, repoDir)).toThrow(
      'Template not found',
    );
  });
});
