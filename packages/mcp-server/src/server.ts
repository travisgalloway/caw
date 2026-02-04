import type { DatabaseType } from '@caw/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ServerConfig } from './config';
import { registerAllTools } from './tools/index';

export function createMcpServer(db: DatabaseType): McpServer {
  const server = new McpServer({ name: 'caw', version: '0.1.0' });
  registerAllTools(server, db);
  return server;
}

export async function startServer(server: McpServer, config: ServerConfig): Promise<void> {
  if (config.transport === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    const { WebStandardStreamableHTTPServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
    );

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    await server.connect(transport);

    Bun.serve({
      port: config.port,
      async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === '/mcp') {
          return transport.handleRequest(req);
        }

        if (url.pathname === '/health') {
          return new Response('OK', { status: 200 });
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    console.error(`caw MCP server listening on http://localhost:${config.port}/mcp`);
  }
}
