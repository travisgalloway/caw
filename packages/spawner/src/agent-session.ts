import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { cleanEnvForSpawn } from './env';
import { buildMcpConfigFile, cleanupMcpConfigFile } from './mcp-config';
import type { StagnationConfig, StagnationEvent } from './stagnation';
import { StagnationMonitor } from './stagnation';
import type { AgentHandle, SpawnerConfig } from './types';

export interface ClaudeMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  [key: string]: unknown;
}

export interface AgentSessionOptions {
  agentId: string;
  taskId: string;
  systemPrompt: string;
  config: SpawnerConfig;
  cwdOverride?: string;
  /** When set, passes --worktree <name> to claude instead of setting cwd. */
  worktreeName?: string;
  /** Resume a previous Claude Code session instead of starting fresh. */
  resumeSessionId?: string;
  /** Override the model for this specific session (for complexity-based routing). */
  modelOverride?: string;
  /** Override the max turns for this specific session. */
  maxTurnsOverride?: number;
  /** Override the max budget for this specific session. */
  maxBudgetOverride?: number;
  stagnationConfig?: StagnationConfig;
  onMessage?: (message: ClaudeMessage) => void;
  onComplete?: (handle: AgentHandle) => void;
  onError?: (handle: AgentHandle, error: Error) => void;
  onStagnation?: (event: StagnationEvent) => void;
}

