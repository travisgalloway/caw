import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Box, Text } from 'ink';
import type React from 'react';
import { useMemo } from 'react';
import { useDbPath } from '../context/dbPath';
import { useSessionInfo } from '../context/session';
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
  daemonRunning: boolean;
  daemonDetail: string;
  claudeConfigured: boolean;
  claudeDetail: string;
}

function checkStatus(
  dbPath: string | null,
  sessionInfo: { isDaemon: boolean; port: number } | null,
): StatusChecks {
  // Database check
  let dbExists = false;
  let dbDetail = 'not found';
  if (dbPath) {
    dbExists = existsSync(dbPath);
    dbDetail = dbExists ? dbPath : `${dbPath} (not found)`;
  }

  // Daemon check
  const daemonRunning = sessionInfo?.isDaemon ?? false;
  const daemonDetail = daemonRunning
    ? `running on port ${sessionInfo?.port}`
    : sessionInfo
      ? `client (daemon on port ${sessionInfo.port})`
      : 'not connected';

  // Claude Code check
  let claudeConfigured = false;
  let claudeDetail = 'not configured (run caw setup claude-code)';
  try {
    const settingsPath = join(process.cwd(), '.claude', 'settings.json');
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      if (settings?.mcpServers?.caw) {
        claudeConfigured = true;
        claudeDetail = '.claude/settings.json configured';
      }
    }
  } catch {
    // ignore read errors
  }

  return { dbExists, dbDetail, daemonRunning, daemonDetail, claudeConfigured, claudeDetail };
}

export function SetupGuide(): React.JSX.Element {
  const dbPath = useDbPath();
  const sessionInfo = useSessionInfo();

  const status = useMemo(() => checkStatus(dbPath, sessionInfo), [dbPath, sessionInfo]);

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
        <StatusLine ok={status.daemonRunning} label="Daemon" detail={status.daemonDetail} />
        <StatusLine ok={status.claudeConfigured} label="Claude Code" detail={status.claudeDetail} />
      </Section>

      <Box flexDirection="column">
        <Text dimColor>Press Esc or /back to return</Text>
      </Box>
    </Box>
  );
}
