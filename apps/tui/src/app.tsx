import type { DatabaseType } from '@caw/core';
import { Box, render, Text } from 'ink';
import type React from 'react';
import { AgentDetail } from './components/AgentDetail';
import { Dashboard } from './components/Dashboard';
import { WorkflowDetail } from './components/WorkflowDetail';
import { DbContext } from './context/db';
import type { SessionInfo } from './context/session';
import { SessionContext } from './context/session';
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
  const { view, selectedWorkflowId, selectedAgentId } = useAppStore();
  useKeyBindings();

  let content: React.JSX.Element;
  if (view === 'workflow-detail') {
    content = <WorkflowDetail workflowId={selectedWorkflowId} />;
  } else if (view === 'agent-detail') {
    content = <AgentDetail agentId={selectedAgentId} />;
  } else if (view === 'help') {
    content = <HelpView />;
  } else {
    content = <Dashboard />;
  }

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text bold color="cyan">
          caw
        </Text>
        <Text dimColor> — workflow agent</Text>
      </Box>
      {content}
      <Box paddingX={1}>
        <Text dimColor>q quit | ? help | w/a/t/m panels | r refresh</Text>
      </Box>
    </Box>
  );
}

export interface TuiOptions {
  workflow?: string;
  sessionId?: string;
  isDaemon?: boolean;
  port?: number;
}

export async function runTui(db: DatabaseType, opts: TuiOptions): Promise<void> {
  if (opts.workflow) {
    useAppStore.getState().selectWorkflow(opts.workflow);
  }

  const sessionInfo: SessionInfo | null =
    opts.sessionId != null
      ? { sessionId: opts.sessionId, isDaemon: opts.isDaemon ?? false, port: opts.port ?? 0 }
      : null;

  const instance = render(
    <DbContext.Provider value={db}>
      <SessionContext.Provider value={sessionInfo}>
        <App />
      </SessionContext.Provider>
    </DbContext.Provider>,
  );

  await instance.waitUntilExit();
  db.close();
  process.exit(0);
}
