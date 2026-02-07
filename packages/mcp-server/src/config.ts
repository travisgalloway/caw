import { loadConfig } from '@caw/core';

export type TransportType = 'stdio' | 'sse';
export type DbMode = 'global' | 'per-repo';

export interface ServerConfig {
  transport: TransportType;
  port: number;
  dbMode: DbMode;
  repoPath?: string;
  dbPath?: string;
  quiet?: boolean;
}

export const DEFAULT_PORT = 3100;

export function resolveConfig(args: {
  transport?: string;
  port?: string;
  mode?: string;
  repoPath?: string;
  dbPath?: string;
}): ServerConfig {
  // Load file-based config (global → repo, lowest priority)
  const fileConfig = loadConfig(args.repoPath ?? process.env.CAW_REPO_PATH ?? process.cwd());
  for (const w of fileConfig.warnings) {
    console.warn(`[caw config] ${w}`);
  }
  const fc = fileConfig.config;

  // Resolution order: CLI args > env vars > file config > defaults
  const transport = parseTransport(
    args.transport ?? process.env.CAW_TRANSPORT ?? fc.transport ?? 'stdio',
  );
  const port = parsePort(
    args.port ?? process.env.CAW_PORT ?? (fc.port !== undefined ? String(fc.port) : undefined),
  );
  const dbMode = parseDbMode(args.mode ?? process.env.CAW_DB_MODE ?? fc.dbMode ?? 'per-repo');
  const repoPath =
    args.repoPath ??
    process.env.CAW_REPO_PATH ??
    (dbMode === 'per-repo' ? process.cwd() : undefined);
  const dbPath = args.dbPath ?? process.env.CAW_DB_PATH;

  return { transport, port, dbMode, repoPath, dbPath };
}

function parseTransport(value: string): TransportType {
  if (value === 'stdio' || value === 'sse') return value;
  throw new Error(`Invalid transport: '${value}'. Must be 'stdio' or 'sse'.`);
}

function parsePort(value: string | undefined): number {
  if (!value) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: '${value}'. Must be an integer between 1 and 65535.`);
  }
  return port;
}

function parseDbMode(value: string): DbMode {
  if (value === 'global' || value === 'per-repo') return value;
  throw new Error(`Invalid db mode: '${value}'. Must be 'global' or 'per-repo'.`);
}
