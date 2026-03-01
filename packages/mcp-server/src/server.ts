import type { DatabaseType } from '@caw/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ServerConfig } from './config';
import { registerAllTools } from './tools/index';
import type { ToolContext } from './tools/types';

export interface McpServerOptions {
  repoPath?: string;
}

export function createMcpServer(db: DatabaseType, options?: McpServerOptions): McpServer {
  const server = new McpServer({ name: 'caw', version: '0.1.0' });
  const context: ToolContext | undefined = options?.repoPath
    ? { repoPath: options.repoPath }
    : undefined;
  registerAllTools(server, db, context);
  return server;
}

export interface McpHttpHandler {
  handleRequest: (req: Request) => Response | Promise<Response>;
}

export async function createHttpHandler(
  server: McpServer,
  db?: DatabaseType,
  options?: McpServerOptions,
): Promise<McpHttpHandler> {
  const { WebStandardStreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
  );

  type TransportType = InstanceType<typeof WebStandardStreamableHTTPServerTransport>;
  const sessions = new Map<string, { transport: TransportType; server: McpServer }>();

  async function createSession(): Promise<TransportType> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        sessions.set(sessionId, { transport, server: sessionServer });
      },
    });

    const sessionServer = db ? createMcpServer(db, options) : server;
    await sessionServer.connect(transport);
    return transport;
  }

  return {
    async handleRequest(req: Request) {
      const sessionHeader = req.headers.get('mcp-session-id');

      if (sessionHeader) {
        const session = sessions.get(sessionHeader);
        if (session) {
          return session.transport.handleRequest(req);
        }
      }

      if (req.method === 'POST' && !sessionHeader) {
        const transport = await createSession();
        return transport.handleRequest(req);
      }

      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No active session' },
          id: null,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    },
  };
}

export interface StartServerResult {
  stop: () => void;
}

export async function startServer(
  server: McpServer,
  config: ServerConfig,
  db?: DatabaseType,
  options?: McpServerOptions,
): Promise<StartServerResult> {
  if (config.transport === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return { stop() {} };
  } else {
    const { WebStandardStreamableHTTPServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
    );

    type TransportType = InstanceType<typeof WebStandardStreamableHTTPServerTransport>;

    // The MCP SDK's WebStandardStreamableHTTPServerTransport only supports one session
    // per transport instance. To support multiple concurrent clients (planner + workers),
    // we create a new transport + server pair for each session.
    const sessions = new Map<string, { transport: TransportType; server: McpServer }>();

    async function createSession(): Promise<TransportType> {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sessionId: string) => {
          sessions.set(sessionId, { transport, server: sessionServer });
        },
      });

      // Create a new server instance with the same tools for this session.
      // If db was provided, create a fresh server; otherwise reuse the original.
      const sessionServer = db ? createMcpServer(db, options) : server;
      await sessionServer.connect(transport);
      return transport;
    }

    const httpServer = Bun.serve({
      port: config.port,
      idleTimeout: 255,
      async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === '/mcp') {
          const sessionHeader = req.headers.get('mcp-session-id');

          // Route to existing session
          if (sessionHeader) {
            const session = sessions.get(sessionHeader);
            if (session) {
              return session.transport.handleRequest(req);
            }
            // Unknown session ID — fall through to error
          }

          // New initialization request (POST without session header)
          if (req.method === 'POST' && !sessionHeader) {
            const transport = await createSession();
            return transport.handleRequest(req);
          }

          // GET/DELETE without a known session
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Bad Request: No active session' },
              id: null,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (url.pathname === '/health') {
          return new Response('OK', { status: 200 });
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    if (!config.quiet) {
      console.error(`caw MCP server listening on http://localhost:${config.port}/mcp`);
    }

    return {
      stop() {
        httpServer.stop();
        for (const session of sessions.values()) {
          session.transport.close();
        }
        sessions.clear();
      },
    };
  }
}
