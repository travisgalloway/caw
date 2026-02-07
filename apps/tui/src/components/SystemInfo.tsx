import { Box, Text } from 'ink';
import type React from 'react';
import { useDbPath } from '../context/dbPath';
import { useSessionInfo } from '../context/session';
import { THEME } from '../utils/theme';

function shortenPath(fullPath: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  if (home && fullPath.startsWith(home)) {
    return `~${fullPath.slice(home.length)}`;
  }
  return fullPath;
}

export function SystemInfo(): React.JSX.Element {
  const session = useSessionInfo();
  const dbPath = useDbPath();
  const cwd = process.cwd();

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Box gap={1}>
          <Text dimColor>Session</Text>
          <Text>{session?.sessionId ?? '—'}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Daemon</Text>
          {session?.isDaemon ? (
            <Text>
              <Text color={THEME.success}>●</Text> port {session.port}
            </Text>
          ) : (
            <Text>
              <Text dimColor>○</Text> <Text dimColor>off</Text>
            </Text>
          )}
        </Box>
      </Box>
      <Box gap={1}>
        <Text dimColor>DB</Text>
        <Text>{dbPath ? shortenPath(dbPath) : '—'}</Text>
      </Box>
      <Box gap={1}>
        <Text dimColor>Dir</Text>
        <Text>{shortenPath(cwd)}</Text>
      </Box>
    </Box>
  );
}
