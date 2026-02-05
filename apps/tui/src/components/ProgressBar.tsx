import { Text } from 'ink';
import type React from 'react';

interface ProgressBarProps {
  completed: number;
  total: number;
  width?: number;
}

export function ProgressBar({ completed, total, width = 10 }: ProgressBarProps): React.JSX.Element {
  const ratio = total > 0 ? Math.min(completed / total, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
      <Text dimColor>
        {' '}
        [{completed}/{total}]
      </Text>
    </Text>
  );
}
