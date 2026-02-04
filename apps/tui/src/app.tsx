import type { DatabaseType } from '@caw/core';
import { Box, render, Text } from 'ink';
import type React from 'react';
import { Dashboard } from './components/Dashboard';
import { DbContext } from './context/db';
import { useKeyBindings } from './hooks/useKeyBindings';
import { useAppStore } from './store';

function HelpView(): React.JSX.Element {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Keybindings</Text>
      <Text> </Text>
      <Text>
        <Text bold>q</Text> Quit
      </Text>
      <Text>
        <Text bold>?</Text> Toggle help
      </Text>
      <Text>
        <Text bold>Esc</Text> Back to dashboard
      </Text>
      <Text>
        <Text bold>w</Text> Focus workflows panel
      </Text>
      <Text>
        <Text bold>a</Text> Focus agents panel
      </Text>
      <Text>
        <Text bold>t</Text> Focus tasks panel
      </Text>
      <Text>
        <Text bold>m</Text> Focus messages panel
      </Text>
      <Text>
        <Text bold>r</Text> Refresh data
      </Text>
    </Box>
  );
}

function App(): React.JSX.Element {
  const { view } = useAppStore();
  useKeyBindings();

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text bold color="cyan">
          caw
        </Text>
        <Text dimColor> — workflow agent</Text>
      </Box>
      {view === 'help' ? <HelpView /> : <Dashboard />}
      <Box paddingX={1}>
        <Text dimColor>q quit | ? help | w/a/t/m panels | r refresh</Text>
      </Box>
    </Box>
  );
}

export interface TuiOptions {
  workflow?: string;
}

export async function runTui(db: DatabaseType, _opts: TuiOptions): Promise<void> {
  const instance = render(
    <DbContext.Provider value={db}>
      <App />
    </DbContext.Provider>,
  );

  await instance.waitUntilExit();
  db.close();
  process.exit(0);
}
