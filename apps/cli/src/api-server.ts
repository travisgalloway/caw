import type { DatabaseType } from '@caw/core';
import { createHttpHandler, createMcpServer } from '@caw/mcp-server';
import { createBroadcaster, createRestApi, createWsHandler } from '@caw/rest-api';

export interface ApiServerOptions {
  port: number;
  quiet?: boolean;
  repoPath?: string;
}

export async function runApiServer(db: DatabaseType, opts: ApiServerOptions): Promise<void> {
  const port = opts.port;
  const mcpOptions = opts.repoPath ? { repoPath: opts.repoPath } : undefined;

  // MCP server + HTTP handler (pass db for multi-session support)
  const mcpServer = createMcpServer(db, mcpOptions);
  const mcpHandler = await createHttpHandler(mcpServer, db, mcpOptions);

  // REST API with broadcaster
  const broadcaster = createBroadcaster();
  const restApi = createRestApi(db, broadcaster, { repoPath: opts.repoPath });

  // WebSocket handler
  const wsHandler = createWsHandler(broadcaster);

  const server = Bun.serve({
    port,
    idleTimeout: 255,

    async fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade
      if (url.pathname === '/ws') {
        if (wsHandler.upgrade(req, server)) {
          return undefined as unknown as Response;
        }
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // MCP endpoint
      if (url.pathname === '/mcp') {
        return mcpHandler.handleRequest(req);
      }

      // Health check
      if (url.pathname === '/health') {
        return new Response('OK', { status: 200 });
      }

      // REST API
      if (url.pathname.startsWith('/api/')) {
        return restApi.handle(req);
      }

      return new Response('Not Found', { status: 404 });
    },

    websocket: wsHandler.websocket,
  });

  // Auto-resume in_progress workflows
  const { resumeWorkflows } = await import('@caw/spawner');
  const { createPrCycleHook } = await import('./utils/create-pr-cycle-hook');
  const prCycleHook = createPrCycleHook(db, { repoPath: process.cwd(), port });
  const resumeResult = await resumeWorkflows(db, {
    mcpServerUrl: `http://localhost:${port}/mcp`,
    cwd: process.cwd(),
    onAwaitingMerge: prCycleHook,
  });
  if (resumeResult.resumed.length > 0) {
    console.error(`Resumed ${resumeResult.resumed.length} workflow(s)`);
  }
  for (const err of resumeResult.errors) {
    console.error(`Failed to resume workflow ${err.workflowId}: ${err.error}`);
  }

  const shutdown = () => {
    server.stop();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (!opts.quiet) {
    console.error(`caw server listening on http://localhost:${port}`);
    console.error(`  MCP:  http://localhost:${port}/mcp`);
    console.error(`  REST: http://localhost:${port}/api/`);
    console.error(`  WS:   ws://localhost:${port}/ws`);
  }
}
