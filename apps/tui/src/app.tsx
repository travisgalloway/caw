import type { DatabaseType } from '@caw/core';
import { Box, render } from 'ink';
import type React from 'react';
import { AgentDetail } from './components/AgentDetail';
import type { BreadcrumbSegment } from './components/Breadcrumb';
import { Breadcrumb } from './components/Breadcrumb';
import { CommandPrompt } from './components/CommandPrompt';
import { HelpView } from './components/HelpView';
import { MessageDetailScreen } from './components/MessageDetailScreen';
import { SetupGuide } from './components/SetupGuide';
import { TaskDetailScreen } from './components/TaskDetailScreen';
import { WorkflowDetailScreen } from './components/WorkflowDetailScreen';
import { WorkflowListScreen } from './components/WorkflowListScreen';
import { DbContext } from './context/db';
import { DbPathContext } from './context/dbPath';
import type { SessionInfo } from './context/session';
import { SessionContext } from './context/session';
import { useCommandHandler } from './hooks/useCommandHandler';
import { useKeyBindings } from './hooks/useKeyBindings';
import { useTerminalSize } from './hooks/useTerminalSize';
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
      return screen.workflowId
        ? [
            { label: 'Workflows' },
            { label: screen.workflowId },
            { label: 'Agents' },
            { label: screen.agentId },
          ]
        : [{ label: 'Agents' }, { label: screen.agentId }];
    case 'message-detail':
      return screen.workflowId
        ? [
            { label: 'Workflows' },
            { label: screen.workflowId },
            { label: 'Messages' },
            { label: screen.messageId },
          ]
        : [{ label: 'Messages' }, { label: screen.messageId }];
    case 'help':
      return [{ label: 'Help' }];
    case 'setup':
      return [{ label: 'Setup' }];
  }
}

function App(): React.JSX.Element {
  const navStack = useAppStore((s) => s.navStack);
  useKeyBindings();
  const handleSubmit = useCommandHandler();
  const { columns, rows } = useTerminalSize();

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
      content = <AgentDetail workflowId={screen.workflowId ?? ''} agentId={screen.agentId} />;
      break;
    case 'message-detail':
      content = (
        <MessageDetailScreen workflowId={screen.workflowId ?? ''} messageId={screen.messageId} />
      );
      break;
    case 'help':
      content = <HelpView />;
      break;
    case 'setup':
      content = <SetupGuide />;
      break;
  }

  const showBreadcrumb = screen.screen !== 'workflow-list';

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {showBreadcrumb && <Breadcrumb segments={segments} />}
      <Box flexGrow={1} overflow="hidden">
        {content}
      </Box>
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

  // Enter alternate screen buffer (like vim/htop) — eliminates scrollback
  // artifacts during resize. Restored on exit via process.on('exit').
  process.stdout.write('\x1b[?1049h');
  const exitAltScreen = () => process.stdout.write('\x1b[?1049l');
  process.on('exit', exitAltScreen);

  const instance = render(
    <DbContext.Provider value={db}>
      <DbPathContext.Provider value={opts.dbPath ?? null}>
        <SessionContext.Provider value={sessionInfo}>
          <App />
        </SessionContext.Provider>
      </DbPathContext.Provider>
    </DbContext.Provider>,
  );

  // On width changes, clear the alternate screen buffer and reset
  // log-update's internal state so the next render starts fresh.
  let lastWidth = process.stdout.columns ?? 80;
  const onResize = () => {
    const newWidth = process.stdout.columns ?? 80;
    if (newWidth !== lastWidth) {
      process.stdout.write('\x1b[H\x1b[J');
      instance.clear();
      lastWidth = newWidth;
    }
  };
  process.stdout.prependListener('resize', onResize);

  await instance.waitUntilExit();

  process.stdout.off('resize', onResize);
  process.off('exit', exitAltScreen);
  exitAltScreen();
}
