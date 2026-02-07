import { Box, Text, useStdout } from 'ink';
import type React from 'react';
import { useMemo } from 'react';
import { useTasks } from '../hooks/useTasks';
import type { DagEdge, DagNode, GridCell } from '../utils/dagLayout';
import { layoutDag } from '../utils/dagLayout';
import { THEME } from '../utils/theme';

interface TaskDagProps {
  workflowId: string | null;
}

function renderGridRow(cells: GridCell[]): React.JSX.Element {
  const segments: { text: string; color: string | null; dim: boolean }[] = [];

  for (const cell of cells) {
    const last = segments.length > 0 ? segments[segments.length - 1] : null;
    if (last && last.color === cell.color && last.dim === cell.dim) {
      last.text += cell.char;
    } else {
      segments.push({ text: cell.char, color: cell.color, dim: cell.dim });
    }
  }

  return (
    <Text>
      {segments.map((seg, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional grid cells, order is stable
        <Text key={idx} color={seg.color ?? undefined} dimColor={seg.dim}>
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

export function TaskDag({ workflowId }: TaskDagProps): React.JSX.Element {
  const { data: tasks, rawDependencies, error } = useTasks(workflowId);
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;

  const grid = useMemo(() => {
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

  if (error) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={THEME.muted} paddingX={1}>
        <Text bold>Tasks (DAG)</Text>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.muted} paddingX={1}>
      <Text bold>Tasks (DAG)</Text>
      {!workflowId ? (
        <Text dimColor>Select a workflow</Text>
      ) : !grid ? (
        <Text dimColor>No tasks</Text>
      ) : (
        // biome-ignore lint/suspicious/noArrayIndexKey: grid rows are positional, order is stable
        grid.map((row, idx) => <Box key={idx}>{renderGridRow(row)}</Box>)
      )}
    </Box>
  );
}
