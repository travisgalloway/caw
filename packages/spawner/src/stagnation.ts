import { createHash } from 'node:crypto';

export type StagnationLevel = 'none' | 'warn' | 'pause' | 'abort';

export interface StagnationState {
  phase: string;
  progress: string;
  iteration: number;
}

export interface StagnationEvent {
  level: StagnationLevel;
  reason: string;
  agentId: string;
  taskId: string;
  elapsedMs: number;
  turnCount: number;
}

export interface StagnationConfig {
  /** Number of identical states in recent history to trigger escalation (default: 3) */
  repeatThreshold?: number;
  /** Size of the state history window (default: 5) */
  historyWindow?: number;
  /** Wall-clock time in ms to emit a warning (default: 10 minutes) */
  warnTimeMs?: number;
  /** Wall-clock time in ms to trigger abort (default: 30 minutes) */
  abortTimeMs?: number;
  /** Turn count to emit a warning (default: 80% of maxTurns, min 8) */
  warnTurns?: number;
  /** Turn count to trigger abort (default: maxTurns - 1 or 15) */
  abortTurns?: number;
}

const DEFAULT_REPEAT_THRESHOLD = 3;
const DEFAULT_HISTORY_WINDOW = 5;
const DEFAULT_WARN_TIME_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_ABORT_TIME_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_WARN_TURNS = 8;
const DEFAULT_ABORT_TURNS = 15;

function hashState(state: StagnationState): string {
  const raw = `${state.phase}:${state.progress}:${state.iteration}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * Monitors an agent session for stagnation patterns.
 * Detects: repeated state loops, excessive wall-clock time, and high turn counts.
 * Escalates: none → warn → pause → abort.
 */
export class StagnationMonitor {
  private stateHistory: string[] = [];
  private startedAt: number;
  private turnCount = 0;
  private currentLevel: StagnationLevel = 'none';
  private config: Required<StagnationConfig>;
  readonly agentId: string;
  readonly taskId: string;

  constructor(agentId: string, taskId: string, config?: StagnationConfig) {
    this.agentId = agentId;
    this.taskId = taskId;
    this.startedAt = Date.now();
    this.config = {
      repeatThreshold: config?.repeatThreshold ?? DEFAULT_REPEAT_THRESHOLD,
      historyWindow: config?.historyWindow ?? DEFAULT_HISTORY_WINDOW,
      warnTimeMs: config?.warnTimeMs ?? DEFAULT_WARN_TIME_MS,
      abortTimeMs: config?.abortTimeMs ?? DEFAULT_ABORT_TIME_MS,
      warnTurns: config?.warnTurns ?? DEFAULT_WARN_TURNS,
      abortTurns: config?.abortTurns ?? DEFAULT_ABORT_TURNS,
    };
  }

  /** Record a new state observation (from checkpoint or message). */
  recordState(state: StagnationState): void {
    const hash = hashState(state);
    this.stateHistory.push(hash);
    // Keep only the most recent N entries
    if (this.stateHistory.length > this.config.historyWindow) {
      this.stateHistory = this.stateHistory.slice(-this.config.historyWindow);
    }
  }

  /** Increment the turn counter (called on each assistant message). */
  recordTurn(): void {
    this.turnCount++;
  }

  /** Get the current turn count. */
  getTurnCount(): number {
    return this.turnCount;
  }

  /** Get elapsed time in ms since monitoring started. */
  getElapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  /** Get the current escalation level. */
  getLevel(): StagnationLevel {
    return this.currentLevel;
  }

  /**
   * Check all stagnation signals and return the highest-priority event, if any.
   * Returns null if no escalation is needed.
   * Escalation is monotonic: once at 'warn', can go to 'pause' or 'abort' but not back to 'none'.
   */
  check(): StagnationEvent | null {
    const elapsedMs = this.getElapsedMs();

    // Check wall-clock abort (highest priority)
    if (elapsedMs >= this.config.abortTimeMs) {
      return this.escalateTo('abort', `Wall-clock time exceeded ${this.config.abortTimeMs}ms`);
    }

    // Check turn-count abort
    if (this.turnCount >= this.config.abortTurns) {
      return this.escalateTo(
        'abort',
        `Turn count ${this.turnCount} exceeded abort threshold ${this.config.abortTurns}`,
      );
    }

    // Check state repetition (loop detection)
    const loopDetected = this.detectLoop();
    if (loopDetected) {
      // Loop detection escalates: first time → warn, second → pause, third → abort
      if (this.currentLevel === 'none') {
        return this.escalateTo('warn', `Repeated state detected: ${loopDetected}`);
      }
      if (this.currentLevel === 'warn') {
        return this.escalateTo('pause', `Persistent loop detected: ${loopDetected}`);
      }
      return this.escalateTo('abort', `Unrecoverable loop detected: ${loopDetected}`);
    }

    // Check wall-clock warning
    if (elapsedMs >= this.config.warnTimeMs && this.currentLevel === 'none') {
      return this.escalateTo('warn', `Wall-clock time exceeded ${this.config.warnTimeMs}ms`);
    }

    // Check turn-count warning
    if (this.turnCount >= this.config.warnTurns && this.currentLevel === 'none') {
      return this.escalateTo(
        'warn',
        `Turn count ${this.turnCount} reached warning threshold ${this.config.warnTurns}`,
      );
    }

    return null;
  }

  private escalateTo(level: StagnationLevel, reason: string): StagnationEvent | null {
    const levelOrder: StagnationLevel[] = ['none', 'warn', 'pause', 'abort'];
    const currentIdx = levelOrder.indexOf(this.currentLevel);
    const newIdx = levelOrder.indexOf(level);

    // Only escalate, never de-escalate
    if (newIdx <= currentIdx) return null;

    this.currentLevel = level;
    return {
      level,
      reason,
      agentId: this.agentId,
      taskId: this.taskId,
      elapsedMs: this.getElapsedMs(),
      turnCount: this.turnCount,
    };
  }

  /**
   * Detect if the same state hash appears `repeatThreshold` times
   * in the most recent `historyWindow` entries.
   */
  private detectLoop(): string | null {
    if (this.stateHistory.length < this.config.repeatThreshold) return null;

    const window = this.stateHistory.slice(-this.config.historyWindow);
    const counts = new Map<string, number>();

    for (const hash of window) {
      const count = (counts.get(hash) ?? 0) + 1;
      counts.set(hash, count);
      if (count >= this.config.repeatThreshold) {
        return `state ${hash} repeated ${count}x in last ${window.length} observations`;
      }
    }

    return null;
  }
}
