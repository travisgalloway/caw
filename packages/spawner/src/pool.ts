import type { DatabaseType, Task, Workflow } from '@caw/core';
import { agentService, taskService } from '@caw/core';
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

  constructor(
    private readonly db: DatabaseType,
    private readonly config: SpawnerConfig,
    private readonly workflow: Pick<Workflow, 'id' | 'name' | 'plan_summary'>,
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

    // Register agent in DB
    const agent = agentService.register(this.db, {
      name: `spawner-${task.name}`,
      runtime: 'claude_code',
      role: 'worker',
      workflow_id: this.config.workflowId,
      workspace_path: this.config.cwd,
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

    // Build system prompt
    const systemPrompt = buildAgentSystemPrompt({
      agentId: agent.id,
      workflow: this.workflow,
      task,
    });

    // Create session
    const sessionOptions: AgentSessionOptions = {
      agentId: agent.id,
      taskId: task.id,
      systemPrompt,
      config: this.config,
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
    return this.getActiveCount() < this.config.maxAgents;
  }

  private handleAgentComplete(handle: AgentHandle): void {
    this.cleanupAgent(handle.agentId);
    this.sessions.delete(handle.agentId);

    if (handle.status === 'completed') {
      this.emit('agent_completed', {
        agentId: handle.agentId,
        taskId: handle.taskId,
        result: 'completed',
      });
    }
  }

  private handleAgentError(handle: AgentHandle, error: Error): void {
    const currentRetries = this.retryCount.get(handle.taskId) ?? 0;

    if (currentRetries < MAX_RETRIES) {
      this.retryCount.set(handle.taskId, currentRetries + 1);
      this.emit('agent_retrying', {
        agentId: handle.agentId,
        taskId: handle.taskId,
        attempt: currentRetries + 1,
      });
    } else {
      this.emit('agent_failed', {
        agentId: handle.agentId,
        taskId: handle.taskId,
        error: error.message,
      });
    }

    this.cleanupAgent(handle.agentId);
    this.sessions.delete(handle.agentId);
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
