#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { createConnection, getDbPath, runMigrations } from '@caw/core';

function printUsage(): void {
  console.log(`Usage: caw [options]

Options:
  --server              Run as headless MCP server (no TUI)
  --transport <type>    MCP transport: stdio | http (default: stdio)
  --port <number>       HTTP port (default: 3100)
  --db <path>           Database file path
  --workflow <id>       Focus on a specific workflow
  -h, --help            Show this help message
`);
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    server: { type: 'boolean', default: false },
    transport: { type: 'string' },
    port: { type: 'string' },
    db: { type: 'string' },
    workflow: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
});

if (values.help) {
  printUsage();
  process.exit(0);
}

const dbPath = values.db ?? getDbPath('repository', process.cwd());
const db = createConnection(dbPath);
runMigrations(db);

if (values.server) {
  const { runServer } = await import('../server');
  await runServer(db, {
    transport: values.transport,
    port: values.port,
  });
} else {
  const { runTui } = await import('../app');
  await runTui(db, {
    workflow: values.workflow,
  });
}
