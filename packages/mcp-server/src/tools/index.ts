import type { DatabaseType } from '@caw/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { register as registerAgent } from './agent';
import { register as registerCheckpoint } from './checkpoint';
import { register as registerContext } from './context';
import { register as registerMessaging } from './messaging';
import { register as registerOrchestration } from './orchestration';
import { register as registerRepository } from './repository';
import { register as registerTask } from './task';
import { register as registerTemplate } from './template';
import { register as registerWorkflow } from './workflow';
import { register as registerWorkspace } from './workspace';

export function registerAllTools(server: McpServer, db: DatabaseType): void {
  registerWorkflow(server, db);
  registerTask(server, db);
  registerCheckpoint(server, db);
  registerContext(server, db);
  registerOrchestration(server, db);
  registerWorkspace(server, db);
  registerRepository(server, db);
  registerTemplate(server, db);
  registerAgent(server, db);
  registerMessaging(server, db);
}
