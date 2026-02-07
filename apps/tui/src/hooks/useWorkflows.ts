import type { ProgressResult, WorkflowLockInfo, WorkflowStatus, WorkflowSummary } from '@caw/core';
import { lockService, orchestrationService, workflowService } from '@caw/core';
import { useDb } from '../context/db';
import { useAppStore } from '../store';
import { usePolling } from './usePolling';

export interface WorkflowListItem extends WorkflowSummary {
  progress: ProgressResult | null;
  lock: WorkflowLockInfo | null;
}

export function useWorkflows(statusFilter?: WorkflowStatus[]) {
  const db = useDb();
  const pollInterval = useAppStore((s) => s.pollInterval);
  const lastRefreshAt = useAppStore((s) => s.lastRefreshAt);

  return usePolling<WorkflowListItem[]>(
    () => {
      const { workflows } = workflowService.list(db, {
        limit: 20,
        status: statusFilter,
      });
      return workflows.map((wf) => {
        let progress: ProgressResult | null = null;
        let lock: WorkflowLockInfo | null = null;
        try {
          progress = orchestrationService.getProgress(db, wf.id);
        } catch {
          // workflow may not have tasks yet
        }
        try {
          lock = lockService.getLockInfo(db, wf.id);
        } catch {
          // ignore lock info errors
        }
        return { ...wf, progress, lock };
      });
    },
    pollInterval,
    lastRefreshAt,
  );
}
