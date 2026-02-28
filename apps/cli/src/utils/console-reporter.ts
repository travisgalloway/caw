import type { WorkflowRunnerReporter } from '@caw/spawner';

/**
 * Standard WorkflowRunnerReporter for CLI commands (caw run, caw work).
 * Logs agent and workflow events to console.
 */
export function createConsoleReporter(
  getSpawnerStatus?: () => { progress: { completed: number; totalTasks: number } },
): WorkflowRunnerReporter {
  return {
    onAgentStarted(data) {
      console.log(`[agent] Started: ${data.agentId} → task ${data.taskId}`);
    },
    onAgentCompleted(data) {
      console.log(`[agent] Completed: ${data.agentId} → task ${data.taskId}`);
      if (getSpawnerStatus) {
        const status = getSpawnerStatus();
        console.log(
          `  Progress: ${status.progress.completed}/${status.progress.totalTasks} tasks complete`,
        );
      }
    },
    onAgentFailed(data) {
      console.error(`[agent] Failed: ${data.agentId} → task ${data.taskId}: ${data.error}`);
    },
    onAgentRetrying(data) {
      console.log(
        `[agent] Retrying: ${data.agentId} → task ${data.taskId} (attempt ${data.attempt})`,
      );
    },
    onAgentQuery(data) {
      console.log(`[agent] Question from ${data.agentId}: ${data.message}`);
      console.log('  Reply via TUI: /reply <your answer> on the message detail screen');
    },
    onWorkflowStalled(data) {
      console.warn(`[workflow] Stalled: ${data.reason}`);
    },
    onWorkflowFailed(data) {
      console.error(`[workflow] Failed: ${data.error}`);
    },
    onWorkflowComplete() {
      console.log('Workflow completed successfully.');
    },
    onWorkflowAwaitingMerge(data) {
      console.log('All tasks complete. Workflow is awaiting PR merge.');
      for (const url of data.prUrls) {
        console.log(`  PR: ${url}`);
      }
    },
  };
}
