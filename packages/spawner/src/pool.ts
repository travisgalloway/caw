import type { DatabaseType, Task, Workflow } from '@caw/core';
import { agentService, checkpointService, taskService, workspaceService } from '@caw/core';
import type { AgentSessionOptions } from './agent-session';
import { AgentSession } from './agent-session';
import { runIntentJudge } from './intent-judge';
import { routeTask } from './model-router';
import { buildAgentSystemPrompt } from './prompt';
import { installQualityHooks } from './quality-hooks';
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
  /** Maps taskId → last successful Claude session_id for resume. */
  private sessionIdCache = new Map<string, string>();
  /** Maps agentId → cleanup function for quality hooks. */
  private hookCleanups = new Map<string, () => void>();
  private stopped = false;
  private maxAgentsOverride: number | null = null;

  constructor(
    private readonly db: DatabaseType,
    private readonly config: SpawnerConfig,
    private readonly workflow: Pick<Workflow, 'id' | 'name' | 'plan_summary' | 'source_content'>,
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

    // Build dependency chain (names of tasks this task depends on)
    const depRows = this.db
      .prepare(
        'SELECT t.name FROM task_dependencies td JOIN tasks t ON t.id = td.depends_on_id WHERE td.task_id = ? ORDER BY t.sequence ASC',
      )
      .all(task.id) as Array<{ name: string }>;
    const dependencyChain = depRows.length > 0 ? depRows.map((r) => r.name) : undefined;

    // Build system prompt
    const systemPrompt = buildAgentSystemPrompt({
      agentId: agent.id,
      workflow: this.workflow,
      task,
      dependencyChain,
      branch: agentBranch,
      worktreePath: agentCwd,
      issueContext: this.config.issueContext,
      humanAgentId: this.humanAgentId ?? undefined,
      priorMessages,
    });

    // Apply model routing if configured
    const route = routeTask(task, this.config.modelRouting);
    const modelOverride = route.model || undefined;
    const maxTurnsOverride = route.maxTurns || undefined;
    const maxBudgetOverride = route.maxBudgetUsd;

    // Check for a cached session ID for resume (from prior agent on same task)
    const resumeSessionId = this.sessionIdCache.get(task.id);

    // Create session
    const sessionOptions: AgentSessionOptions = {
      agentId: agent.id,
      taskId: task.id,
      systemPrompt,
      config: this.config,
      cwdOverride: agentCwd,
      worktreeName,
      resumeSessionId,
      modelOverride,
      maxTurnsOverride,
      maxBudgetOverride,
      onComplete: (handle) => this.handleAgentComplete(handle),
      onError: (handle, error) => this.handleAgentError(handle, error),
      onStagnation: (event) => {
        // Stagnation events are only emitted for warn/pause/abort (never 'none')
        if (event.level === 'none') return;
        this.emit('agent_stagnation', {
          agentId: event.agentId,
          taskId: event.taskId,
          level: event.level,
          reason: event.reason,
          elapsedMs: event.elapsedMs,
          turnCount: event.turnCount,
        });
        // On pause level, pause the task so it can be investigated
        if (event.level === 'pause') {
          try {
            const currentTask = taskService.get(this.db, event.taskId);
            if (currentTask?.status === 'in_progress') {
              taskService.updateStatus(this.db, event.taskId, 'paused');
            }
          } catch {
            // Task may have already transitioned
          }
        }
      },
    };

    // Install quality gate hooks if configured
    if (this.config.qualityHooks) {
      const hookCwd = agentCwd ?? this.config.cwd;
      try {
        const cleanup = installQualityHooks(hookCwd, this.config.qualityHooks);
        this.hookCleanups.set(agent.id, cleanup);
      } catch {
        // Non-fatal: hooks are optional
      }
    }

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
    // Cache session ID for potential resume on retry or follow-up
    if (handle.sessionId) {
      this.sessionIdCache.set(handle.taskId, handle.sessionId);
    }

    this.cleanupAgent(handle.agentId);
    this.sessions.delete(handle.agentId);

    if (handle.status === 'completed') {
      // Verify the task was actually completed in the DB (not a phantom completion)
      const task = taskService.get(this.db, handle.taskId);
      const taskDone = task && (task.status === 'completed' || task.status === 'skipped');

      if (taskDone) {
        // Run optional intent judge (async, non-blocking)
        if (this.config.intentJudge && task) {
          this.runIntentJudge(task).catch(() => {});
        }

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

    // Remove quality gate hooks
    const hookCleanup = this.hookCleanups.get(agentId);
    if (hookCleanup) {
      try {
        hookCleanup();
      } catch {
        // Best effort
      }
      this.hookCleanups.delete(agentId);
    }

    // Unregister from DB (releases tasks)
    try {
      agentService.unregister(this.db, agentId);
    } catch {
      // May already be unregistered
    }
  }

  private async runIntentJudge(task: {
    id: string;
    description: string | null;
    outcome: string | null;
    workspace_id: string | null;
  }): Promise<void> {
    const description = task.description ?? 'No description';
    const outcome = task.outcome ?? 'No outcome';

    // Resolve workspace path for the diff
    let cwd = this.config.cwd;
    let diffBase = 'HEAD~1';
    if (task.workspace_id) {
      const ws = workspaceService.get(this.db, task.workspace_id);
      if (ws) {
        cwd = ws.path;
        diffBase = ws.base_branch ? `origin/${ws.base_branch}` : 'HEAD~1';
      }
    }

    try {
      const result = await runIntentJudge(description, outcome, {
        cwd,
        diffBase,
        model: this.config.intentJudgeModel,
      });

      if (result) {
        // Record the result as a checkpoint on the task
        checkpointService.add(this.db, task.id, {
          type: 'decision',
          summary: `Intent judge: ${result.verdict} (confidence: ${result.confidence})`,
          detail: {
            verdict: result.verdict,
            confidence: result.confidence,
            reason: result.reason,
            scopeCreep: result.scopeCreep,
            missingRequirements: result.missingRequirements,
          },
        });
      }
    } catch {
      // Intent judge is best-effort — don't block task completion
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
