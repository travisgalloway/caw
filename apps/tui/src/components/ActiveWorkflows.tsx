import type { WorkflowStatus } from '@caw/core';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { WorkflowListItem } from '../hooks/useWorkflows';
import { useWorkflows } from '../hooks/useWorkflows';
import { useAppStore } from '../store';
import { formatRelativeTime } from '../utils/format';
import { ProgressBar } from './ProgressBar';
import { StatusIndicator } from './StatusIndicator';

const ACTIVE_STATUSES: WorkflowStatus[] = ['in_progress', 'paused', 'failed', 'ready', 'planning'];

function sourceBadge(sourceType: string): React.JSX.Element {
  const label = sourceType.toUpperCase();
  const colorMap: Record<string, string> = {
    prompt: 'cyan',
    issue: 'magenta',
    template: 'blue',
    manual: 'gray',
  };
  const color = colorMap[sourceType.toLowerCase()] ?? 'gray';
  return <Text color={color}>[{label}]</Text>;
}

export function ActiveWorkflows(): React.JSX.Element {
  const showAll = useAppStore((s) => s.showAllWorkflows);
  const promptFocused = useAppStore((s) => s.promptFocused);
  const { selectWorkflow, setView } = useAppStore();

  const statusFilter = useMemo(() => (showAll ? undefined : ACTIVE_STATUSES), [showAll]);
  const workflows = useWorkflows(statusFilter);
  const items = workflows.data ?? [];
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Clamp selection when list changes
  useEffect(() => {
    if (items.length > 0 && selectedIndex >= items.length) {
      setSelectedIndex(items.length - 1);
    }
  }, [items.length, selectedIndex]);

  useInput((_input, key) => {
    if (promptFocused) return;
    if (items.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
    } else if (key.return) {
      const item = items[selectedIndex];
      if (item) {
        selectWorkflow(item.id);
        setView('workflow-detail');
      }
    }
  });

  if (workflows.error) {
    return (
      <Box padding={1}>
        <Text color="red">Error: {workflows.error.message}</Text>
      </Box>
    );
  }

  const title = showAll ? `All Workflows (${items.length})` : `Active Workflows (${items.length})`;
  const hint = showAll ? '/all to show active only' : '/all to show completed';

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={1}>
        <Text bold>{title}</Text>
        <Text dimColor>{hint}</Text>
      </Box>
      {items.length === 0 ? (
        <Text dimColor>
          {showAll ? 'No workflows' : 'No active workflows — use /all to see completed'}
        </Text>
      ) : (
        items.map((wf: WorkflowListItem, index: number) => {
          const isSelected = index === selectedIndex;
          const completed = wf.progress?.by_status.completed ?? 0;
          const total = wf.progress?.total_tasks ?? 0;

          return (
            <Box key={wf.id} gap={1}>
              <StatusIndicator kind="workflow" status={wf.status} />
              <Text inverse={isSelected} bold={isSelected}>
                {wf.name}
              </Text>
              {wf.progress && total > 0 && (
                <ProgressBar completed={completed} total={total} width={15} />
              )}
              {wf.lock?.locked && <Text color="yellow">[LOCKED]</Text>}
              {sourceBadge(wf.source_type)}
              <Text dimColor>{formatRelativeTime(wf.updated_at)}</Text>
            </Box>
          );
        })
      )}
      <Box marginTop={1}>
        <Text dimColor>Enter select | /dashboard 3-panel view | /dag task graph</Text>
      </Box>
    </Box>
  );
}
