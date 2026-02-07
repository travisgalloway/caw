import { Box, Text } from 'ink';
import type React from 'react';
import { THEME } from '../utils/theme';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold color={THEME.accent}>
        {title}
      </Text>
      {children}
      <Text> </Text>
    </Box>
  );
}

function Cmd({ name, desc }: { name: string; desc: string }): React.JSX.Element {
  return (
    <Box>
      <Box width={14}>
        <Text bold>{name}</Text>
      </Box>
      <Text dimColor>{desc}</Text>
    </Box>
  );
}

export function HelpView(): React.JSX.Element {
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
        Help
      </Text>
      <Text> </Text>

      <Section title="Navigation">
        <Box gap={4}>
          <Box flexDirection="column">
            <Cmd name="/workflows" desc="Go to workflow list" />
            <Cmd name="/back" desc="Go back one screen" />
          </Box>
          <Box flexDirection="column">
            <Cmd name="/help" desc="Show this help" />
            <Cmd name="/quit" desc="Exit caw" />
          </Box>
        </Box>
      </Section>

      <Section title="Tabs (inside workflow)">
        <Box gap={4}>
          <Box flexDirection="column">
            <Cmd name="/tasks" desc="Switch to Tasks tab" />
            <Cmd name="/messages" desc="Switch to Messages tab" />
          </Box>
          <Box flexDirection="column">
            <Cmd name="/agents" desc="Switch to Agents tab" />
            <Cmd name="/all" desc="Toggle filter" />
          </Box>
        </Box>
      </Section>

      <Section title="Task Views">
        <Box gap={4}>
          <Box flexDirection="column">
            <Cmd name="/table" desc="Table view" />
            <Cmd name="/tree" desc="Tree view" />
          </Box>
          <Box flexDirection="column">
            <Cmd name="/dag" desc="DAG view" />
          </Box>
        </Box>
      </Section>

      <Section title="Setup">
        <Cmd name="/setup" desc="Show setup guide" />
      </Section>

      <Section title="Actions">
        <Box gap={4}>
          <Box flexDirection="column">
            <Cmd name="/refresh" desc="Refresh data" />
            <Cmd name="/lock" desc="Lock workflow" />
          </Box>
          <Box flexDirection="column">
            <Cmd name="/resume" desc="Resume workflow" />
            <Cmd name="/unlock" desc="Unlock workflow" />
          </Box>
        </Box>
        <Cmd name="/unread" desc="Toggle unread" />
      </Section>

      <Box flexDirection="column">
        <Text bold color={THEME.accent}>
          Keyboard
        </Text>
        <Text dimColor>
          Esc back {'  '}↑↓ navigate {'  '}Enter select {'  '}Tab/1-4 switch tabs
        </Text>
      </Box>
    </Box>
  );
}
