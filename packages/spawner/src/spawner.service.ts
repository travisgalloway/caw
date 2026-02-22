import type { DatabaseType } from '@caw/core';
import {
  agentService,
  generateId,
  messageService,
  orchestrationService,
  removeWorktree,
  taskService,
  workflowService,
  workspaceService,
} from '@caw/core';
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
  private humanAgentId: string | null = null;
  private emittedQueryTasks = new Set<string>();

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

    // Clean up stale agents from previous runs
    this.cleanupStaleAgents();

    // Transition to in_progress if needed
    if (workflowData.status === 'ready' || workflowData.status === 'paused') {
      workflowService.updateStatus(this.db, this.config.workflowId, 'in_progress');
    }

    // Register human pseudo-agent for Q&A messaging
    try {
      const humanAgent = agentService.register(this.db, {
        name: 'human',
        runtime: 'human',
        role: 'coordinator',
        workflow_id: this.config.workflowId,
        workspace_path: this.config.cwd,
        metadata: { pseudo: true },
      });
      this.humanAgentId = humanAgent.id;
    } catch {
      // May already exist from a previous run
    }

    // Save spawner metadata
    this.spawnerMetadata.started_at = Date.now();
    this.spawnerMetadata.suspended_at = null;
    this.saveMetadata();

    // Create pool
    this.pool = new AgentPool(
      this.db,
      this.config,
      {
        id: workflowData.id,
        name: workflowData.name,
        plan_summary: workflowData.plan_summary,
      },
      this.humanAgentId,
    );

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

    this.pool = new AgentPool(
      this.db,
      this.config,
      {
        id: workflowData.id,
        name: workflowData.name,
        plan_summary: workflowData.plan_summary,
      },
      this.humanAgentId,
    );
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

    await this.cleanupWorktrees();
    unregisterSpawner(this.config.workflowId);
    this.status = 'idle';
  }

  private async cleanupWorktrees(): Promise<void> {
    // Skip cleanup if workflow is awaiting merge — worktrees persist until PR is merged
    const workflow = workflowService.get(this.db, this.config.workflowId);
    if (workflow?.status === 'awaiting_merge') {
      return;
    }

    try {
      const workspaces = workspaceService.list(this.db, this.config.workflowId, 'active');
      for (const ws of workspaces) {
        try {
          await removeWorktree(ws.path);
          workspaceService.update(this.db, ws.id, { status: 'merged' });
        } catch {
          // Already cleaned up or has uncommitted changes
        }
      }
    } catch {
      // Best effort cleanup
    }
  }

  setMaxAgents(n: number): void {
    if (this.pool) {
      this.pool.setMaxAgents(n);
    }
    // Persist to DB
    workflowService.setParallelism(this.db, this.config.workflowId, n);
    // Update saved metadata
    this.spawnerMetadata.max_agents = n;
    this.saveMetadata();
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

    // Detect agent queries (emit events for paused tasks with unanswered questions)
    this.detectAgentQueries();

    // Check for paused tasks that received a response (Q&A resumption)
    await this.resumeAnsweredTasks();

    // Check for stall
    const activeCount = this.pool.getActiveCount();
    const pausedCount = progress.by_status.paused ?? 0;
    if (
      activeCount === 0 &&
      nextTasks.tasks.length === 0 &&
      (progress.by_status.in_progress ?? 0) === 0 &&
      pausedCount === 0
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

    // Check if workflow has workspaces with PR URLs — if so, transition to awaiting_merge
    const workspaces = workspaceService.list(this.db, this.config.workflowId, 'active');
    const prUrls = workspaces.filter((ws) => ws.pr_url).map((ws) => ws.pr_url as string);

    if (prUrls.length > 0) {
      try {
        workflowService.updateStatus(this.db, this.config.workflowId, 'awaiting_merge');
      } catch {
        // May already be in target state
      }
      this.status = 'completed';
      this.emit('workflow_awaiting_merge', {
        workflowId: this.config.workflowId,
        prUrls,
      });
    } else {
      try {
        workflowService.updateStatus(this.db, this.config.workflowId, 'completed');
      } catch {
        // May already be completed
      }
      this.status = 'completed';
      this.emit('workflow_all_complete', { workflowId: this.config.workflowId });
    }
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

  private detectAgentQueries(): void {
    if (!this.humanAgentId) return;

    // Find paused tasks with assigned agents
    const pausedTasks = this.db
      .prepare(
        "SELECT id, assigned_agent_id FROM tasks WHERE workflow_id = ? AND status = 'paused'",
      )
      .all(this.config.workflowId) as Array<{ id: string; assigned_agent_id: string | null }>;

    // Fetch all unread query messages for the human agent once (avoid O(n) DB queries)
    const queryMessages = messageService.list(this.db, this.humanAgentId, {
      status: 'unread',
      message_type: 'query',
    });

    // Index by task_id for efficient lookup
    const queryByTaskId = new Map<string, (typeof queryMessages)[0]>();
    for (const msg of queryMessages) {
      if (msg.task_id && !queryByTaskId.has(msg.task_id)) {
        queryByTaskId.set(msg.task_id, msg);
      }
    }

    for (const task of pausedTasks) {
      if (!task.assigned_agent_id || this.emittedQueryTasks.has(task.id)) continue;

      const taskQuery = queryByTaskId.get(task.id);
      if (taskQuery) {
        this.emittedQueryTasks.add(task.id);
        this.emit('agent_query', {
          agentId: task.assigned_agent_id,
          taskId: task.id,
          message: taskQuery.body,
        });
      }
    }
  }

  private async resumeAnsweredTasks(): Promise<void> {
    if (!this.pool) return;

    // Find paused tasks in this workflow
    const pausedTasks = this.db
      .prepare(
        "SELECT id, assigned_agent_id FROM tasks WHERE workflow_id = ? AND status = 'paused'",
      )
      .all(this.config.workflowId) as Array<{ id: string; assigned_agent_id: string | null }>;

    for (const pausedTask of pausedTasks) {
      if (!pausedTask.assigned_agent_id || !this.pool.hasCapacity()) continue;

      // Check if there are unread 'response' messages for this task
      const responseMessages = messageService
        .list(this.db, pausedTask.assigned_agent_id, {
          status: 'unread',
          message_type: 'response',
        })
        .filter((m) => m.task_id === pausedTask.id);

      if (responseMessages.length > 0) {
        // Mark only the relevant messages as read
        messageService.markRead(
          this.db,
          responseMessages.map((m) => m.id),
        );

        // Transition task: paused -> in_progress, clear assignment so a new agent can claim it
        try {
          taskService.updateStatus(this.db, pausedTask.id, 'in_progress');

          // Clear assignment directly (agent may have been unregistered already)
          this.db
            .prepare(
              'UPDATE tasks SET assigned_agent_id = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?',
            )
            .run(Date.now(), pausedTask.id);

          // Fetch the full task and spawn a new agent for it
          const task = taskService.get(this.db, pausedTask.id);
          if (task) {
            await this.pool.spawnAgent(task);
          }
        } catch {
          // Task may have already transitioned or been claimed
        }
      }
    }
  }

  private cleanupStaleAgents(): void {
    const agents = agentService.list(this.db, {
      workflow_id: this.config.workflowId,
      status: ['online', 'busy'],
    });
    for (const agent of agents) {
      // Release tasks claimed by this stale agent back to pending
      this.db
        .prepare(
          `UPDATE tasks SET assigned_agent_id = NULL, claimed_at = NULL, status = 'pending', updated_at = ?
           WHERE assigned_agent_id = ? AND status IN ('in_progress', 'planning')`,
        )
        .run(Date.now(), agent.id);
      try {
        agentService.unregister(this.db, agent.id);
      } catch {
        // May already be offline
      }
    }
  }

  private saveMetadata(): void {
    try {
      const workflow = this.db
        .prepare('SELECT config FROM workflows WHERE id = ?')
        .get(this.config.workflowId) as { config: string | null } | null;

      const existing = workflow?.config ? JSON.parse(workflow.config) : {};
      const updated = {
        ...existing,
        spawner: this.spawnerMetadata,
        spawner_config: {
          max_agents: this.config.maxAgents,
          model: this.config.model,
          permission_mode: this.config.permissionMode,
          max_turns: this.config.maxTurns,
          max_budget_usd: this.config.maxBudgetUsd ?? null,
          ephemeral_worktree: this.config.ephemeralWorktree ?? false,
        },
      };

      this.db
        .prepare('UPDATE workflows SET config = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(updated), Date.now(), this.config.workflowId);
    } catch {
      // Best effort metadata save
    }
  }
}
