import { Text } from 'ink';
import type React from 'react';

const badges: Record<string, { label: string; color: string }> = {
  task_assignment: { label: 'TASK', color: 'yellow' },
  status_update: { label: 'STATUS', color: 'blue' },
  query: { label: 'QUERY', color: 'cyan' },
  response: { label: 'REPLY', color: 'green' },
  broadcast: { label: 'BCAST', color: 'magenta' },
};

export function TypeBadge({ type }: { type: string }): React.JSX.Element {
  const badge = badges[type] ?? { label: type.toUpperCase(), color: 'white' };
  return <Text color={badge.color}>[{badge.label}]</Text>;
}

export function PriorityIndicator({ priority }: { priority: string }): React.JSX.Element | null {
  if (priority === 'urgent') return <Text color="red">!!</Text>;
  if (priority === 'high') return <Text color="yellow">!</Text>;
  if (priority === 'low') return <Text dimColor>·</Text>;
  return null;
}
