import { Box, Text, useInput } from 'ink';
import type React from 'react';
import type { WorkflowListItem } from '../hooks/useWorkflows';
import { useAppStore } from '../store';
import { ProgressBar } from './ProgressBar';
import { StatusIndicator } from './StatusIndicator';

interface WorkflowListProps {
  workflows: WorkflowListItem[];
}

export function WorkflowList({ workflows }: WorkflowListProps): React.JSX.Element {
  const { activePanel, selectedWorkflowId, setView } = useAppStore();
  const promptFocused = useAppStore((s) => s.promptFocused);
  const isFocused = activePanel === 'workflows';

  useInput(
    (_input, key) => {
      if (key.return && !promptFocused && selectedWorkflowId) {
        setView('workflow-detail');
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle={isFocused ? 'bold' : 'single'}
      borderColor={isFocused ? 'cyan' : undefined}
      paddingX={1}
    >
      <Text bold>Workflows</Text>
      {workflows.length === 0 ? (
        <Text dimColor>No workflows</Text>
      ) : (
        workflows.map((wf) => {
          const isSelected = wf.id === selectedWorkflowId;
          const displayId = wf.id.slice(0, 10);
          const completed = wf.progress?.by_status.completed ?? 0;
          const total = wf.progress?.total_tasks ?? 0;

          return (
            <Box key={wf.id} gap={1}>
              <StatusIndicator kind="workflow" status={wf.status} />
              <Text inverse={isSelected} dimColor={!isSelected}>
                {displayId}
              </Text>
              <Text inverse={isSelected} bold={isSelected}>
                {wf.name}
              </Text>
              {wf.progress && total > 0 && <ProgressBar completed={completed} total={total} />}
              {wf.lock?.locked && (
                <Text color="yellow">[LOCKED by PID {wf.lock.session_pid ?? '?'}]</Text>
              )}
            </Box>
          );
        })
      )}
    </Box>
  );
}
