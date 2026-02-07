import type { DatabaseType } from '@caw/core';
import { Box, render } from 'ink';
import type React from 'react';
import { AgentDetail } from './components/AgentDetail';
import type { BreadcrumbSegment } from './components/Breadcrumb';
import { Breadcrumb } from './components/Breadcrumb';
import { CommandPrompt } from './components/CommandPrompt';
import { HelpView } from './components/HelpView';
import { MessageDetailScreen } from './components/MessageDetailScreen';
import { TaskDetailScreen } from './components/TaskDetailScreen';
import { WorkflowDetailScreen } from './components/WorkflowDetailScreen';
import { WorkflowListScreen } from './components/WorkflowListScreen';
import { DbContext } from './context/db';
import { DbPathContext } from './context/dbPath';
import type { SessionInfo } from './context/session';
import { SessionContext } from './context/session';
import { useCommandHandler } from './hooks/useCommandHandler';
import { useKeyBindings } from './hooks/useKeyBindings';
import { currentScreen, useAppStore } from './store';

function buildBreadcrumbs(screen: ReturnType<typeof currentScreen>): BreadcrumbSegment[] {
  switch (screen.screen) {
    case 'workflow-list':
      return [];
    case 'workflow-detail':
      return [{ label: 'Workflows' }, { label: screen.workflowId }];
    case 'task-detail':
      return [
        { label: 'Workflows' },
        { label: screen.workflowId },
        { label: 'Tasks' },
        { label: screen.taskId },
      ];
    case 'agent-detail':
      return [
        { label: 'Workflows' },
        { label: screen.workflowId },
        { label: 'Agents' },
        { label: screen.agentId },
      ];
    case 'message-detail':
      return [
        { label: 'Workflows' },
        { label: screen.workflowId },
        { label: 'Messages' },
        { label: screen.messageId },
      ];
    case 'help':
      return [{ label: 'Help' }];
  }
}

function App(): React.JSX.Element {
  const navStack = useAppStore((s) => s.navStack);
  useKeyBindings();
  const handleSubmit = useCommandHandler();

  const screen = currentScreen({ navStack });
  const segments = buildBreadcrumbs(screen);

  let content: React.JSX.Element;
  switch (screen.screen) {
    case 'workflow-list':
      content = <WorkflowListScreen />;
      break;
    case 'workflow-detail':
      content = <WorkflowDetailScreen workflowId={screen.workflowId} />;
      break;
    case 'task-detail':
      content = <TaskDetailScreen workflowId={screen.workflowId} taskId={screen.taskId} />;
      break;
    case 'agent-detail':
      content = <AgentDetail workflowId={screen.workflowId} agentId={screen.agentId} />;
      break;
    case 'message-detail':
      content = <MessageDetailScreen workflowId={screen.workflowId} messageId={screen.messageId} />;
      break;
    case 'help':
      content = <HelpView />;
      break;
  }

  const showBreadcrumb = screen.screen !== 'workflow-list';

  return (
    <Box flexDirection="column">
      {showBreadcrumb && <Breadcrumb segments={segments} />}
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
  dbPath?: string;
}

export async function runTui(db: DatabaseType, opts: TuiOptions): Promise<void> {
  if (opts.workflow) {
    useAppStore
      .getState()
      .push({ screen: 'workflow-detail', workflowId: opts.workflow, tab: 'tasks' });
  }

  const sessionInfo: SessionInfo | null =
    opts.sessionId != null
      ? { sessionId: opts.sessionId, isDaemon: opts.isDaemon ?? false, port: opts.port ?? 0 }
      : null;

  const instance = render(
    <DbContext.Provider value={db}>
      <DbPathContext.Provider value={opts.dbPath ?? null}>
        <SessionContext.Provider value={sessionInfo}>
          <App />
        </SessionContext.Provider>
      </DbPathContext.Provider>
    </DbContext.Provider>,
  );

  await instance.waitUntilExit();
  db.close();
  process.exit(0);
}
