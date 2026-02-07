import { Box, Text } from 'ink';
import type React from 'react';
import { useSessionInfo } from '../context/session';
import { THEME } from '../utils/theme';

export interface HintItem {
  key: string;
  desc: string;
}

export function HintBar({ hints }: { hints: HintItem[] }): React.JSX.Element {
  const session = useSessionInfo();

  return (
    <Box paddingX={1} marginTop={1} justifyContent="space-between">
      <Box gap={0} flexWrap="wrap">
        {hints.map((hint, i) => (
          <Box key={hint.key} gap={0}>
            {i > 0 && <Text dimColor> | </Text>}
            <Text bold color={THEME.accent}>
              {hint.key}
            </Text>
            <Text dimColor> {hint.desc}</Text>
          </Box>
        ))}
      </Box>
      <Text dimColor>Session {session?.sessionId ?? '—'}</Text>
    </Box>
  );
}
