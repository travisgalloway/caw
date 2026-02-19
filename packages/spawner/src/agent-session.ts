import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { cleanEnvForSpawn } from './env';
import { buildMcpConfigFile, cleanupMcpConfigFile } from './mcp-config';
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
  onMessage?: (message: ClaudeMessage) => void;
  onComplete?: (handle: AgentHandle) => void;
  onError?: (handle: AgentHandle, error: Error) => void;
}

export class AgentSession {
  readonly agentId: string;
  readonly taskId: string;
  private childProcess: ChildProcess | null = null;
  private handle: AgentHandle;
  private running = false;
  private mcpConfigPath: string | null = null;

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

    const args = [
      '-p',
      `IMPORTANT: You MUST begin by calling the MCP tool "task_load_context" with task_id "${this.taskId}" to load your task details. Then call "task_update_status" to set your task to "in_progress". Only then should you start working. When finished, call "task_update_status" with status "completed" and an outcome summary. Your agent ID is ${this.agentId}. See your system prompt for the full protocol.`,
      '--append-system-prompt',
      systemPrompt,
      '--mcp-config',
      this.mcpConfigPath,
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--model',
      config.model,
      '--max-turns',
      String(config.maxTurns),
    ];

    if (config.maxBudgetUsd) {
      args.push('--max-budget-usd', String(config.maxBudgetUsd));
    }

    // Spawned agents are non-interactive (no TTY), so --allowedTools can't prompt
    // for approval. Use --dangerously-skip-permissions for all spawned agents.
    args.push('--dangerously-skip-permissions');

    try {
      const spawnFn = config.spawnFn ?? spawn;
      const proc = spawnFn('claude', args, {
        cwd: this.options.cwdOverride ?? config.cwd,
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

      for await (const line of rl) {
        try {
          const msg: ClaudeMessage = JSON.parse(line);

          if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
            this.handle.sessionId = msg.session_id;
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
