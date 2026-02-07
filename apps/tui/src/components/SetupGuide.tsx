import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Box, Text } from 'ink';
import type React from 'react';
import { useMemo } from 'react';
import { useDbPath } from '../context/dbPath';
import { THEME } from '../utils/theme';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={THEME.accent}>
        {title}
      </Text>
      {children}
    </Box>
  );
}

function StatusLine({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}): React.JSX.Element {
  return (
    <Box>
      <Text color={ok ? THEME.success : THEME.error}>{ok ? '  [ok]' : '  [--]'}</Text>
      <Text> {label}: </Text>
      <Text dimColor>{detail}</Text>
    </Box>
  );
}

interface StatusChecks {
  dbExists: boolean;
  dbDetail: string;
  mcpConfigured: boolean;
  mcpDetail: string;
  claudeMdConfigured: boolean;
  claudeMdDetail: string;
  configExists: boolean;
  configDetail: string;
  gitignoreConfigured: boolean;
  gitignoreDetail: string;
}

function checkStatus(dbPath: string | null): StatusChecks {
  const cwd = process.cwd();

  // Database check
  let dbExists = false;
  let dbDetail = 'not found';
  if (dbPath) {
    dbExists = existsSync(dbPath);
    dbDetail = dbExists ? dbPath : `${dbPath} (not found)`;
  }

  // MCP server check
  let mcpConfigured = false;
  let mcpDetail = 'not configured (run caw setup claude-code)';
  try {
    const settingsPath = join(cwd, '.claude', 'settings.json');
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      const cawMcp = settings?.mcpServers?.caw;
      if (cawMcp) {
        const hasExpectedConfig =
          cawMcp.command === 'bunx' &&
          Array.isArray(cawMcp.args) &&
          cawMcp.args[0] === '@caw/tui' &&
          cawMcp.args.includes('--server');
        if (hasExpectedConfig) {
          mcpConfigured = true;
          mcpDetail = '.claude/settings.json configured';
        } else {
          mcpDetail = `.claude/settings.json has caw entry but unexpected config (run caw setup claude-code)`;
        }
      }
    }
  } catch {
    // ignore read errors
  }

  // CLAUDE.md check
  let claudeMdConfigured = false;
  let claudeMdDetail = 'missing caw section (run caw setup claude-code)';
  try {
    const claudeMdPath = join(cwd, 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      const content = readFileSync(claudeMdPath, 'utf-8');
      if (content.includes('Workflow Persistence (caw)')) {
        claudeMdConfigured = true;
        claudeMdDetail = 'CLAUDE.md has workflow persistence section';
      }
    }
  } catch {
    // ignore read errors
  }

  // .caw/config.json check
  let configExists = false;
  let configDetail = 'not found (run caw init)';
  try {
    const configPath = join(cwd, '.caw', 'config.json');
    if (existsSync(configPath)) {
      configExists = true;
      configDetail = '.caw/config.json found';
    }
  } catch {
    // ignore read errors
  }

  // .gitignore includes .caw/ check
  let gitignoreConfigured = false;
  let gitignoreDetail = '.caw/ not in .gitignore (run caw init)';
  try {
    const gitignorePath = join(cwd, '.gitignore');
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8');
      const lines = content.split('\n');
      if (lines.some((line) => line.trim() === '.caw/')) {
        gitignoreConfigured = true;
        gitignoreDetail = '.gitignore includes .caw/';
      }
    }
  } catch {
    // ignore read errors
  }

  return {
    dbExists,
    dbDetail,
    mcpConfigured,
    mcpDetail,
    claudeMdConfigured,
    claudeMdDetail,
    configExists,
    configDetail,
    gitignoreConfigured,
    gitignoreDetail,
  };
}

export function SetupGuide(): React.JSX.Element {
  const dbPath = useDbPath();

  const status = useMemo(() => checkStatus(dbPath), [dbPath]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={THEME.muted}
      paddingX={2}
      paddingY={1}
      marginX={1}
    >
      <Text bold color={THEME.brand}>
        Setup Guide
      </Text>
      <Text> </Text>

      <Section title="Getting Started">
        <Text>
          {' '}
          1. Run <Text bold>caw init</Text> in your repo to create .caw/ config
        </Text>
        <Text>
          {' '}
          2. Run <Text bold>caw setup claude-code</Text> to connect Claude Code
        </Text>
        <Text>
          {' '}
          3. Start caw with <Text bold>caw</Text> and create your first workflow
        </Text>
      </Section>

      <Section title="Configuration">
        <Text dimColor>
          {' '}
          Config file: .caw/config.json (per-repo) or ~/.caw/config.json (global)
        </Text>
        <Text dimColor> Environment: CAW_TRANSPORT, CAW_PORT, CAW_DB_MODE, CAW_REPO_PATH</Text>
        <Text dimColor> CLI flags override config; config overrides env vars</Text>
      </Section>

      <Section title="Claude Code Integration">
        <Text dimColor> MCP server: .claude/settings.json → mcpServers.caw</Text>
        <Text dimColor>
          {' '}
          Workflow instructions: CLAUDE.md → "Workflow Persistence (caw)" section
        </Text>
        <Text dimColor>
          {' '}
          Run <Text bold>caw setup claude-code --print</Text> to preview changes
        </Text>
      </Section>

      <Section title="Status">
        <StatusLine ok={status.dbExists} label="Database" detail={status.dbDetail} />
        <StatusLine ok={status.mcpConfigured} label="MCP Server" detail={status.mcpDetail} />
        <StatusLine
          ok={status.claudeMdConfigured}
          label="CLAUDE.md"
          detail={status.claudeMdDetail}
        />
        <StatusLine ok={status.configExists} label="Config" detail={status.configDetail} />
        <StatusLine
          ok={status.gitignoreConfigured}
          label="Gitignore"
          detail={status.gitignoreDetail}
        />
      </Section>

      <Box flexDirection="column">
        <Text dimColor>Press Esc or /back to return</Text>
      </Box>
    </Box>
  );
}
