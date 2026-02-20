import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseType } from '@caw/core';
import { ok } from '../response';
import type { Router } from '../router';

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'fail';
  message: string;
}

export interface SetupDiagnostics {
  checks: DiagnosticCheck[];
  allPassed: boolean;
}

export function registerSetupRoutes(router: Router, db: DatabaseType) {
  // Get setup diagnostics
  router.get('/api/setup/diagnostics', () => {
    const checks: DiagnosticCheck[] = [];

    // Check 1: Database exists
    try {
      // The db.filename property gives us the path to the database file
      const dbPath = (db as { filename: string }).filename;
      const dbExists = dbPath === ':memory:' || existsSync(dbPath);
      checks.push({
        name: 'database',
        status: dbExists ? 'pass' : 'fail',
        message: dbExists
          ? `Database file exists at ${dbPath}`
          : `Database file not found at ${dbPath}`,
      });
    } catch (err) {
      checks.push({
        name: 'database',
        status: 'fail',
        message: `Failed to check database: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Check 2: MCP server configured (.claude/settings.json)
    try {
      const mcpConfigPath = join(homedir(), '.claude', 'settings.json');
      const mcpExists = existsSync(mcpConfigPath);
      checks.push({
        name: 'mcp_server',
        status: mcpExists ? 'pass' : 'fail',
        message: mcpExists
          ? 'MCP server configuration found'
          : 'MCP server not configured in .claude/settings.json',
      });
    } catch (err) {
      checks.push({
        name: 'mcp_server',
        status: 'fail',
        message: `Failed to check MCP config: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Check 3: CLAUDE.md exists and has caw section
    try {
      const cwd = process.cwd();
      const claudeMdPath = join(cwd, 'CLAUDE.md');
      const claudeMdExists = existsSync(claudeMdPath);

      if (!claudeMdExists) {
        checks.push({
          name: 'claude_md',
          status: 'fail',
          message: 'CLAUDE.md file not found in repository root',
        });
      } else {
        const content = readFileSync(claudeMdPath, 'utf-8');
        const hasCawSection = content.toLowerCase().includes('caw');
        checks.push({
          name: 'claude_md',
          status: hasCawSection ? 'pass' : 'fail',
          message: hasCawSection
            ? 'CLAUDE.md exists with caw integration'
            : 'CLAUDE.md exists but does not mention caw',
        });
      }
    } catch (err) {
      checks.push({
        name: 'claude_md',
        status: 'fail',
        message: `Failed to check CLAUDE.md: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Check 4: Config file exists (.caw/config.json)
    try {
      const cwd = process.cwd();
      const configPath = join(cwd, '.caw', 'config.json');
      const configExists = existsSync(configPath);
      checks.push({
        name: 'config_file',
        status: configExists ? 'pass' : 'fail',
        message: configExists
          ? 'Config file exists at .caw/config.json'
          : 'Config file not found at .caw/config.json',
      });
    } catch (err) {
      checks.push({
        name: 'config_file',
        status: 'fail',
        message: `Failed to check config file: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Check 5: .gitignore includes .caw/
    try {
      const cwd = process.cwd();
      const gitignorePath = join(cwd, '.gitignore');
      const gitignoreExists = existsSync(gitignorePath);

      if (!gitignoreExists) {
        checks.push({
          name: 'gitignore',
          status: 'fail',
          message: '.gitignore file not found',
        });
      } else {
        const content = readFileSync(gitignorePath, 'utf-8');
        const hasCawEntry = content.split('\n').some((line) => {
          const trimmed = line.trim();
          return trimmed === '.caw/' || trimmed === '.caw' || trimmed.startsWith('.caw/');
        });
        checks.push({
          name: 'gitignore',
          status: hasCawEntry ? 'pass' : 'fail',
          message: hasCawEntry
            ? '.gitignore includes .caw/ directory'
            : '.gitignore does not include .caw/ directory',
        });
      }
    } catch (err) {
      checks.push({
        name: 'gitignore',
        status: 'fail',
        message: `Failed to check .gitignore: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    const allPassed = checks.every((check) => check.status === 'pass');

    return ok<SetupDiagnostics>({ checks, allPassed });
  });
}
