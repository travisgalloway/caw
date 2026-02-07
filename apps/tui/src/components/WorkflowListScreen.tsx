import type { WorkflowStatus } from '@caw/core';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { WorkflowListItem } from '../hooks/useWorkflows';
import { useWorkflows } from '../hooks/useWorkflows';
import { useAppStore } from '../store';
import { formatRelativeTime } from '../utils/format';
import { LOGO_LINES, THEME, VERSION } from '../utils/theme';
import type { Column } from './SelectableTable';
import { SelectableTable } from './SelectableTable';
import { StatsSummary } from './StatsSummary';
import { StatusIndicator } from './StatusIndicator';
import { SystemInfo } from './SystemInfo';

const ACTIVE_STATUSES: WorkflowStatus[] = ['in_progress', 'paused', 'failed', 'ready', 'planning'];

function LogoHeader(): React.JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1}>
      {LOGO_LINES.map((line, idx) => (
        <Box key={line} gap={4}>
          <Text color={THEME.brand}>{line}</Text>
          {idx === 1 && (
            <Text bold color={THEME.brand}>
              caw <Text dimColor>v{VERSION}</Text>
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}

const workflowColumns: Column<WorkflowListItem>[] = [
  {
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

export function WorkflowListScreen(): React.JSX.Element {
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

  const hint = showAll ? '/all to show active only' : '/all to show completed';
  const hasWorkflows = items.length > 0;

  return (
    <Box flexDirection="column">
      <LogoHeader />

      <Box paddingX={1} marginTop={1} marginBottom={1}>
        <SystemInfo />
      </Box>

      {hasWorkflows ? (
        <Box paddingX={1} gap={2}>
          <StatsSummary workflowCount={items.length} />
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
      )}

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>{hasWorkflows ? `Enter select | ${hint}` : hint}</Text>
      </Box>
    </Box>
  );
}
