import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { buildMcpConfig } from './mcp-config';
import type { AgentHandle, SpawnerConfig } from './types';

export interface AgentSessionOptions {
  agentId: string;
  taskId: string;
  systemPrompt: string;
  config: SpawnerConfig;
  onMessage?: (message: SDKMessage) => void;
  onComplete?: (handle: AgentHandle) => void;
  onError?: (handle: AgentHandle, error: Error) => void;
}

export class AgentSession {
  readonly agentId: string;
  readonly taskId: string;
  private abortController: AbortController;
  private handle: AgentHandle;
  private running = false;

  constructor(private readonly options: AgentSessionOptions) {
    this.agentId = options.agentId;
    this.taskId = options.taskId;
    this.abortController = new AbortController();
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
    const mcpServers = buildMcpConfig(config.mcpServerUrl);

    try {
      const conversation = query({
        prompt: `Execute the task assigned to you. Your agent ID is ${this.agentId} and your task ID is ${this.taskId}. Follow the protocol in your system prompt.`,
        options: {
          systemPrompt,
          model: config.model,
          permissionMode: config.permissionMode,
          allowDangerouslySkipPermissions: config.permissionMode === 'bypassPermissions',
          maxTurns: config.maxTurns,
          maxBudgetUsd: config.maxBudgetUsd,
          mcpServers,
          cwd: config.cwd,
          abortController: this.abortController,
        },
      });

      for await (const message of conversation) {
        if (message.type === 'system' && message.subtype === 'init') {
          this.handle.sessionId = message.session_id;
        }

        this.options.onMessage?.(message);

        if (message.type === 'result') {
          this.handleResult(message);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (error.name === 'AbortError' || this.abortController.signal.aborted) {
        this.handle.status = 'aborted';
        this.handle.error = 'Aborted';
      } else {
        this.handle.status = 'failed';
        this.handle.error = error.message;
        this.options.onError?.(this.getHandle(), error);
      }
    } finally {
      this.running = false;
      this.handle.completedAt = Date.now();
    }

    if (this.handle.status === 'running') {
      this.handle.status = 'completed';
      this.handle.completedAt = Date.now();
    }

    this.options.onComplete?.(this.getHandle());
    return this.getHandle();
  }

  abort(): void {
    this.abortController.abort();
  }

  isRunning(): boolean {
    return this.running;
  }

  private handleResult(message: SDKResultMessage): void {
    if (message.subtype === 'success') {
      this.handle.status = 'completed';
    } else {
      this.handle.status = 'failed';
      const msg = message as { errors?: string[]; subtype: string };
      this.handle.error = msg.errors ? msg.errors.join('; ') : msg.subtype;
    }
    this.handle.completedAt = Date.now();
  }
}
