#!/usr/bin/env bun
import { createConnection, getDbPath, runMigrations } from '@caw/core';
import { resolveConfig } from '../config';
import { createMcpServer, startServer } from '../server';

const args = parseArgs(process.argv.slice(2));
const config = resolveConfig(args);

const dbPath = config.dbPath ?? getDbPath(config.dbMode, config.repoPath);
console.error(`caw: database at ${dbPath}`);
console.error(`caw: transport=${config.transport}, mode=${config.dbMode}`);

const db = createConnection(dbPath);
runMigrations(db);

const server = createMcpServer(db);
await startServer(server, config);

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') && i + 1 < argv.length) {
      const key = arg.slice(2);
      result[key] = argv[++i];
    }
  }
  return result;
}
