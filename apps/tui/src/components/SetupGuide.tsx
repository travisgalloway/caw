import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CawConfig } from '@caw/core';
import { getConfigPaths, loadConfig, writeConfig } from '@caw/core';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
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

type ConfigField = 'transport' | 'port' | 'dbMode' | 'runtime' | 'autoSetup';

interface ConfigEditorProps {
  repoPath?: string;
}

function ConfigEditor({ repoPath }: ConfigEditorProps): React.JSX.Element {
  const [editMode, setEditMode] = useState(false);
  const [selectedField, setSelectedField] = useState<ConfigField>('transport');
  const [config, setConfig] = useState<CawConfig>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    const result = loadConfig(repoPath);
    setConfig(result.config);
  }, [repoPath]);

  // Clear save feedback after 3s
  useEffect(() => {
    if (saveSuccess || saveError) {
      const timer = setTimeout(() => {
        setSaveSuccess(false);
        setSaveError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess, saveError]);

  const fields: ConfigField[] = ['transport', 'port', 'dbMode', 'runtime', 'autoSetup'];

  useInput(
    (input, key) => {
      if (!editMode) {
        // In view mode, 'e' or Enter to start editing
        if (input === 'e' || key.return) {
          setEditMode(true);
          setSaveSuccess(false);
          setSaveError(null);
        }
        return;
      }

      // In edit mode
      if (key.escape) {
        setEditMode(false);
        // Reload config to discard changes
        const result = loadConfig(repoPath);
        setConfig(result.config);
        return;
      }

      // Arrow keys to navigate fields
      if (key.upArrow || key.downArrow) {
        const currentIdx = fields.indexOf(selectedField);
        if (key.downArrow) {
          const nextIdx = (currentIdx + 1) % fields.length;
          const nextField = fields[nextIdx];
          if (nextField) setSelectedField(nextField);
        } else {
          const prevIdx = currentIdx === 0 ? fields.length - 1 : currentIdx - 1;
          const prevField = fields[prevIdx];
          if (prevField) setSelectedField(prevField);
        }
        return;
      }

      // Enter or Space to toggle/cycle values
      if (key.return || input === ' ') {
        const newConfig = { ...config };

        if (selectedField === 'transport') {
          const currentTransport = config.transport ?? 'stdio';
          newConfig.transport = currentTransport === 'stdio' ? 'http' : 'stdio';
        } else if (selectedField === 'dbMode') {
          const currentDbMode = config.dbMode ?? 'per-repo';
          newConfig.dbMode = currentDbMode === 'per-repo' ? 'global' : 'per-repo';
        } else if (selectedField === 'autoSetup') {
          const currentAutoSetup = config.agent?.autoSetup ?? false;
          newConfig.agent = { ...config.agent, autoSetup: !currentAutoSetup };
        }

        setConfig(newConfig);
        return;
      }

      // For port field: allow number input
      if (selectedField === 'port' && /^[0-9]$/.test(input)) {
        const currentPort = config.port?.toString() ?? '';
        const newPortStr = currentPort + input;
        const newPort = parseInt(newPortStr, 10);
        if (newPort >= 1 && newPort <= 65535) {
          const newConfig = { ...config };
          newConfig.port = newPort;
          setConfig(newConfig);
        }
        return;
      }

      // For port field: backspace to delete digit
      if (selectedField === 'port' && key.backspace) {
        const currentPort = config.port?.toString() ?? '';
        if (currentPort.length > 0) {
          const newPortStr = currentPort.slice(0, -1);
          const newConfig = { ...config };
          if (newPortStr === '') {
            newConfig.port = undefined;
          } else {
            newConfig.port = parseInt(newPortStr, 10);
          }
          setConfig(newConfig);
        }
        return;
      }

      // For runtime field: allow text input
      if (selectedField === 'runtime') {
        if (key.backspace) {
          const currentRuntime = config.agent?.runtime ?? '';
          if (currentRuntime.length > 0) {
            const newRuntime = currentRuntime.slice(0, -1);
            const newConfig = { ...config };
            if (newRuntime === '') {
              if (newConfig.agent) {
                delete newConfig.agent.runtime;
              }
            } else {
              newConfig.agent = { ...config.agent, runtime: newRuntime };
            }
            setConfig(newConfig);
          }
          return;
        }

        if (input && /^[a-zA-Z0-9_-]$/.test(input)) {
          const currentRuntime = config.agent?.runtime ?? '';
          const newConfig = { ...config };
          newConfig.agent = { ...config.agent, runtime: currentRuntime + input };
          setConfig(newConfig);
          return;
        }
      }

      // 's' to save
      if (input === 's') {
        try {
          const paths = getConfigPaths(repoPath);
          const configPath = paths.repo ?? paths.global;
          writeConfig(configPath, config);
          setSaveSuccess(true);
          setSaveError(null);
          setEditMode(false);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setSaveError(msg);
          setSaveSuccess(false);
        }
      }
    },
    { isActive: true },
  );

  const renderFieldValue = (field: ConfigField): string => {
    if (field === 'transport') {
      return config.transport ?? 'stdio';
    }
    if (field === 'port') {
      return config.port?.toString() ?? '(default)';
    }
    if (field === 'dbMode') {
      return config.dbMode ?? 'per-repo';
    }
    if (field === 'runtime') {
      return config.agent?.runtime ?? 'claude_code';
    }
    if (field === 'autoSetup') {
      return config.agent?.autoSetup ? 'true' : 'false';
    }
    return '';
  };

  const renderFieldHelp = (field: ConfigField): string => {
    if (field === 'transport') {
      return 'stdio | http';
    }
    if (field === 'port') {
      return '1-65535';
    }
    if (field === 'dbMode') {
      return 'global | per-repo';
    }
    if (field === 'runtime') {
      return 'agent runtime';
    }
    if (field === 'autoSetup') {
      return 'true | false';
    }
    return '';
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={THEME.accent}>
          Configuration Editor
        </Text>
        <Text> </Text>
        {!editMode && <Text dimColor>(Press e or Enter to edit)</Text>}
        {editMode && (
          <Text dimColor>(↑↓: navigate, Enter/Space: toggle, s: save, Esc: cancel)</Text>
        )}
      </Box>

      {fields.map((field) => {
        const isSelected = editMode && field === selectedField;
        const fieldLabel =
          field === 'runtime' ? 'agent.runtime' : field === 'autoSetup' ? 'agent.autoSetup' : field;

        return (
          <Box key={field}>
            <Text color={isSelected ? THEME.accent : undefined} bold={isSelected}>
              {isSelected ? '▸ ' : '  '}
            </Text>
            <Text bold={isSelected}>{fieldLabel}: </Text>
            <Text color={isSelected ? THEME.brand : THEME.success}>{renderFieldValue(field)}</Text>
            <Text> </Text>
            <Text dimColor>({renderFieldHelp(field)})</Text>
          </Box>
        );
      })}

      {saveSuccess && (
        <Box marginTop={1}>
          <Text color={THEME.success}>✓ Configuration saved successfully</Text>
        </Box>
      )}
      {saveError && (
        <Box marginTop={1}>
          <Text color={THEME.error}>✗ Failed to save: {saveError}</Text>
        </Box>
      )}
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

      <Box marginBottom={1}>
        <ConfigEditor repoPath={process.cwd()} />
      </Box>

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
