import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CawConfig } from './schema';
import { validateConfig } from './validate';

export function readConfigFile(filePath: string): { config: CawConfig; warnings: string[] } {
  if (!existsSync(filePath)) {
    return { config: {}, warnings: [] };
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const raw = JSON.parse(content);
    const result = validateConfig(raw);
    return { config: result.config, warnings: result.warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { config: {}, warnings: [`Failed to read config at ${filePath}: ${msg}`] };
  }
}

export function getConfigPaths(repoPath?: string): { repo: string | null; global: string } {
  const globalPath = join(homedir(), '.caw', 'config.json');
  const repoConfigPath = repoPath ? join(repoPath, '.caw', 'config.json') : null;
  return { repo: repoConfigPath, global: globalPath };
}

export function mergeConfigs(...configs: CawConfig[]): CawConfig {
  const result: CawConfig = {};

  for (const config of configs) {
    if (config.transport !== undefined) result.transport = config.transport;
    if (config.port !== undefined) result.port = config.port;
    if (config.dbMode !== undefined) result.dbMode = config.dbMode;
    if (config.agent !== undefined) {
      result.agent = { ...result.agent, ...config.agent };
    }
  }

  return result;
}

export interface LoadConfigResult {
  config: CawConfig;
  warnings: string[];
}

export function loadConfig(repoPath?: string): LoadConfigResult {
  const paths = getConfigPaths(repoPath);
  const allWarnings: string[] = [];

  const globalResult = readConfigFile(paths.global);
  allWarnings.push(...globalResult.warnings);

  let repoConfig: CawConfig = {};
  if (paths.repo) {
    const repoResult = readConfigFile(paths.repo);
    repoConfig = repoResult.config;
    allWarnings.push(...repoResult.warnings);
  }

  // Merge: global (lowest) → repo (highest among file configs)
  const config = mergeConfigs(globalResult.config, repoConfig);

  return { config, warnings: allWarnings };
}

export function writeConfig(filePath: string, config: CawConfig): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}
