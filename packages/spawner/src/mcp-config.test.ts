import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { buildMcpConfigFile, cleanupMcpConfigFile } from './mcp-config';

describe('buildMcpConfigFile', () => {
  test('writes a JSON file and returns its path', () => {
    const filePath = buildMcpConfigFile('http://localhost:3100/mcp');

    expect(filePath).toContain('caw-mcp-');
    expect(filePath).toEndWith('.json');
    expect(existsSync(filePath)).toBe(true);

    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content).toEqual({
      mcpServers: {
        caw: {
          type: 'sse',
          url: 'http://localhost:3100/mcp',
        },
      },
    });

    cleanupMcpConfigFile(filePath);
  });

  test('uses the provided URL in the config', () => {
    const filePath = buildMcpConfigFile('http://example.com:9999/mcp');

    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.mcpServers.caw.url).toBe('http://example.com:9999/mcp');

    cleanupMcpConfigFile(filePath);
  });

  test('creates unique file paths', () => {
    const path1 = buildMcpConfigFile('http://localhost:3100/mcp');
    const path2 = buildMcpConfigFile('http://localhost:3100/mcp');

    expect(path1).not.toBe(path2);

    cleanupMcpConfigFile(path1);
    cleanupMcpConfigFile(path2);
  });
});

describe('cleanupMcpConfigFile', () => {
  test('removes the file', () => {
    const filePath = buildMcpConfigFile('http://localhost:3100/mcp');
    expect(existsSync(filePath)).toBe(true);

    cleanupMcpConfigFile(filePath);
    expect(existsSync(filePath)).toBe(false);
  });

  test('does not throw if file does not exist', () => {
    expect(() => cleanupMcpConfigFile('/tmp/nonexistent-file.json')).not.toThrow();
  });
});
