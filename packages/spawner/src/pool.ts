import type { DatabaseType, Task, Workflow } from '@caw/core';
import { agentService, taskService, workspaceService } from '@caw/core';
import type { AgentSessionOptions } from './agent-session';
import { AgentSession } from './agent-session';
import { buildAgentSystemPrompt } from './prompt';
import type { AgentHandle, SpawnerConfig, SpawnerEvent, SpawnerEventData } from './types';

const MAX_RETRIES = 3;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MONITOR_INTERVAL_MS = 10_000;

export type EventListener<E extends SpawnerEvent> = (data: SpawnerEventData[E]) => void;

export class AgentPool {
  private sessions = new Map<string, AgentSession>();
  private heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<SpawnerEvent, Set<EventListener<SpawnerEvent>>>();
  private retryCount = new Map<string, number>();
  private stopped = false;
  private maxAgentsOverride: number | null = null;

  constructor(
    private readonly db: DatabaseType,
    private readonly config: SpawnerConfig,
    private readonly workflow: Pick<Workflow, 'id' | 'name' | 'plan_summary'>,
    private readonly humanAgentId: string | null = null,
  ) {}

  on<E extends SpawnerEvent>(event: E, listener: EventListener<E>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener as EventListener<SpawnerEvent>);
  }

  private emit<E extends SpawnerEvent>(event: E, data: SpawnerEventData[E]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch {
          // Don't let listener errors break the pool
        }
      }
    }
  }

  async spawnAgent(task: Task): Promise<AgentHandle> {
    if (this.stopped) {
      throw new Error('Pool is stopped');
    }

    // Resolve workspace for this task (if assigned)
    let agentCwd: string | undefined;
    let agentBranch = this.config.branch;
    let worktreeName: string | undefined;

    if (this.config.ephemeralWorktree) {
      // Use Claude Code's native --worktree flag; generate a slug from the task ID
      worktreeName = `caw-${task.id}`;
    } else if (task.workspace_id) {
      const workspace = workspaceService.get(this.db, task.workspace_id);
      if (workspace) {
        agentCwd = workspace.path;
        agentBranch = workspace.branch;
      }
    }

    // Register agent in DB
    const agent = agentService.register(this.db, {
      name: `spawner-${task.name}`,
      runtime: 'claude_code',
      role: 'worker',
      workflow_id: this.config.workflowId,
      workspace_path: agentCwd ?? this.config.cwd,
      metadata: { spawned: true, task_id: task.id },
    });

    // Claim the task
    const claimResult = taskService.claim(this.db, task.id, agent.id);
    if (!claimResult.success) {
      agentService.unregister(this.db, agent.id);
      throw new Error(
        `Failed to claim task ${task.id}: already claimed by ${claimResult.already_claimed_by}`,
      );
    }

    // Load prior messages for resumed tasks (Q&A context)
    let priorMessages: string | undefined;
    const taskMessages = this.db
      .prepare(
        'SELECT sender_id, body, message_type FROM messages WHERE task_id = ? ORDER BY created_at',
      )
      .all(task.id) as Array<{ sender_id: string; body: string; message_type: string }>;

    if (taskMessages.length > 0) {
      priorMessages = taskMessages
        .map((m) => `[${m.message_type}] ${m.sender_id}: ${m.body}`)
        .join('\n');
    }

    // Build system prompt
    const systemPrompt = buildAgentSystemPrompt({
      agentId: agent.id,
      workflow: this.workflow,
      task,
      branch: agentBranch,
      worktreePath: agentCwd,
      issueContext: this.config.issueContext,
      humanAgentId: this.humanAgentId ?? undefined,
      priorMessages,
    });

    // Create session
    const sessionOptions: AgentSessionOptions = {
      agentId: agent.id,
      taskId: task.id,
      systemPrompt,
      config: this.config,
      cwdOverride: agentCwd,
      worktreeName,
      onComplete: (handle) => this.handleAgentComplete(handle),
      onError: (handle, error) => this.handleAgentError(handle, error),
    };

    const session = new AgentSession(sessionOptions);
    this.sessions.set(agent.id, session);

    // Start heartbeat
    const heartbeatTimer = setInterval(() => {
      try {
        agentService.heartbeat(this.db, agent.id, task.id, 'busy');
      } catch {
        // Agent may have been unregistered
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimers.set(agent.id, heartbeatTimer);

    this.emit('agent_started', { agentId: agent.id, taskId: task.id });

    // Run in background (don't await here)
    session.run().catch(() => {
      // Errors handled via onError callback
    });

    return session.getHandle();
  }

  startMonitoring(): void {
    if (this.monitorTimer) return;
    this.monitorTimer = setInterval(() => this.monitorLoop(), MONITOR_INTERVAL_MS);
  }

  stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  async stopAll(): Promise<number> {
    this.stopped = true;
    this.stopMonitoring();

    let stopped = 0;
    for (const [agentId, session] of this.sessions) {
      if (session.isRunning()) {
        session.abort();
        stopped++;
      }
      this.cleanupAgent(agentId);
    }
    this.sessions.clear();
    return stopped;
  }

  getActiveCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.isRunning()) count++;
    }
    return count;
  }

  getHandles(): AgentHandle[] {
    return Array.from(this.sessions.values()).map((s) => s.getHandle());
  }

  hasCapacity(): boolean {
    return this.getActiveCount() < this.getMaxAgents();
  }

  setMaxAgents(n: number): void {
    this.maxAgentsOverride = n;
  }

  getMaxAgents(): number {
    return this.maxAgentsOverride ?? this.config.maxAgents;
  }

  private handleAgentComplete(handle: AgentHandle): void {
    this.cleanupAgent(handle.agentId);
    this.sessions.delete(handle.agentId);

    if (handle.status === 'completed') {
      // Verify the task was actually completed in the DB (not a phantom completion)
      const task = taskService.get(this.db, handle.taskId);
      const taskDone = task && (task.status === 'completed' || task.status === 'skipped');

      if (taskDone) {
        this.emit('agent_completed', {
          agentId: handle.agentId,
          taskId: handle.taskId,
          result: 'completed',
        });
      } else {
        // Agent exited successfully but task is not done — treat as failure
        handle.error = handle.error ?? 'Agent exited without completing task';
        this.handleAgentFailure(handle);
      }
    } else if (handle.status === 'failed') {
      // Agent process exited with failure — route through retry logic
      this.handleAgentFailure(handle);
    }
  }

  private handleAgentError(handle: AgentHandle, error: Error): void {
    this.cleanupAgent(handle.agentId);
    this.sessions.delete(handle.agentId);
    handle.error = handle.error ?? error.message;
    this.handleAgentFailure(handle);
  }

  private handleAgentFailure(handle: AgentHandle): void {
    const currentRetries = this.retryCount.get(handle.taskId) ?? 0;

    if (currentRetries < MAX_RETRIES) {
      this.retryCount.set(handle.taskId, currentRetries + 1);
      this.emit('agent_retrying', {
        agentId: handle.agentId,
        taskId: handle.taskId,
        attempt: currentRetries + 1,
      });
    } else {
      // Mark task as failed to prevent infinite respawning.
      // Must follow valid transition path: pending → planning → in_progress → failed
      try {
        const task = taskService.get(this.db, handle.taskId);
        if (task) {
          if (task.status === 'pending' || task.status === 'blocked') {
            taskService.updateStatus(this.db, handle.taskId, 'planning');
            taskService.updateStatus(this.db, handle.taskId, 'in_progress');
          } else if (task.status === 'planning') {
            taskService.updateStatus(this.db, handle.taskId, 'in_progress');
          }
          taskService.updateStatus(this.db, handle.taskId, 'failed', {
            error: handle.error ?? 'Max retries exceeded',
          });
        }
      } catch {
        // Task may have already transitioned
      }
      this.emit('agent_failed', {
        agentId: handle.agentId,
        taskId: handle.taskId,
        error: handle.error ?? 'Max retries exceeded',
      });
    }
  }

  private cleanupAgent(agentId: string): void {
    // Stop heartbeat
    const timer = this.heartbeatTimers.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(agentId);
    }

    // Unregister from DB (releases tasks)
    try {
      agentService.unregister(this.db, agentId);
    } catch {
      // May already be unregistered
    }
  }

  private monitorLoop(): void {
    // Check for stale agents
    const staleAgents = agentService.getStale(this.db, 60_000);
    for (const agent of staleAgents) {
      if (agent.workflow_id === this.config.workflowId) {
        const session = this.sessions.get(agent.id);
        if (session && !session.isRunning()) {
          this.cleanupAgent(agent.id);
          this.sessions.delete(agent.id);
        }
      }
    }
  }
}
