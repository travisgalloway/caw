import type { DatabaseType } from '@caw/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { register as registerAgent } from './agent';
import { register as registerCheckpoint } from './checkpoint';
import { register as registerContext } from './context';
import { register as registerMessaging } from './messaging';
import { register as registerOrchestration } from './orchestration';
import { register as registerReplanning } from './replanning';
import { register as registerRepository } from './repository';
import { register as registerSpawner } from './spawner';
import { register as registerTask } from './task';
import { register as registerTemplate } from './template';
import type { ToolContext } from './types';
import { register as registerWorkflow } from './workflow';
import { register as registerWorkspace } from './workspace';

export function registerAllTools(server: McpServer, db: DatabaseType, context?: ToolContext): void {
  registerWorkflow(server, db);
  registerTask(server, db);
  registerCheckpoint(server, db);
  registerContext(server, db);
  registerOrchestration(server, db);
  registerWorkspace(server, db);
  registerRepository(server, db);
  registerTemplate(server, db, context);
  registerAgent(server, db);
  registerMessaging(server, db);
  registerReplanning(server, db);
  registerSpawner(server, db);
}
