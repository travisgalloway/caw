import type { ProgressResult, WorkflowWithTasks, Workspace } from '@caw/core';
import { orchestrationService, workflowService, workspaceService } from '@caw/core';
import { useDb } from '../context/db';
import { useAppStore } from '../store';
import { usePolling } from './usePolling';

export interface WorkflowDetailData {
  workflow: WorkflowWithTasks;
  progress: ProgressResult | null;
  workspaces: Workspace[];
}

export function useWorkflowDetail(workflowId: string | null) {
  const db = useDb();
  const pollInterval = useAppStore((s) => s.pollInterval);

  return usePolling<WorkflowDetailData | null>(() => {
    if (!workflowId) {
      return null;
    }

    const workflow = workflowService.get(db, workflowId, { includeTasks: true });
    if (!workflow) {
      return null;
    }

    let progress: ProgressResult | null = null;
    try {
      progress = orchestrationService.getProgress(db, workflowId);
    } catch {
      // workflow may not have tasks yet
    }

    const workspaces = workspaceService.list(db, workflowId);

    return { workflow, progress, workspaces };
  }, pollInterval);
}
