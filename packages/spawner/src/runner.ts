import type { DatabaseType } from '@caw/core';
import { WorkflowSpawner } from './spawner.service';
import type { WorkflowRunnerOptions, WorkflowRunnerResult } from './types';

/**
 * High-level workflow execution runner that wraps WorkflowSpawner.
 * Owns the full lifecycle: start → wait for terminal event → optional post-completion hook → shutdown.
 */
export class WorkflowRunner {
  private spawner: WorkflowSpawner;
  private options: WorkflowRunnerOptions;

  constructor(db: DatabaseType, options: WorkflowRunnerOptions) {
    this.spawner = new WorkflowSpawner(db, options.spawnerConfig);
    this.options = options;
  }

  /** Access the underlying spawner for status checks or setMaxAgents(). */
  getSpawner(): WorkflowSpawner {
    return this.spawner;
  }

  /**
   * Run the workflow to completion. Wires all events to the reporter,
   * waits for a terminal event, invokes the post-completion hook if
   * applicable, shuts down, and returns the result.
   */
  async run(): Promise<WorkflowRunnerResult> {
    this.wireReporter();

    const startResult = await this.spawner.start();
    if (!startResult.success) {
      return { outcome: 'failed', error: startResult.error ?? 'Failed to start workflow' };
    }

    if (this.options.detach) {
      return { outcome: 'detached' };
    }

    const result = await this.waitForTerminalEvent();

    // If awaiting_merge and hook provided, run the hook before shutdown
    if (result.outcome === 'awaiting_merge' && this.options.postCompletionHook) {
      try {
        await this.options.postCompletionHook(this.spawner.getStatus().workflowId, result.prUrls);
      } catch {
        // Hook errors are non-fatal — the workflow is still awaiting_merge
      }
    }

    await this.spawner.shutdown();
    return result;
  }

  private wireReporter(): void {
    const r = this.options.reporter;
    if (!r) return;

    if (r.onAgentStarted) {
      this.spawner.on('agent_started', (data) => r.onAgentStarted?.(data));
    }
    if (r.onAgentCompleted) {
      this.spawner.on('agent_completed', (data) => r.onAgentCompleted?.(data));
    }
    if (r.onAgentFailed) {
      this.spawner.on('agent_failed', (data) => r.onAgentFailed?.(data));
    }
    if (r.onAgentRetrying) {
      this.spawner.on('agent_retrying', (data) => r.onAgentRetrying?.(data));
    }
    if (r.onAgentQuery) {
      this.spawner.on('agent_query', (data) => r.onAgentQuery?.(data));
    }
    if (r.onWorkflowStalled) {
      this.spawner.on('workflow_stalled', (data) => r.onWorkflowStalled?.(data));
    }
    if (r.onWorkflowFailed) {
      this.spawner.on('workflow_failed', (data) => r.onWorkflowFailed?.(data));
    }
    if (r.onWorkflowComplete) {
      this.spawner.on('workflow_all_complete', (data) => r.onWorkflowComplete?.(data));
    }
    if (r.onWorkflowAwaitingMerge) {
      this.spawner.on('workflow_awaiting_merge', (data) => r.onWorkflowAwaitingMerge?.(data));
    }
  }

  private waitForTerminalEvent(): Promise<WorkflowRunnerResult> {
    return new Promise<WorkflowRunnerResult>((resolve) => {
      this.spawner.on('workflow_all_complete', () => {
        resolve({ outcome: 'completed' });
      });

      this.spawner.on('workflow_awaiting_merge', (data) => {
        resolve({ outcome: 'awaiting_merge', prUrls: data.prUrls });
      });

      this.spawner.on('workflow_failed', (data) => {
        resolve({ outcome: 'failed', error: data.error });
      });

      this.spawner.on('workflow_stalled', (data) => {
        resolve({ outcome: 'stalled', reason: data.reason });
      });
    });
  }
}
