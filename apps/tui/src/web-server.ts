import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { DatabaseType } from '@caw/core';
import { createHttpHandler, createMcpServer } from '@caw/mcp-server';
import { createBroadcaster, createRestApi, createWsHandler } from '@caw/rest-api';

export interface WebServerOptions {
  port: number;
  staticDir?: string;
  quiet?: boolean;
}

export async function runWebServer(db: DatabaseType, opts: WebServerOptions): Promise<void> {
  const port = opts.port;

  // MCP server + HTTP handler (pass db for multi-session support)
  const mcpServer = createMcpServer(db);
  const mcpHandler = await createHttpHandler(mcpServer, db);

  // REST API with broadcaster
  const broadcaster = createBroadcaster();
  const restApi = createRestApi(db, broadcaster);

  // WebSocket handler
  const wsHandler = createWsHandler(broadcaster);

  // Resolve static file directory
  const staticDirs = [
    opts.staticDir,
    join(import.meta.dir, '../../web-ui-dist'),
    join(import.meta.dir, '../../../apps/web-ui/build'),
    join(dirname(process.execPath), 'web-ui'),
  ].filter(Boolean) as string[];

  const staticDir = staticDirs.find((d) => existsSync(d));

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

      // Static files (SvelteKit build output)
      if (staticDir) {
        return serveStatic(url.pathname, staticDir);
      }

      return new Response('Not Found', { status: 404 });
    },

    websocket: wsHandler.websocket,
  });

  const shutdown = () => {
    server.stop();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (!opts.quiet) {
    console.error(`caw web server listening on http://localhost:${port}`);
    console.error(`  MCP:    http://localhost:${port}/mcp`);
    console.error(`  REST:   http://localhost:${port}/api/`);
    console.error(`  WS:     ws://localhost:${port}/ws`);
    if (staticDir) {
      console.error(`  Web UI: http://localhost:${port}/`);
    } else {
      console.error(`  Web UI: not found (run 'bun run --filter @caw/web-ui build' first)`);
    }
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function serveStatic(pathname: string, staticDir: string): Response {
  const filePath = join(staticDir, pathname);

  // Path traversal protection
  const resolvedDir = resolve(staticDir);
  const resolvedFile = resolve(filePath);
  if (!resolvedFile.startsWith(resolvedDir)) {
    return new Response('Not Found', { status: 404 });
  }

  // Try the file directly
  if (isFile(filePath)) {
    return new Response(Bun.file(filePath));
  }

  // Try with /index.html for directory paths
  const indexPath = join(filePath, 'index.html');
  if (isFile(indexPath)) {
    return new Response(Bun.file(indexPath));
  }

  // SPA fallback — serve root index.html for client-side routing
  const rootIndex = join(staticDir, 'index.html');
  if (isFile(rootIndex)) {
    return new Response(Bun.file(rootIndex));
  }

  return new Response('Not Found', { status: 404 });
}
