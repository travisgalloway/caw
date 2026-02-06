import { repositoryService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall, ToolCallError } from './types';

function toToolCallError(err: unknown): never {
  if (err instanceof ToolCallError) throw err;
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('Repository not found')) {
    throw new ToolCallError({
      code: 'REPOSITORY_NOT_FOUND',
      message: msg,
      recoverable: false,
      suggestion: 'Check the repository path and try again',
    });
  }

  throw err;
}

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'repository_register',
    {
      description: 'Register a repository',
      inputSchema: {
        path: z.string().describe('Absolute path to repository'),
        name: z.string().optional().describe('Friendly name'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const repo = repositoryService.register(db, {
          path: args.path,
          name: args.name,
        });
        return { id: repo.id };
      }),
  );

  defineTool(
    server,
    'repository_list',
    {
      description: 'List registered repositories',
      inputSchema: {
        limit: z.number().int().optional().describe('Max results'),
        offset: z.number().int().optional().describe('Pagination offset'),
      },
    },
    (args) =>
      handleToolCall(() => {
        return repositoryService.list(db, {
          limit: args.limit,
          offset: args.offset,
        });
      }),
  );

  defineTool(
    server,
    'repository_get',
    {
      description: 'Get repository by path',
      inputSchema: {
        path: z.string().describe('Repository path'),
      },
    },
    (args) =>
      handleToolCall(() => {
        try {
          const repo = repositoryService.getByPath(db, args.path);
          if (!repo) {
            throw new Error(`Repository not found at path: ${args.path}`);
          }
          return repo;
        } catch (err) {
          toToolCallError(err);
        }
      }),
  );
};
