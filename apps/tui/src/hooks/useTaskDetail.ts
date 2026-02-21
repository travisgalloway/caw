import type { TaskWithCheckpoints } from '@caw/core';
import { taskService } from '@caw/core';
import { useDb } from '../context/db';
import { useAppStore } from '../store';
import { usePolling } from './usePolling';

export function useTaskDetail(taskId: string | null) {
  const db = useDb();
  const pollInterval = useAppStore((s) => s.pollInterval);
  const lastRefreshAt = useAppStore((s) => s.lastRefreshAt);

  return usePolling<TaskWithCheckpoints | null>(
    () => {
      if (!taskId) {
        return null;
      }

      const task = taskService.get(db, taskId, { includeCheckpoints: true });
      if (!task) {
        return null;
      }

      return task;
    },
    pollInterval,
    lastRefreshAt,
  );
}
