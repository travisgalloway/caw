import { agentService, messageService } from '@caw/core';
import { Box, Text } from 'ink';
import { Tab, Tabs } from 'ink-tab';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useDb } from '../context/db';
import { useWorkflowDetail } from '../hooks/useWorkflowDetail';
import type { WorkflowTab } from '../store';
import { useAppStore } from '../store';
import { formatRelativeTime } from '../utils/format';
import type { HintItem } from './HintBar';
import { HintBar } from './HintBar';
import type { Column } from './SelectableTable';
import { SelectableTable } from './SelectableTable';
import { StatusIndicator } from './StatusIndicator';
import { TaskDag } from './TaskDag';
import { TaskTree } from './TaskTree';
import { TypeBadge } from './TypeBadge';
import { WorkflowHeader } from './WorkflowHeader';

interface WorkflowDetailScreenProps {
  workflowId: string;
}

interface TaskRow {
  id: string;
  name: string;
  status: string;
  sequence: number;
  assigned_agent_id: string | null;
}

interface AgentRow {
  id: string;
  name: string;
  status: string;
  runtime: string;
  role: string;
}

interface MessageRow {
  id: string;
  subject: string | null;
  body: string;
  message_type: string;
  status: string;
  priority: string;
  recipient_id: string;
  created_at: number;
}

interface WorkspaceRow {
  id: string;
  branch: string;
  path: string;
  status: string;
}

const taskColumns: Column<TaskRow>[] = [
  {
    id: 'status-icon',
    key: 'status',
    header: '',
    width: 3,
    render: (_val, row) => <StatusIndicator kind="task" status={row.status} />,
  },
  { key: 'name', header: 'Name' },
  { key: 'status', header: 'Status', width: 14 },
  {
    key: 'sequence',
    header: 'Seq',
    width: 6,
    render: (val) => <Text dimColor>{String(val)}</Text>,
  },
];

const agentColumns: Column<AgentRow>[] = [
  {
    id: 'status-icon',
    key: 'status',
    header: '',
    width: 3,
    render: (_val, row) => <StatusIndicator kind="agent" status={row.status} />,
  },
  { key: 'name', header: 'Name' },
  { key: 'status', header: 'Status', width: 12 },
  { key: 'runtime', header: 'Runtime', width: 12 },
  { key: 'role', header: 'Role', width: 12 },
];

const messageColumns: Column<MessageRow>[] = [
  {
    key: 'message_type',
    header: 'Type',
    width: 10,
    render: (val) => <TypeBadge type={String(val)} />,
  },
  {
    key: 'body',
    header: 'Subject',
    render: (_val, row) => <Text>{row.subject ?? row.body.slice(0, 30)}</Text>,
  },
  { key: 'status', header: 'Status', width: 10 },
  {
    key: 'created_at',
    header: 'When',
    width: 10,
    render: (val) => <Text dimColor>{formatRelativeTime(val as number)}</Text>,
  },
];

const workspaceColumns: Column<WorkspaceRow>[] = [
  {
    id: 'status-icon',
    key: 'status',
    header: '',
    width: 3,
    render: (_val, row) => <StatusIndicator kind="workspace" status={row.status} />,
  },
  { key: 'branch', header: 'Branch', width: 25 },
  { key: 'path', header: 'Path' },
  { key: 'status', header: 'Status', width: 10 },
];

const TAB_NAMES: WorkflowTab[] = ['tasks', 'agents', 'messages', 'workspaces'];

function detailHints(tab: WorkflowTab): HintItem[] {
  const base: HintItem[] = [
    { key: 'Esc', desc: 'back' },
    { key: 'Tab', desc: 'switch tabs' },
    { key: '↑↓', desc: 'navigate' },
    { key: 'Enter', desc: 'select' },
  ];
  if (tab === 'tasks') {
    return [...base, { key: '/dag /tree /table', desc: 'switch view' }];
  }
  return base;
}

