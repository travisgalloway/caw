import { Box, Text } from 'ink';
import type React from 'react';
import { useAgents } from '../hooks/useAgents';
import { useAllMessages } from '../hooks/useMessages';
import { useWorkflows } from '../hooks/useWorkflows';
import { useAppStore } from '../store';
import { AgentList } from './AgentList';
import { MessagePanel } from './MessagePanel';
import { TaskDag } from './TaskDag';
import { TaskTree } from './TaskTree';
import { WorkflowList } from './WorkflowList';

export function Dashboard(): React.JSX.Element {
  const workflows = useWorkflows();
  const agents = useAgents();
  const allMessages = useAllMessages();
  const activePanel = useAppStore((s) => s.activePanel);
  const selectedWorkflowId = useAppStore((s) => s.selectedWorkflowId);
  const taskViewMode = useAppStore((s) => s.taskViewMode);

  if (workflows.error || agents.error) {
    const errorMessages = [
      workflows.error && `Workflows: ${workflows.error.message}`,
      agents.error && `Agents: ${agents.error.message}`,
    ]
      .filter(Boolean)
      .join(' | ');

    return (
      <Box padding={1}>
        <Text color="red">Error: {errorMessages}</Text>
      </Box>
    );
  }

  const totalUnread = allMessages.data?.totalUnread ?? 0;

  return (
    <Box>
      <Box width="35%">
        <WorkflowList workflows={workflows.data ?? []} />
      </Box>
      <Box width="35%">
        {taskViewMode === 'dag' ? (
          <TaskDag workflowId={selectedWorkflowId} />
        ) : (
          <TaskTree workflowId={selectedWorkflowId} />
        )}
      </Box>
      <Box width="30%">
        {activePanel === 'messages' ? (
          <MessagePanel />
        ) : (
          <AgentList agents={agents.data ?? []} totalUnread={totalUnread} />
        )}
      </Box>
    </Box>
  );
}
