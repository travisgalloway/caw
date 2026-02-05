import type { ProgressResult, WorkflowSummary } from '@caw/core';
import { orchestrationService, workflowService } from '@caw/core';
import { useDb } from '../context/db';
import { useAppStore } from '../store';
import { usePolling } from './usePolling';

export interface WorkflowListItem extends WorkflowSummary {
  progress: ProgressResult | null;
}

export function useWorkflows() {
  const db = useDb();
  const pollInterval = useAppStore((s) => s.pollInterval);

  return usePolling<WorkflowListItem[]>(() => {
    const { workflows } = workflowService.list(db, { limit: 20 });
    return workflows.map((wf) => {
      let progress: ProgressResult | null = null;
      try {
        progress = orchestrationService.getProgress(db, wf.id);
      } catch {
        // workflow may not have tasks yet
      }
      return { ...wf, progress };
    });
  }, pollInterval);
}
