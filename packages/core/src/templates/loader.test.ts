import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { extractVariableDefaults, loadTemplatesFromDir } from './loader';

let tempDir: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `caw-loader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('loadTemplatesFromDir', () => {
  test('loads JSON template', () => {
    const tmpl = {
      name: 'test-json',
      description: 'A JSON template',
      tasks: [{ name: 'Task 1', description: 'Do something' }],
    };
    writeFileSync(join(tempDir, 'test-json.json'), JSON.stringify(tmpl));

    const result = loadTemplatesFromDir(tempDir, 'file:repo');
    expect(result.warnings).toHaveLength(0);
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe('test-json');
    expect(result.templates[0].id).toBe('file:repo:test-json');
    expect(result.templates[0].source).toBe('file:repo');
  });

  test('loads YAML template (.yaml)', () => {
    const tmpl = {
      name: 'test-yaml',
      description: 'A YAML template',
      tasks: [{ name: 'Task 1' }],
    };
    writeFileSync(join(tempDir, 'test-yaml.yaml'), stringifyYaml(tmpl));

    const result = loadTemplatesFromDir(tempDir, 'file:repo');
    expect(result.warnings).toHaveLength(0);
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe('test-yaml');
  });

  test('loads YAML template (.yml)', () => {
    const tmpl = {
      name: 'test-yml',
      tasks: [{ name: 'Task 1' }],
    };
    writeFileSync(join(tempDir, 'test-yml.yml'), stringifyYaml(tmpl));

    const result = loadTemplatesFromDir(tempDir, 'file:global');
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].id).toBe('file:global:test-yml');
    expect(result.templates[0].source).toBe('file:global');
  });

  test('loads multiple templates from a directory', () => {
    writeFileSync(
      join(tempDir, 'a.json'),
      JSON.stringify({ name: 'alpha', tasks: [{ name: 'T1' }] }),
    );
    writeFileSync(
      join(tempDir, 'b.yaml'),
      stringifyYaml({ name: 'beta', tasks: [{ name: 'T2' }] }),
    );

    const result = loadTemplatesFromDir(tempDir, 'file:repo');
    expect(result.templates).toHaveLength(2);
  });

  test('reports warnings for invalid files', () => {
    writeFileSync(join(tempDir, 'bad.json'), '{"name": "no-tasks"}');

    const result = loadTemplatesFromDir(tempDir, 'file:repo');
    expect(result.templates).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('bad.json');
  });

  test('reports warnings for malformed JSON', () => {
    writeFileSync(join(tempDir, 'broken.json'), '{not valid json');

    const result = loadTemplatesFromDir(tempDir, 'file:repo');
    expect(result.templates).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  test('ignores non-template files', () => {
    writeFileSync(join(tempDir, 'readme.md'), '# Hello');
    writeFileSync(join(tempDir, 'data.txt'), 'just text');

    const result = loadTemplatesFromDir(tempDir, 'file:repo');
    expect(result.templates).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('returns empty for non-existent directory', () => {
    const result = loadTemplatesFromDir('/tmp/does-not-exist-caw-test', 'file:repo');
    expect(result.templates).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('normalizes variables from rich declarations to string[]', () => {
    const tmpl = {
      name: 'with-vars',
      variables: [
        'simple_var',
        { name: 'rich_var', description: 'A rich variable', required: true, default: 'hello' },
      ],
      tasks: [{ name: 'Task {{simple_var}} {{rich_var}}' }],
    };
    writeFileSync(join(tempDir, 'with-vars.yaml'), stringifyYaml(tmpl));

    const result = loadTemplatesFromDir(tempDir, 'file:repo');
    expect(result.templates).toHaveLength(1);

    const def = result.templates[0].definition;
    expect(def.variables).toEqual(['simple_var', 'rich_var']);
  });

  test('sets synthetic timestamps to 0', () => {
    writeFileSync(join(tempDir, 'ts.json'), JSON.stringify({ name: 'ts', tasks: [{ name: 'T' }] }));

    const result = loadTemplatesFromDir(tempDir, 'file:repo');
    expect(result.templates[0].created_at).toBe(0);
    expect(result.templates[0].updated_at).toBe(0);
  });
});

describe('extractVariableDefaults', () => {
  test('returns empty for undefined', () => {
    expect(extractVariableDefaults(undefined)).toEqual({});
  });

  test('returns empty for string-only variables', () => {
    expect(extractVariableDefaults(['a', 'b'])).toEqual({});
  });

  test('extracts defaults from rich variables', () => {
    const vars = [
      'simple',
      { name: 'with_default', default: 'hello' },
      { name: 'no_default', description: 'desc' },
    ];
    expect(extractVariableDefaults(vars)).toEqual({ with_default: 'hello' });
  });
});
