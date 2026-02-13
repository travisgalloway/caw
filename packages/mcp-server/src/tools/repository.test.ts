import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { createConnection, runMigrations } from '@caw/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../server';
import { getToolHandler, parseContent, parseError } from './__test-utils';
import type { ToolErrorInfo } from './types';

describe('repository tools', () => {
  let db: DatabaseType;
  let call: (name: string, args: Record<string, unknown>) => CallToolResult;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
    const server = createMcpServer(db);
    call = (name, args) => {
      const handler = getToolHandler(server, name);
      return handler(args) as CallToolResult;
    };
  });

  // --- repository_register ---

  describe('repository_register', () => {
    it('registers a repository and returns id', () => {
      const result = call('repository_register', { path: '/home/user/project' });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { id: string };
      expect(data.id).toMatch(/^rp_/);
    });

    it('accepts optional name', () => {
      const result = call('repository_register', {
        path: '/home/user/project',
        name: 'My Project',
      });
      expect(result.isError).toBeUndefined();
    });

    it('returns existing repo for duplicate path', () => {
      const result1 = call('repository_register', { path: '/home/user/project' });
      const result2 = call('repository_register', { path: '/home/user/project' });
      const data1 = parseContent(result1) as { id: string };
      const data2 = parseContent(result2) as { id: string };
      expect(data1.id).toBe(data2.id);
    });
  });

  // --- repository_list ---

  describe('repository_list', () => {
    it('returns empty list when no repositories', () => {
      const result = call('repository_list', {});
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { repositories: unknown[]; total: number };
      expect(data.repositories).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('returns registered repositories', () => {
      call('repository_register', { path: '/home/user/project1' });
      call('repository_register', { path: '/home/user/project2' });

      const result = call('repository_list', {});
      const data = parseContent(result) as { repositories: unknown[]; total: number };
      expect(data.total).toBe(2);
      expect(data.repositories).toHaveLength(2);
    });

    it('respects limit and offset', () => {
      call('repository_register', { path: '/home/user/p1' });
      call('repository_register', { path: '/home/user/p2' });
      call('repository_register', { path: '/home/user/p3' });

      const result = call('repository_list', { limit: 2, offset: 0 });
      const data = parseContent(result) as { repositories: unknown[]; total: number };
      expect(data.repositories).toHaveLength(2);
      expect(data.total).toBe(3);
    });
  });

  // --- repository_get ---

  describe('repository_get', () => {
    it('returns repository by path', () => {
      call('repository_register', { path: '/home/user/project', name: 'Test' });
      const result = call('repository_get', { path: '/home/user/project' });
      expect(result.isError).toBeUndefined();
      const data = parseContent(result) as { path: string; name: string };
      expect(data.path).toBe('/home/user/project');
      expect(data.name).toBe('Test');
    });

    it('returns REPOSITORY_NOT_FOUND for missing repository', () => {
      const result = call('repository_get', { path: '/nonexistent/path' });
      const err = parseError(result);
      expect(err.code).toBe('REPOSITORY_NOT_FOUND');
      expect(err.recoverable).toBe(false);
      expect(err.suggestion).toContain('Check the repository path');
    });
  });

  // --- structured error format ---

  describe('structured error format', () => {
    it('includes all required fields in error responses', () => {
      const result = call('repository_get', { path: '/missing' });
      expect(result.isError).toBe(true);

      const err = parseContent(result) as ToolErrorInfo;
      expect(err).toHaveProperty('code');
      expect(err).toHaveProperty('message');
      expect(err).toHaveProperty('recoverable');
      expect(err).toHaveProperty('suggestion');
    });
  });
});
