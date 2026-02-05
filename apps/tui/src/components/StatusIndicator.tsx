import { Text } from 'ink';
import type React from 'react';

type StatusKind = 'workflow' | 'agent' | 'task';

interface StatusIndicatorProps {
  kind: StatusKind;
  status: string;
}

interface SymbolStyle {
  symbol: string;
  color: string;
}

const workflowStyles: Record<string, SymbolStyle> = {
  in_progress: { symbol: '●', color: 'green' },
  paused: { symbol: '◐', color: 'yellow' },
  completed: { symbol: '✓', color: 'blue' },
  failed: { symbol: '✗', color: 'red' },
  abandoned: { symbol: '○', color: 'gray' },
  planning: { symbol: '○', color: 'gray' },
  ready: { symbol: '○', color: 'gray' },
};

const agentStyles: Record<string, SymbolStyle> = {
  online: { symbol: '●', color: 'green' },
  busy: { symbol: '●', color: 'yellow' },
  offline: { symbol: '○', color: 'gray' },
};

const taskStyles: Record<string, SymbolStyle> = {
  completed: { symbol: '✓', color: 'green' },
  in_progress: { symbol: '●', color: 'green' },
  planning: { symbol: '◐', color: 'yellow' },
  pending: { symbol: '○', color: 'gray' },
  blocked: { symbol: '⊘', color: 'red' },
  failed: { symbol: '✗', color: 'red' },
  skipped: { symbol: '○', color: 'gray' },
  paused: { symbol: '◐', color: 'yellow' },
};

const styleMap: Record<StatusKind, Record<string, SymbolStyle>> = {
  workflow: workflowStyles,
  agent: agentStyles,
  task: taskStyles,
};

const fallback: SymbolStyle = { symbol: '?', color: 'gray' };

export function StatusIndicator({ kind, status }: StatusIndicatorProps): React.JSX.Element {
  const style = styleMap[kind][status] ?? fallback;
  return <Text color={style.color}>{style.symbol}</Text>;
}
