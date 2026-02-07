import type { Agent } from '@caw/core';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useAgents } from '../hooks/useAgents';
import { useAppStore } from '../store';
import { formatRelativeTime } from '../utils/format';
import type { Column } from './SelectableTable';
import { SelectableTable } from './SelectableTable';
import { StatusIndicator } from './StatusIndicator';

interface AgentRow {
  id: string;
  name: string;
  status: string;
  runtime: string;
  role: string;
  workflow_id: string | null;
  current_task_id: string | null;
  last_heartbeat: number | null;
}

const agentColumns: Column<AgentRow>[] = [
  {
    id: 'status-icon',
    key: 'status',
    header: '',
    width: 3,
    render: (_val, row) => <StatusIndicator kind="agent" status={row.status} />,
  },
  { key: 'name', header: 'Name' },
  { key: 'status', header: 'Status', width: 10 },
  { key: 'runtime', header: 'Runtime', width: 12 },
  { key: 'role', header: 'Role', width: 12 },
  {
    key: 'workflow_id',
    header: 'Workflow',
    width: 16,
    render: (val) => <Text dimColor>{val ? String(val).slice(0, 14) : '—'}</Text>,
  },
  {
    key: 'last_heartbeat',
    header: 'Heartbeat',
    width: 12,
    render: (val) => <Text dimColor>{formatRelativeTime(val as number | null)}</Text>,
  },
];

function toRows(agents: Agent[]): AgentRow[] {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    runtime: a.runtime,
    role: a.role,
    workflow_id: a.workflow_id,
    current_task_id: a.current_task_id,
    last_heartbeat: a.last_heartbeat,
  }));
}

export function GlobalAgentList(): React.JSX.Element {
  const { data, error } = useAgents();
  const promptFocused = useAppStore((s) => s.promptFocused);
  const push = useAppStore((s) => s.push);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const activeAgents = toRows((data ?? []).filter((a) => a.status !== 'offline'));

  useEffect(() => {
    if (activeAgents.length > 0 && selectedIndex >= activeAgents.length) {
      setSelectedIndex(activeAgents.length - 1);
    }
  }, [activeAgents.length, selectedIndex]);

  if (error) {
    return (
      <Box padding={1}>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      <Text bold>Active Agents ({activeAgents.length})</Text>
      <SelectableTable
        data={activeAgents}
        columns={agentColumns}
        selectedIndex={selectedIndex}
        onSelectIndex={setSelectedIndex}
        onConfirm={(item) => {
          push({ screen: 'agent-detail', workflowId: item.workflow_id, agentId: item.id });
        }}
        isFocused={!promptFocused}
        emptyMessage="No active agents"
      />
    </Box>
  );
}
