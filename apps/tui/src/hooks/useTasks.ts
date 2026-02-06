import type { TaskDependency, TaskStatus } from '@caw/core';
import { workflowService } from '@caw/core';
import { useMemo } from 'react';
import { useDb } from '../context/db';
import { useAppStore } from '../store';
import { usePolling } from './usePolling';

export interface TaskTreeNode {
  id: string;
  name: string;
  status: TaskStatus;
  sequence: number;
  parallelGroup: string | null;
  agentName: string | null;
  checkpointCount: number;
  blockedBy: { id: string; name: string; status: TaskStatus }[];
  depth: number;
  isLastInGroup: boolean;
}

export interface RawTaskData {
  id: string;
  name: string;
  status: TaskStatus;
  sequence: number;
  parallel_group: string | null;
  assigned_agent_id: string | null;
}

export function buildTaskTree(
  tasks: RawTaskData[],
  dependencies: TaskDependency[],
  agentNames: Map<string, string>,
  checkpointCounts: Map<string, number>,
): TaskTreeNode[] {
  if (tasks.length === 0) return [];

  // Build maps for quick lookups
  const taskMap = new Map<string, RawTaskData>();
  for (const t of tasks) {
    taskMap.set(t.id, t);
  }

  // Build dependency adjacency lists (blockedBy relationships)
  const blockedByMap = new Map<string, TaskDependency[]>();
  for (const dep of dependencies) {
    if (dep.dependency_type === 'blocks') {
      const existing = blockedByMap.get(dep.task_id) ?? [];
      existing.push(dep);
      blockedByMap.set(dep.task_id, existing);
    }
  }

  // Calculate depth for each task based on dependencies
  const depthCache = new Map<string, number>();

  function calculateDepth(taskId: string, visited: Set<string>): number {
    const cached = depthCache.get(taskId);
    if (cached !== undefined) {
      return cached;
    }

    if (visited.has(taskId)) {
      // Circular dependency, return 0 to break the cycle
      return 0;
    }

    visited.add(taskId);
    const deps = blockedByMap.get(taskId) ?? [];
    if (deps.length === 0) {
      depthCache.set(taskId, 0);
      return 0;
    }

    let maxDepth = 0;
    for (const dep of deps) {
      const depTask = taskMap.get(dep.depends_on_id);
      if (depTask) {
        maxDepth = Math.max(maxDepth, 1 + calculateDepth(dep.depends_on_id, visited));
      }
    }

    depthCache.set(taskId, maxDepth);
    return maxDepth;
  }

  for (const t of tasks) {
    calculateDepth(t.id, new Set());
  }

  // Sort tasks by sequence, then parallel_group, then name
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    if (a.parallel_group !== b.parallel_group) {
      if (a.parallel_group === null) return 1;
      if (b.parallel_group === null) return -1;
      return a.parallel_group.localeCompare(b.parallel_group);
    }
    return a.name.localeCompare(b.name);
  });

  // Determine last task in each parallel group
  const lastInGroupMap = new Map<string, string>();
  for (const t of sortedTasks) {
    if (t.parallel_group) {
      lastInGroupMap.set(t.parallel_group, t.id);
    }
  }

  // Build the result nodes
  const result: TaskTreeNode[] = [];

  for (const t of sortedTasks) {
    const deps = blockedByMap.get(t.id) ?? [];
    const incompleteBlockers = deps
      .filter((dep) => {
        const depTask = taskMap.get(dep.depends_on_id);
        return depTask && depTask.status !== 'completed' && depTask.status !== 'skipped';
      })
      .map((dep) => {
        const depTask = taskMap.get(dep.depends_on_id);
        // depTask is guaranteed to exist due to the filter above
        return {
          id: depTask?.id ?? '',
          name: depTask?.name ?? '',
          status: depTask?.status ?? 'pending',
        };
      });

    result.push({
      id: t.id,
      name: t.name,
      status: t.status,
      sequence: t.sequence,
      parallelGroup: t.parallel_group,
      agentName: t.assigned_agent_id ? (agentNames.get(t.assigned_agent_id) ?? null) : null,
      checkpointCount: checkpointCounts.get(t.id) ?? 0,
      blockedBy: incompleteBlockers,
      depth: depthCache.get(t.id) ?? 0,
      isLastInGroup: t.parallel_group ? lastInGroupMap.get(t.parallel_group) === t.id : false,
    });
  }

  return result;
}

export function useTasks(workflowId: string | null) {
  const db = useDb();
  const pollInterval = useAppStore((s) => s.pollInterval);

  const rawData = usePolling(() => {
    if (!workflowId) return null;

    const workflow = workflowService.get(db, workflowId, { includeTasks: true });
    if (!workflow) return null;

    const tasks = workflow.tasks as RawTaskData[];
    if (tasks.length === 0) {
      return { tasks: [], dependencies: [], agentNames: new Map(), checkpointCounts: new Map() };
    }

    // Get all task IDs
    const taskIds = tasks.map((t) => t.id);

    // Query dependencies for all tasks (batched)
    let allDependencies: TaskDependency[] = [];
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(',');
      allDependencies = db
        .prepare(`SELECT * FROM task_dependencies WHERE task_id IN (${placeholders})`)
        .all(...taskIds) as TaskDependency[];
    }

    // Get agent names for assigned tasks
    const agentNames = new Map<string, string>();
    const agentIds = new Set<string>();
    for (const t of tasks) {
      if (t.assigned_agent_id) {
        agentIds.add(t.assigned_agent_id);
      }
    }
    const agentIdArray = Array.from(agentIds);
    if (agentIdArray.length > 0) {
      const placeholders = agentIdArray.map(() => '?').join(',');
      const rows = db
        .prepare(`SELECT id, name FROM agents WHERE id IN (${placeholders})`)
        .all(...agentIdArray) as { id: string; name: string }[];
      for (const row of rows) {
        agentNames.set(row.id, row.name);
      }
    }

    // Get checkpoint counts per task (batched with GROUP BY)
    const checkpointCounts = new Map<string, number>();
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(',');
      const rows = db
        .prepare(
          `SELECT task_id, COUNT(*) as count FROM checkpoints WHERE task_id IN (${placeholders}) GROUP BY task_id`,
        )
        .all(...taskIds) as { task_id: string; count: number }[];
      for (const row of rows) {
        checkpointCounts.set(row.task_id, row.count);
      }
    }

    return { tasks, dependencies: allDependencies, agentNames, checkpointCounts };
  }, pollInterval);

  const treeData = useMemo(() => {
    if (!rawData.data) return null;
    return buildTaskTree(
      rawData.data.tasks,
      rawData.data.dependencies,
      rawData.data.agentNames,
      rawData.data.checkpointCounts,
    );
  }, [rawData.data]);

  return {
    data: treeData,
    loading: rawData.loading,
    error: rawData.error,
    refresh: rawData.refresh,
  };
}
