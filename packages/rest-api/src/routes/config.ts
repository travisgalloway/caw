import type { DatabaseType } from '@caw/core';
import { getConfigPaths, loadConfig } from '@caw/core';
import { ok } from '../response';
import type { Router } from '../router';

export interface ConfigResponse {
  config: Record<string, unknown>;
  diagnostics: {
    dbPath: string;
    repoConfigPath: string | null;
    globalConfigPath: string;
    warnings: string[];
  };
}

export function registerConfigRoutes(router: Router, db: DatabaseType) {
  // Get current configuration
  router.get('/api/config', () => {
    try {
      const repoPath = process.cwd();

      // Load merged configuration
      const { config, warnings } = loadConfig(repoPath);

      // Get config file paths
      const paths = getConfigPaths(repoPath);

      // Get database path
      const dbPath = (db as { filename: string }).filename;

      return ok<ConfigResponse>({
        config,
        diagnostics: {
          dbPath,
          repoConfigPath: paths.repo,
          globalConfigPath: paths.global,
          warnings,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load config: ${msg}`);
    }
  });
}
