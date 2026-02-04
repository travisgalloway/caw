import { repositoryService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall } from './types';

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
        const repo = repositoryService.getByPath(db, args.path);
        if (!repo) throw new Error(`Repository not found at path: ${args.path}`);
        return repo;
      }),
  );
};
