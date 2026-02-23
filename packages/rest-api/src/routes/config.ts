import type { DatabaseType } from '@caw/core';
import { getConfigPaths, loadConfig, writeConfig } from '@caw/core';
import { badRequest, ok, parseBody } from '../response';
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
      const { config, warnings } = loadConfig(repoPath);
      const paths = getConfigPaths(repoPath);
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

  // Update configuration
  router.put('/api/config', async (req) => {
    const body = await parseBody<Record<string, unknown>>(req);
    if (!body) {
      return badRequest('Request body is required');
    }

    try {
      const repoPath = process.cwd();
      const paths = getConfigPaths(repoPath);

      // Write to repo config if it exists, otherwise global
      const targetPath = paths.repo ?? paths.global;
      writeConfig(targetPath, body);

      // Reload and return updated config
      const { config, warnings } = loadConfig(repoPath);
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
      return badRequest(`Failed to write config: ${msg}`);
    }
  });
}
