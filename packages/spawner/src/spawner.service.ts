import type { DatabaseType } from '@caw/core';
import { generateId, orchestrationService, taskService, workflowService } from '@caw/core';
import type { EventListener } from './pool';
import { AgentPool } from './pool';
import { registerSpawner, unregisterSpawner } from './registry';
import type {
  AgentHandle,
  ExecutionStatus,
  ResumeResult,
  SpawnerConfig,
  SpawnerEvent,
  SpawnerMetadata,
  SpawnResult,
  SuspendResult,
} from './types';

const POLL_INTERVAL_MS = 5_000;

export class WorkflowSpawner {
  private pool: AgentPool | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private spawnerMetadata: SpawnerMetadata;
  private status: 'idle' | 'running' | 'suspended' | 'completed' | 'failed' = 'idle';
  private listeners = new Map<SpawnerEvent, Set<EventListener<SpawnerEvent>>>();

  constructor(
    private readonly db: DatabaseType,
    private readonly config: SpawnerConfig,
  ) {
    this.spawnerMetadata = {
      spawner_id: generateId('sp'),
      max_agents: config.maxAgents,
      model: config.model,
      permission_mode: config.permissionMode,
      started_at: 0,
      suspended_at: null,
    };
  }

  on<E extends SpawnerEvent>(event: E, listener: EventListener<E>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener as EventListener<SpawnerEvent>);
  }

  private emit<E extends SpawnerEvent>(event: E, data: Parameters<EventListener<E>>[0]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as EventListener<E>)(data);
        } catch {
          // Don't let listener errors break the spawner
        }
      }
    }
  }

  async start(): Promise<SpawnResult> {
    if (this.status === 'running') {
      return { success: false, agentHandles: [], error: 'Spawner is already running' };
    }

    // Fetch and validate workflow
    const workflowData = workflowService.get(this.db, this.config.workflowId);
    if (!workflowData) {
      return {
        success: false,
        agentHandles: [],
        error: `Workflow not found: ${this.config.workflowId}`,
      };
    }

    const validStartStatuses = ['ready', 'in_progress', 'paused'];
    if (!validStartStatuses.includes(workflowData.status)) {
      return {
        success: false,
        agentHandles: [],
        error: `Workflow status is '${workflowData.status}', must be one of: ${validStartStatuses.join(', ')}`,
      };
    }

    // Transition to in_progress if needed
    if (workflowData.status === 'ready' || workflowData.status === 'paused') {
      workflowService.updateStatus(this.db, this.config.workflowId, 'in_progress');
    }

    // Save spawner metadata
    this.spawnerMetadata.started_at = Date.now();
    this.spawnerMetadata.suspended_at = null;
    this.saveMetadata();

    // Create pool
    this.pool = new AgentPool(this.db, this.config, {
      id: workflowData.id,
      name: workflowData.name,
      plan_summary: workflowData.plan_summary,
    });

    // Forward pool events
    this.forwardPoolEvents();

    // Register in global registry
    registerSpawner(this.config.workflowId, this);

    this.status = 'running';

    // Spawn initial batch of agents
    const handles = await this.spawnNextBatch();

    // Start monitoring and polling
    this.pool.startMonitoring();
    this.startPolling();

    return { success: true, agentHandles: handles };
  }

  async suspend(): Promise<SuspendResult> {
    if (this.status !== 'running' || !this.pool) {
      return {
        success: false,
        agentsStopped: 0,
        tasksReleased: 0,
        error: 'Spawner is not running',
      };
    }

    this.stopPolling();

    // Stop all agents
    const agentsStopped = await this.pool.stopAll();

    // Transition in-progress tasks to paused
    let tasksReleased = 0;
    const allTasks = this.db
      .prepare("SELECT * FROM tasks WHERE workflow_id = ? AND status = 'in_progress'")
      .all(this.config.workflowId) as Array<{ id: string }>;

    for (const task of allTasks) {
      try {
        taskService.updateStatus(this.db, task.id, 'paused');
        tasksReleased++;
      } catch {
        // Task may have already transitioned
      }
    }

    // Transition workflow to paused
    try {
      workflowService.updateStatus(this.db, this.config.workflowId, 'paused');
    } catch {
      // May already be paused
    }

    this.spawnerMetadata.suspended_at = Date.now();
    this.saveMetadata();

    this.status = 'suspended';

    return { success: true, agentsStopped, tasksReleased };
  }

  async resume(): Promise<ResumeResult> {
    if (this.status !== 'suspended') {
      return {
        success: false,
        agentsSpawned: 0,
        tasksAvailable: 0,
        error: 'Spawner is not suspended',
      };
    }

    // Transition workflow to in_progress
    try {
      workflowService.updateStatus(this.db, this.config.workflowId, 'in_progress');
    } catch {
      // May already be in_progress
    }

    // Transition paused tasks back to pending so they can be picked up
    const pausedTasks = this.db
      .prepare("SELECT * FROM tasks WHERE workflow_id = ? AND status = 'paused'")
      .all(this.config.workflowId) as Array<{ id: string }>;

    for (const task of pausedTasks) {
      try {
        taskService.updateStatus(this.db, task.id, 'in_progress');
        // Then release assignment so they can be re-claimed
        // Actually, paused tasks go back to in_progress per state machine
        // We need them to be claimable again, but the transition path is paused -> in_progress
        // The spawner will need to handle these
      } catch {
        // Task may have already transitioned
      }
    }

    // Create new pool
    const workflowData = workflowService.get(this.db, this.config.workflowId);
    if (!workflowData) {
      return { success: false, agentsSpawned: 0, tasksAvailable: 0, error: 'Workflow not found' };
    }

    this.pool = new AgentPool(this.db, this.config, {
      id: workflowData.id,
      name: workflowData.name,
      plan_summary: workflowData.plan_summary,
    });
    this.forwardPoolEvents();

    this.spawnerMetadata.suspended_at = null;
    this.saveMetadata();

    this.status = 'running';

    // Spawn agents for available tasks
    const handles = await this.spawnNextBatch();

    this.pool.startMonitoring();
    this.startPolling();

    const nextTasks = orchestrationService.getNextTasks(this.db, this.config.workflowId);

    return {
      success: true,
      agentsSpawned: handles.length,
      tasksAvailable: nextTasks.tasks.length,
    };
  }

  async shutdown(): Promise<void> {
    this.stopPolling();

    if (this.pool) {
      await this.pool.stopAll();
      this.pool = null;
    }

    unregisterSpawner(this.config.workflowId);
    this.status = 'idle';
  }

  getStatus(): ExecutionStatus {
    const progress = orchestrationService.getProgress(this.db, this.config.workflowId);

    return {
      workflowId: this.config.workflowId,
      status: this.status,
      agents: this.pool?.getHandles() ?? [],
      progress: {
        totalTasks: progress.total_tasks,
        completed: progress.by_status.completed ?? 0,
        inProgress: progress.by_status.in_progress ?? 0,
        failed: progress.by_status.failed ?? 0,
        remaining: progress.estimated_remaining,
      },
      startedAt: this.spawnerMetadata.started_at || null,
      suspendedAt: this.spawnerMetadata.suspended_at,
    };
  }

  private async spawnNextBatch(): Promise<AgentHandle[]> {
    if (!this.pool) return [];

    const nextTasks = orchestrationService.getNextTasks(this.db, this.config.workflowId);

    if (nextTasks.all_complete) {
      this.handleWorkflowComplete();
      return [];
    }

    const handles = [];
    for (const task of nextTasks.tasks) {
      if (!this.pool.hasCapacity()) break;

      try {
        const handle = await this.pool.spawnAgent(task);
        handles.push(handle);
      } catch {
        // Task may have been claimed by another agent
      }
    }

    return handles;
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.pollLoop(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollLoop(): Promise<void> {
    if (this.status !== 'running' || !this.pool) return;

    const progress = orchestrationService.getProgress(this.db, this.config.workflowId);
    const nextTasks = orchestrationService.getNextTasks(this.db, this.config.workflowId);

    // Check for completion
    if (nextTasks.all_complete) {
      this.handleWorkflowComplete();
      return;
    }

    // Check for stall
    const activeCount = this.pool.getActiveCount();
    if (
      activeCount === 0 &&
      nextTasks.tasks.length === 0 &&
      (progress.by_status.in_progress ?? 0) === 0
    ) {
      this.emit('workflow_stalled', {
        workflowId: this.config.workflowId,
        reason: 'No active agents, no available tasks, no in-progress tasks',
      });
      return;
    }

    // Spawn more agents if we have capacity and tasks
    if (this.pool.hasCapacity() && nextTasks.tasks.length > 0) {
      await this.spawnNextBatch();
    }
  }

  private handleWorkflowComplete(): void {
    this.stopPolling();
    this.pool?.stopMonitoring();

    try {
      workflowService.updateStatus(this.db, this.config.workflowId, 'completed');
    } catch {
      // May already be completed
    }

    this.status = 'completed';
    this.emit('workflow_all_complete', { workflowId: this.config.workflowId });
  }

  private forwardPoolEvents(): void {
    if (!this.pool) return;

    this.pool.on('agent_started', (data) => this.emit('agent_started', data));
    this.pool.on('agent_completed', (data) => {
      this.emit('agent_completed', data);
      // Try to spawn more agents after one completes
      this.spawnNextBatch().catch(() => {});
    });
    this.pool.on('agent_failed', (data) => this.emit('agent_failed', data));
    this.pool.on('agent_retrying', (data) => this.emit('agent_retrying', data));
  }

  private saveMetadata(): void {
    try {
      const workflow = this.db
        .prepare('SELECT config FROM workflows WHERE id = ?')
        .get(this.config.workflowId) as { config: string | null } | null;

      const existing = workflow?.config ? JSON.parse(workflow.config) : {};
      const updated = { ...existing, spawner: this.spawnerMetadata };

      this.db
        .prepare('UPDATE workflows SET config = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(updated), Date.now(), this.config.workflowId);
    } catch {
      // Best effort metadata save
    }
  }
}
