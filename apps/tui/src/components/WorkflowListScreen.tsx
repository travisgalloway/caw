import type { WorkflowStatus } from '@caw/core';
import { Box, Text } from 'ink';
import { Tab, Tabs } from 'ink-tab';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { WorkflowListItem } from '../hooks/useWorkflows';
import { useWorkflows } from '../hooks/useWorkflows';
import type { MainTab } from '../store';
import { useAppStore } from '../store';
import { formatRelativeTime } from '../utils/format';
import { LOGO_LINES, THEME } from '../utils/theme';
import { GlobalAgentList } from './GlobalAgentList';
import { GlobalMessageList } from './GlobalMessageList';
import type { HintItem } from './HintBar';
import { HintBar } from './HintBar';
import type { Column } from './SelectableTable';
import { SelectableTable } from './SelectableTable';
import { StatsSummary } from './StatsSummary';
import { StatusIndicator } from './StatusIndicator';
import { SystemInfo } from './SystemInfo';

const ACTIVE_STATUSES: WorkflowStatus[] = ['in_progress', 'paused', 'failed', 'ready', 'planning'];

const MAIN_TAB_NAMES: MainTab[] = ['workflows', 'agents', 'messages'];

function LogoHeader(): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={2} marginRight={2}>
      {LOGO_LINES.map((line) => (
        <Box key={line}>
          <Text color={THEME.brand}>{line}</Text>
        </Box>
      ))}
    </Box>
  );
}

const workflowColumns: Column<WorkflowListItem>[] = [
  {
    id: 'status-icon',
    key: 'status',
    header: '',
    width: 3,
    render: (_val, row) => <StatusIndicator kind="workflow" status={row.status} />,
  },
  {
    key: 'name',
    header: 'Name',
    width: 30,
  },
  {
    key: 'status',
    header: 'Status',
    width: 14,
  },
  {
    key: 'source_type',
    header: 'Source',
    width: 10,
    render: (val) => {
      const label = String(val).toUpperCase();
      const colorMap: Record<string, string> = {
        prompt: 'cyan',
        issue: 'magenta',
        template: 'blue',
        manual: 'gray',
      };
      const color = colorMap[String(val).toLowerCase()] ?? 'gray';
      return <Text color={color}>[{label}]</Text>;
    },
  },
  {
    key: 'updated_at',
    header: 'Updated',
    width: 12,
    render: (val) => <Text dimColor>{formatRelativeTime(val as number)}</Text>,
  },
];

function WorkflowsTab(): React.JSX.Element {
  const showAll = useAppStore((s) => s.showAllWorkflows);
  const promptFocused = useAppStore((s) => s.promptFocused);
  const push = useAppStore((s) => s.push);

  const statusFilter = useMemo(() => (showAll ? undefined : ACTIVE_STATUSES), [showAll]);
  const workflows = useWorkflows(statusFilter);
  const items = workflows.data ?? [];
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (items.length > 0 && selectedIndex >= items.length) {
      setSelectedIndex(items.length - 1);
    }
  }, [items.length, selectedIndex]);

  if (workflows.error) {
    return (
      <Box padding={1}>
        <Text color="red">Error: {workflows.error.message}</Text>
      </Box>
    );
  }

  const hasWorkflows = items.length > 0;

  return hasWorkflows ? (
    <Box paddingX={1} gap={2}>
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="round"
        borderColor={THEME.muted}
        paddingX={1}
      >
        <Text bold>
          {showAll ? `All Workflows (${items.length})` : `Active Workflows (${items.length})`}
        </Text>
        <SelectableTable
          data={items}
          columns={workflowColumns}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
          onConfirm={(item) => {
            push({ screen: 'workflow-detail', workflowId: item.id, tab: 'tasks' });
          }}
          isFocused={!promptFocused}
          emptyMessage="No workflows"
          maxVisibleRows={15}
        />
      </Box>
    </Box>
  ) : (
    <Box flexDirection="column" paddingX={1}>
      <Box marginY={1} flexDirection="column">
        <Text dimColor>No active workflows</Text>
        <Text> </Text>
        <Text dimColor>Create a workflow via MCP or use /help</Text>
      </Box>
    </Box>
  );
}

function hintsForTab(tab: MainTab, showAll: boolean): HintItem[] {
  const base: HintItem[] = [{ key: 'Tab', desc: 'switch tabs' }];
  switch (tab) {
    case 'workflows': {
      const allHint = showAll ? 'show active only' : 'show completed';
      return [...base, { key: 'Enter', desc: 'select' }, { key: '/all', desc: allHint }];
    }
    case 'agents':
      return [...base, { key: 'Enter', desc: 'select' }, { key: '↑↓', desc: 'navigate' }];
    case 'messages':
      return [...base, { key: 'Enter', desc: 'select' }, { key: '/unread', desc: 'toggle filter' }];
  }
}

export function WorkflowListScreen(): React.JSX.Element {
  const mainTab = useAppStore((s) => s.mainTab);
  const setMainTab = useAppStore((s) => s.setMainTab);
  const showAll = useAppStore((s) => s.showAllWorkflows);

  const handleTabChange = (name: string) => {
    if (MAIN_TAB_NAMES.includes(name as MainTab)) {
      setMainTab(name as MainTab);
    }
  };

  return (
    <Box flexDirection="column">
      <Box paddingX={1} gap={2} marginBottom={1} alignItems="flex-start">
        <LogoHeader />
        <SystemInfo />
        <StatsSummary />
      </Box>

      <Tabs
        onChange={handleTabChange}
        keyMap={{ useNumbers: false, useTab: true, previous: [], next: [] }}
      >
        <Tab name="workflows">Workflows</Tab>
        <Tab name="agents">Agents</Tab>
        <Tab name="messages">Messages</Tab>
      </Tabs>

      {mainTab === 'workflows' && <WorkflowsTab />}
      {mainTab === 'agents' && <GlobalAgentList />}
      {mainTab === 'messages' && <GlobalMessageList />}

      <HintBar hints={hintsForTab(mainTab, showAll)} />
    </Box>
  );
}
