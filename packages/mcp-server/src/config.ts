export type TransportType = 'stdio' | 'http';
export type DbMode = 'global' | 'repository';

export interface ServerConfig {
  transport: TransportType;
  port: number;
  dbMode: DbMode;
  repoPath?: string;
  dbPath?: string;
}

export const DEFAULT_PORT = 3100;

export function resolveConfig(args: {
  transport?: string;
  port?: string;
  mode?: string;
  repoPath?: string;
  dbPath?: string;
}): ServerConfig {
  const transport = parseTransport(args.transport ?? process.env.CAW_TRANSPORT ?? 'stdio');
  const port = parsePort(args.port ?? process.env.CAW_PORT);
  const dbMode = parseDbMode(args.mode ?? process.env.CAW_DB_MODE ?? 'repository');
  const repoPath =
    args.repoPath ??
    process.env.CAW_REPO_PATH ??
    (dbMode === 'repository' ? process.cwd() : undefined);
  const dbPath = args.dbPath ?? process.env.CAW_DB_PATH;

  return { transport, port, dbMode, repoPath, dbPath };
}

function parseTransport(value: string): TransportType {
  if (value === 'stdio' || value === 'http') return value;
  throw new Error(`Invalid transport: '${value}'. Must be 'stdio' or 'http'.`);
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
  if (value === 'global' || value === 'repository') return value;
  throw new Error(`Invalid db mode: '${value}'. Must be 'global' or 'repository'.`);
}