export class AgentSession {
  readonly agentId: string;
  readonly taskId: string;
  private childProcess: ChildProcess | null = null;
  private handle: AgentHandle;
  private running = false;
  private mcpConfigPath: string | null = null;
  private stagnationMonitor: StagnationMonitor;
  private stagnationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: AgentSessionOptions) {
    this.agentId = options.agentId;
    this.taskId = options.taskId;
    this.handle = {
      agentId: options.agentId,
      taskId: options.taskId,
      sessionId: null,
      status: 'starting',
      startedAt: Date.now(),
      completedAt: null,
      retryCount: 0,
      error: null,
    };
    this.stagnationMonitor = new StagnationMonitor(
      options.agentId,
      options.taskId,
      options.stagnationConfig,
    );
  }

  getHandle(): AgentHandle {
    return { ...this.handle };
  }

  async run(): Promise<AgentHandle> {
    if (this.running) {
      throw new Error(`Agent session ${this.agentId} is already running`);
    }
    this.running = true;
    this.handle.status = 'running';

    const { config, systemPrompt } = this.options;
    this.mcpConfigPath = buildMcpConfigFile(config.mcpServerUrl);

    // Use per-session overrides if set (from model routing), otherwise use config defaults
    const effectiveModel = this.options.modelOverride ?? config.model;
    const effectiveMaxTurns = this.options.maxTurnsOverride ?? config.maxTurns;
    const effectiveMaxBudget = this.options.maxBudgetOverride ?? config.maxBudgetUsd;

    // Build args — use --resume for session continuation, -p for fresh sessions
    const args: string[] = [];

    if (this.options.resumeSessionId) {
      // Resume an existing session (saves tokens by reusing context)
      args.push(
        '--resume',
        this.options.resumeSessionId,
        '-p',
        `Continue working on task ${this.taskId}. Check task status and resume from where you left off. Your agent ID is ${this.agentId}.`,
      );
    } else {
      args.push(
        '-p',
        `IMPORTANT: You MUST begin by calling the MCP tool "task_load_context" with task_id "${this.taskId}" to load your task details. Then call "task_update_status" to set your task to "in_progress". Only then should you start working. When finished, call "task_update_status" with status "completed" and an outcome summary. Your agent ID is ${this.agentId}. See your system prompt for the full protocol.`,
        '--append-system-prompt',
        systemPrompt,
      );
    }

    args.push(
      '--mcp-config',
      this.mcpConfigPath,
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--model',
      effectiveModel,
      '--max-turns',
      String(effectiveMaxTurns),
    );

    if (effectiveMaxBudget) {
      args.push('--max-budget-usd', String(effectiveMaxBudget));
    }

    // Use Claude Code's native worktree isolation when requested
    if (this.options.worktreeName) {
      args.push('--worktree', this.options.worktreeName);
    }

    // Spawned agents are non-interactive (no TTY). Honor the configured permissionMode.
    if (config.permissionMode === 'bypassPermissions') {
      args.push('--dangerously-skip-permissions');
    } else {
      // acceptEdits: allow MCP tools but require explicit allowedTools
      args.push('--allowedTools', 'mcp__caw__*');
    }

    try {
      const spawnFn = config.spawnFn ?? spawn;
      // When using --worktree, Claude manages the working directory itself,
      // so always use the main repo cwd (not a worktree override).
      const effectiveCwd = this.options.worktreeName
        ? config.cwd
        : (this.options.cwdOverride ?? config.cwd);
      const proc = spawnFn('claude', args, {
        cwd: effectiveCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: cleanEnvForSpawn(),
      });
      this.childProcess = proc;

      if (!proc.stdout) {
        throw new Error('Failed to open stdout on spawned process');
      }

      // Capture stderr for failure diagnostics
      const stderrChunks: string[] = [];
      if (proc.stderr) {
        const stderrRl = createInterface({ input: proc.stderr });
        stderrRl.on('line', (line) => stderrChunks.push(line));
      }

      const rl = createInterface({ input: proc.stdout });

      // Start periodic stagnation checks (every 30 seconds)
      this.stagnationTimer = setInterval(() => this.checkStagnation(), 30_000);

      for await (const line of rl) {
        try {
          const msg: ClaudeMessage = JSON.parse(line);

          if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
            this.handle.sessionId = msg.session_id;
          }

          // Track turns for stagnation detection (assistant messages = turns)
          if (msg.type === 'assistant') {
            this.stagnationMonitor.recordTurn();
            // Record state from assistant message content for loop detection
            const content = typeof msg.message === 'string' ? msg.message : '';
            const toolUse = typeof msg.tool_name === 'string' ? msg.tool_name : '';
            this.stagnationMonitor.recordState({
              phase: toolUse || 'thinking',
              progress: content.slice(0, 100),
              iteration: this.stagnationMonitor.getTurnCount(),
            });
          }

          this.options.onMessage?.(msg);

          if (msg.type === 'result') {
            this.handleResult(msg);
          }
        } catch {
          // Skip non-JSON lines
        }
      }

      const exitCode = await new Promise<number>((resolve) => {
        proc.on('close', (code) => resolve(code ?? 1));
      });

      if (this.handle.status === 'running') {
        this.handle.status = exitCode === 0 ? 'completed' : 'failed';
        if (exitCode !== 0) {
          const stderr = stderrChunks.join('\n').slice(0, 500);
          this.handle.error = stderr || `claude exited with code ${exitCode}`;
        }
      }

      // Log diagnostics for debugging agent failures
      const gotInit = this.handle.sessionId !== null;
      const stderr = stderrChunks.join('\n').slice(0, 300);
      console.error(
        `[agent-session] ${this.agentId} exit=${exitCode} status=${this.handle.status} init=${gotInit} stderr=${stderr || '(none)'}`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const currentStatus: string = this.handle.status;

      if (currentStatus === 'aborted') {
        // Already marked as aborted by abort()
      } else {
        this.handle.status = 'failed';
        this.handle.error = error.message;
        this.options.onError?.(this.getHandle(), error);
      }
    } finally {
      this.running = false;
      this.handle.completedAt = Date.now();
      if (this.stagnationTimer) {
        clearInterval(this.stagnationTimer);
        this.stagnationTimer = null;
      }
      if (this.mcpConfigPath) {
        cleanupMcpConfigFile(this.mcpConfigPath);
        this.mcpConfigPath = null;
      }
    }

    this.options.onComplete?.(this.getHandle());
    return this.getHandle();
  }

  abort(): void {
    this.handle.status = 'aborted';
    this.handle.error = 'Aborted';
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill('SIGTERM');
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getStagnationMonitor(): StagnationMonitor {
    return this.stagnationMonitor;
  }

  private checkStagnation(): void {
    if (!this.isRunning()) return;

    const event = this.stagnationMonitor.check();
    if (!event) return;

    this.options.onStagnation?.(event);

    // On abort level, kill the agent process
    if (event.level === 'abort') {
      this.abort();
    }
  }

  private handleResult(message: ClaudeMessage): void {
    if (message.subtype === 'success') {
      this.handle.status = 'completed';
    } else {
      this.handle.status = 'failed';
      const errors = message.errors as string[] | undefined;
      this.handle.error = errors ? errors.join('; ') : (message.subtype ?? 'unknown error');
    }
    this.handle.completedAt = Date.now();
  }
}
