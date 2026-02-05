import { Box, Text } from 'ink';
import type React from 'react';
import { useAgents } from '../hooks/useAgents';
import { useWorkflows } from '../hooks/useWorkflows';
import { useAppStore } from '../store';
import { AgentList } from './AgentList';
import { TaskTree } from './TaskTree';
import { WorkflowList } from './WorkflowList';

export function Dashboard(): React.JSX.Element {
  const workflows = useWorkflows();
  const agents = useAgents();
  const selectedWorkflowId = useAppStore((s) => s.selectedWorkflowId);

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

  return (
    <Box>
      <Box width="35%">
        <WorkflowList workflows={workflows.data ?? []} />
      </Box>
      <Box width="35%">
        <TaskTree workflowId={selectedWorkflowId} />
      </Box>
      <Box width="30%">
        <AgentList agents={agents.data ?? []} />
      </Box>
    </Box>
  );
}
