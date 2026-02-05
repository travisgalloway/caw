import type { DatabaseType } from '@caw/core';
import { createMcpServer, resolveConfig, startServer } from '@caw/mcp-server';

export interface ServerOptions {
  transport?: string;
  port?: string;
}

export async function runServer(db: DatabaseType, opts: ServerOptions): Promise<void> {
  const config = resolveConfig({
    transport: opts.transport,
    port: opts.port,
  });

  const server = createMcpServer(db);

  const shutdown = () => {
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await startServer(server, config);
}
