import type { DatabaseType } from '@caw/core';
import { Box, render, Text } from 'ink';
import type React from 'react';
import { AgentDetail } from './components/AgentDetail';
import { CommandPrompt } from './components/CommandPrompt';
import { Dashboard } from './components/Dashboard';
import { WorkflowDetail } from './components/WorkflowDetail';
import { DbContext } from './context/db';
import type { SessionInfo } from './context/session';
import { SessionContext } from './context/session';
import { useCommandHandler } from './hooks/useCommandHandler';
import { useKeyBindings } from './hooks/useKeyBindings';
import { useAppStore } from './store';

function HelpView(): React.JSX.Element {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Commands</Text>
      <Text> </Text>
      <Box gap={2}>
        <Box flexDirection="column">
          <Text>
            <Text bold>/workflows</Text> Focus workflows
          </Text>
          <Text>
            <Text bold>/tasks</Text> Focus tasks
          </Text>
          <Text>
            <Text bold>/refresh</Text> Refresh all data
          </Text>
          <Text>
            <Text bold>/lock</Text> Lock workflow
          </Text>
          <Text>
            <Text bold>/help</Text> Show this help
          </Text>
        </Box>
        <Box flexDirection="column">
          <Text>
            <Text bold>/agents</Text> Focus agents
          </Text>
          <Text>
            <Text bold>/messages</Text> Focus messages
          </Text>
          <Text>
            <Text bold>/unread</Text> Toggle unread filter
          </Text>
          <Text>
            <Text bold>/unlock</Text> Unlock workflow
          </Text>
          <Text>
            <Text bold>/quit</Text> Exit caw
          </Text>
        </Box>
      </Box>
      <Text> </Text>
      <Text dimColor>
        Keys: Esc clear/back | Arrow keys navigate | Enter select/submit | Tab complete
      </Text>
    </Box>
  );
}

function App(): React.JSX.Element {
  const { view, selectedWorkflowId, selectedAgentId } = useAppStore();
  useKeyBindings();
  const handleSubmit = useCommandHandler();

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
      <CommandPrompt onSubmit={handleSubmit} />
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