export function WorkflowDetailScreen({ workflowId }: WorkflowDetailScreenProps): React.JSX.Element {
  const { data, error } = useWorkflowDetail(workflowId);
  const db = useDb();
  const tab = useAppStore((s) => {
    const top = s.navStack[s.navStack.length - 1];
    return top?.screen === 'workflow-detail' ? top.tab : 'tasks';
  });
  const setWorkflowTab = useAppStore((s) => s.setWorkflowTab);
  const push = useAppStore((s) => s.push);
  const taskViewMode = useAppStore((s) => s.taskViewMode);
  const promptFocused = useAppStore((s) => s.promptFocused);

  const [taskIdx, setTaskIdx] = useState(0);
  const [agentIdx, setAgentIdx] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [wsIdx, setWsIdx] = useState(0);

  // Load agents and messages for this workflow
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const pollInterval = useAppStore((s) => s.pollInterval);
  const lastRefreshAt = useAppStore((s) => s.lastRefreshAt);

  // biome-ignore lint/correctness/useExhaustiveDependencies: lastRefreshAt triggers manual refresh
  useEffect(() => {
    function load() {
      try {
        const wfAgents = agentService.list(db, { workflow_id: workflowId });
        setAgents(
          wfAgents.map((a) => ({
            id: a.id,
            name: a.name,
            status: a.status,
            runtime: a.runtime,
            role: a.role,
          })),
        );
      } catch {
        // ignore
      }
      try {
        // Messages have workflow_id directly
        const allMsgs = messageService.listAll(db, { limit: 100 });
        const wfMsgs = allMsgs.filter((m) => m.workflow_id === workflowId);
        setMessages(
          wfMsgs.map((m) => ({
            id: m.id,
            subject: m.subject,
            body: m.body,
            message_type: m.message_type,
            status: m.status,
            priority: m.priority,
            recipient_id: m.recipient_id,
            created_at: m.created_at,
          })),
        );
      } catch {
        // ignore
      }
    }
    load();
    const timer = setInterval(load, pollInterval);
    return () => clearInterval(timer);
  }, [db, workflowId, pollInterval, lastRefreshAt]);

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  const { workflow, progress, workspaces } = data;
  const tasks: TaskRow[] = (workflow.tasks ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    sequence: t.sequence,
    assigned_agent_id: t.assigned_agent_id,
  }));

  const wsRows: WorkspaceRow[] = workspaces.map((ws) => ({
    id: ws.id,
    branch: ws.branch,
    path: ws.path,
    status: ws.status,
  }));

  const handleTabChange = (name: string) => {
    if (TAB_NAMES.includes(name as WorkflowTab)) {
      setWorkflowTab(name as WorkflowTab);
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <WorkflowHeader workflow={workflow} progress={progress} workspaceCount={workspaces.length} />

      <Tabs
        onChange={handleTabChange}
        keyMap={{ useNumbers: false, useTab: true, previous: [], next: [] }}
      >
        <Tab name="tasks">Tasks ({tasks.length})</Tab>
        <Tab name="agents">Agents ({agents.length})</Tab>
        <Tab name="messages">Messages ({messages.length})</Tab>
        <Tab name="workspaces">Workspaces ({wsRows.length})</Tab>
      </Tabs>

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {tab === 'tasks' &&
          (taskViewMode === 'dag' ? (
            <TaskDag
              workflowId={workflowId}
              selectedIndex={taskIdx}
              onSelectIndex={setTaskIdx}
              onConfirm={(taskId) => push({ screen: 'task-detail', workflowId, taskId })}
              isFocused={!promptFocused}
            />
          ) : taskViewMode === 'tree' ? (
            <TaskTree
              workflowId={workflowId}
              selectedIndex={taskIdx}
              onSelectIndex={setTaskIdx}
              onConfirm={(taskId) => push({ screen: 'task-detail', workflowId, taskId })}
              isFocused={!promptFocused}
            />
          ) : (
            <SelectableTable
              data={tasks}
              columns={taskColumns}
              selectedIndex={taskIdx}
              onSelectIndex={setTaskIdx}
              onConfirm={(item) => {
                push({ screen: 'task-detail', workflowId, taskId: item.id });
              }}
              isFocused={!promptFocused}
              emptyMessage="No tasks"
            />
          ))}

        {tab === 'agents' && (
          <SelectableTable
            data={agents}
            columns={agentColumns}
            selectedIndex={agentIdx}
            onSelectIndex={setAgentIdx}
            onConfirm={(item) => {
              push({ screen: 'agent-detail', workflowId, agentId: item.id });
            }}
            isFocused={!promptFocused}
            emptyMessage="No agents"
          />
        )}

        {tab === 'messages' && (
          <SelectableTable
            data={messages}
            columns={messageColumns}
            selectedIndex={msgIdx}
            onSelectIndex={setMsgIdx}
            onConfirm={(item) => {
              push({ screen: 'message-detail', workflowId, messageId: item.id });
            }}
            isFocused={!promptFocused}
            emptyMessage="No messages"
          />
        )}

        {tab === 'workspaces' && (
          <SelectableTable
            data={wsRows}
            columns={workspaceColumns}
            selectedIndex={wsIdx}
            onSelectIndex={setWsIdx}
            onConfirm={() => {}}
            isFocused={!promptFocused}
            emptyMessage="No workspaces"
          />
        )}
      </Box>

      <HintBar hints={detailHints(tab)} />
    </Box>
  );
}
