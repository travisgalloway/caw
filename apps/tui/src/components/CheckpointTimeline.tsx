import type { Checkpoint, CheckpointType } from '@caw/core';
import { Box, Text } from 'ink';
import type React from 'react';
import { formatRelativeTime } from '../utils/format';

interface CheckpointTimelineProps {
  checkpoints: Checkpoint[];
}

interface CheckpointBadge {
  label: string;
  color: string;
}

const checkpointBadges: Record<CheckpointType, CheckpointBadge> = {
  plan: { label: 'PLAN', color: 'blue' },
  replan: { label: 'REPLAN', color: 'magenta' },
  progress: { label: 'PROGRESS', color: 'green' },
  decision: { label: 'DECISION', color: 'cyan' },
  error: { label: 'ERROR', color: 'red' },
  recovery: { label: 'RECOVERY', color: 'yellow' },
  complete: { label: 'COMPLETE', color: 'blue' },
};

export function CheckpointTimeline({ checkpoints }: CheckpointTimelineProps): React.JSX.Element {
  if (!checkpoints || checkpoints.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No checkpoints yet</Text>
      </Box>
    );
  }

  // Show most recent checkpoints first
  const sortedCheckpoints = [...checkpoints].sort((a, b) => b.sequence - a.sequence);

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      {sortedCheckpoints.map((checkpoint) => {
        const badge = checkpointBadges[checkpoint.checkpoint_type];
        return (
          <Box key={checkpoint.id} flexDirection="column">
            <Box gap={1}>
              <Text dimColor>#{checkpoint.sequence}</Text>
              <Text color={badge.color}>[{badge.label}]</Text>
              <Text dimColor>{formatRelativeTime(checkpoint.created_at)}</Text>
            </Box>
            <Box paddingLeft={2}>
              <Text>{checkpoint.summary}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
