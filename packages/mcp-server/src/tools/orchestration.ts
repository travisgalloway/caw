import { orchestrationService } from '@caw/core';
import { z } from 'zod';
import type { ToolRegistrar } from './types';
import { defineTool, handleToolCall } from './types';

export const register: ToolRegistrar = (server, db) => {
  defineTool(
    server,
    'workflow_next_tasks',
    {
      description: 'Get next actionable tasks that are unblocked and pending/failed',
      inputSchema: {
        workflow_id: z.string().describe('Workflow ID'),
        include_failed: z
          .boolean()
          .optional()
          .describe('Include failed tasks for retry, default true'),
      },
    },
    (args) =>
      handleToolCall(() => {
        return orchestrationService.getNextTasks(db, args.workflow_id, args.include_failed ?? true);
      }),
  );

  defineTool(
    server,
    'workflow_progress',
    {
      description: 'Get workflow progress overview',
      inputSchema: {
        workflow_id: z.string().describe('Workflow ID'),
      },
    },
    (args) =>
      handleToolCall(() => {
        return orchestrationService.getProgress(db, args.workflow_id);
      }),
  );

  defineTool(
    server,
    'task_check_dependencies',
    {
      description: 'Check if task dependencies are satisfied',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
      },
    },
    (args) =>
      handleToolCall(() => {
        return orchestrationService.checkDependencies(db, args.task_id);
      }),
  );
};
