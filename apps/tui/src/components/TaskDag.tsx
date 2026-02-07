import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useMemo } from 'react';
import { useTasks } from '../hooks/useTasks';
import { useTerminalSize } from '../hooks/useTerminalSize';
import type { DagEdge, DagLayoutResult, DagNode, GridCell } from '../utils/dagLayout';
import { layoutDag } from '../utils/dagLayout';
import { THEME } from '../utils/theme';
import { ScrollArea } from './ScrollArea';

interface TaskDagProps {
  workflowId: string | null;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onConfirm: (taskId: string) => void;
  isFocused?: boolean;
}

function renderGridRow(cells: GridCell[], selectedId: string | null): React.JSX.Element {
  const segments: { text: string; color: string | null; dim: boolean; inverse: boolean }[] = [];

  for (const cell of cells) {
    const isSelected = selectedId !== null && cell.nodeId === selectedId;
    const last = segments.length > 0 ? segments[segments.length - 1] : null;
    if (last && last.color === cell.color && last.dim === cell.dim && last.inverse === isSelected) {
      last.text += cell.char;
    } else {
      segments.push({ text: cell.char, color: cell.color, dim: cell.dim, inverse: isSelected });
    }
  }

  return (
    <Text>
      {segments.map((seg, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional grid cells, order is stable
        <Text key={idx} color={seg.color ?? undefined} dimColor={seg.dim} inverse={seg.inverse}>
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

export function TaskDag({
  workflowId,
  selectedIndex,
  onSelectIndex,
  onConfirm,
  isFocused = true,
}: TaskDagProps): React.JSX.Element {
  const { data: tasks, rawDependencies, error } = useTasks(workflowId);
  const { columns: termWidth } = useTerminalSize();

  const layout: DagLayoutResult | null = useMemo(() => {
    if (!tasks || tasks.length === 0 || !rawDependencies) return null;

    const dagNodes: DagNode[] = tasks.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
    }));

    const taskStatusMap = new Map<string, string>();
    for (const t of tasks) {
      taskStatusMap.set(t.id, t.status);
    }

    const dagEdges: DagEdge[] = rawDependencies
      .filter((dep) => dep.dependency_type === 'blocks')
      .map((dep) => ({
        from: dep.depends_on_id,
        to: dep.task_id,
        isBlocked:
          taskStatusMap.get(dep.depends_on_id) !== 'completed' &&
          taskStatusMap.get(dep.depends_on_id) !== 'skipped',
      }));

    const availableWidth = Math.max(40, termWidth - 4);
    return layoutDag({ nodes: dagNodes, edges: dagEdges, width: availableWidth });
  }, [tasks, rawDependencies, termWidth]);

  const taskOrder = layout?.taskOrder ?? [];

  useInput(
    (_input, key) => {
      if (taskOrder.length === 0) return;

      if (key.upArrow) {
        onSelectIndex(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        onSelectIndex(Math.min(taskOrder.length - 1, selectedIndex + 1));
      } else if (key.return) {
        const taskId = taskOrder[selectedIndex];
        if (taskId) {
          onConfirm(taskId);
        }
      }
    },
    { isActive: isFocused },
  );

  if (error) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={THEME.muted} paddingX={1}>
        <Text bold>Tasks (DAG)</Text>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  const selectedId = isFocused && taskOrder.length > 0 ? (taskOrder[selectedIndex] ?? null) : null;
  const focusGridRow = layout?.nodeRows.get(taskOrder[selectedIndex] ?? '') ?? 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={THEME.muted}
      paddingX={1}
      flexGrow={1}
    >
      <Text bold>Tasks (DAG)</Text>
      {!workflowId ? (
        <Text dimColor>Select a workflow</Text>
      ) : !layout ? (
        <Text dimColor>No tasks</Text>
      ) : (
        <ScrollArea focusIndex={focusGridRow}>
          {layout.grid.map((row, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: grid rows are positional, order is stable
            <Box key={idx}>{renderGridRow(row, selectedId)}</Box>
          ))}
        </ScrollArea>
      )}
    </Box>
  );
}
