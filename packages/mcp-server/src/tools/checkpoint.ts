import type { CheckpointType } from '@caw/core';
import { checkpointService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall } from './types';

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'checkpoint_add',
    {
      description: 'Add a checkpoint to a task for fine-grained recovery',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
        type: z
          .enum(['plan', 'progress', 'decision', 'error', 'recovery', 'complete', 'replan'])
          .describe('Checkpoint type'),
        summary: z.string().describe('Checkpoint summary'),
        detail: z.record(z.unknown()).optional().describe('Additional detail'),
        files_changed: z.array(z.string()).optional().describe('Files changed'),
      },
    },
    (args) =>
      handleToolCall(() => {
        return checkpointService.add(db, args.task_id, {
          type: args.type as CheckpointType,
          summary: args.summary,
          detail: args.detail,
          filesChanged: args.files_changed,
        });
      }),
  );

  defineTool(
    server,
    'checkpoint_list',
    {
      description: 'Get checkpoints for a task',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
        type: z.array(z.string()).optional().describe('Filter by checkpoint type'),
        since_sequence: z.number().int().optional().describe('Get only newer checkpoints'),
        limit: z.number().int().optional().describe('Max checkpoints to return'),
      },
    },
    (args) =>
      handleToolCall(() => {
        const checkpoints = checkpointService.list(db, args.task_id, {
          types: args.type as CheckpointType[] | undefined,
          since_sequence: args.since_sequence,
          limit: args.limit,
        });
        return { checkpoints };
      }),
  );
};
