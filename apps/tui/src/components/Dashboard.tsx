import { Box, Text } from 'ink';
import type React from 'react';
import { useAgents } from '../hooks/useAgents';
import { useWorkflows } from '../hooks/useWorkflows';
import { AgentList } from './AgentList';
import { WorkflowList } from './WorkflowList';

export function Dashboard(): React.JSX.Element {
  const workflows = useWorkflows();
  const agents = useAgents();

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
      <Box width="50%">
        <WorkflowList workflows={workflows.data ?? []} />
      </Box>
      <Box width="50%">
        <AgentList agents={agents.data ?? []} />
      </Box>
    </Box>
  );
}
