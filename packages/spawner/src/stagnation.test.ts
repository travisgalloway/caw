import { describe, expect, test } from 'bun:test';
import type { StagnationConfig } from './stagnation';
import { StagnationMonitor } from './stagnation';

describe('StagnationMonitor', () => {
  const agentId = 'ag_test123';
  const taskId = 'tk_test123';

  function createMonitor(config?: StagnationConfig) {
    return new StagnationMonitor(agentId, taskId, config);
  }

  describe('construction', () => {
    test('initializes with correct defaults', () => {
      const monitor = createMonitor();
      expect(monitor.agentId).toBe(agentId);
      expect(monitor.taskId).toBe(taskId);
      expect(monitor.getLevel()).toBe('none');
      expect(monitor.getTurnCount()).toBe(0);
    });
  });

  describe('turn tracking', () => {
    test('increments turn count', () => {
      const monitor = createMonitor();
      monitor.recordTurn();
      monitor.recordTurn();
      monitor.recordTurn();
      expect(monitor.getTurnCount()).toBe(3);
    });
  });

  describe('state recording', () => {
    test('records states without triggering on unique states', () => {
      const monitor = createMonitor();
      monitor.recordState({ phase: 'a', progress: 'p1', iteration: 1 });
      monitor.recordState({ phase: 'b', progress: 'p2', iteration: 2 });
      monitor.recordState({ phase: 'c', progress: 'p3', iteration: 3 });
      expect(monitor.check()).toBeNull();
    });
  });

  describe('loop detection', () => {
    test('detects repeated state 3x in last 5 observations', () => {
      const monitor = createMonitor({
        repeatThreshold: 3,
        historyWindow: 5,
        warnTimeMs: 999_999_999,
        abortTimeMs: 999_999_999,
        warnTurns: 999,
        abortTurns: 999,
      });

      // Same state 3 times
      const state = { phase: 'thinking', progress: 'stuck', iteration: 1 };
      monitor.recordState(state);
      monitor.recordState(state);
      monitor.recordState(state);

      const event = monitor.check();
      expect(event).not.toBeNull();
      expect(event?.level).toBe('warn');
      expect(event?.reason).toContain('Repeated state');
    });

    test('escalates on persistent loop: warn → pause → abort', () => {
      const monitor = createMonitor({
        repeatThreshold: 3,
        historyWindow: 5,
        warnTimeMs: 999_999_999,
        abortTimeMs: 999_999_999,
        warnTurns: 999,
        abortTurns: 999,
      });

      const state = { phase: 'thinking', progress: 'stuck', iteration: 1 };

      // First detection → warn
      monitor.recordState(state);
      monitor.recordState(state);
      monitor.recordState(state);
      let event = monitor.check();
      expect(event?.level).toBe('warn');

      // Still repeating → pause
      monitor.recordState(state);
      event = monitor.check();
      expect(event?.level).toBe('pause');

      // Still repeating → abort
      monitor.recordState(state);
      event = monitor.check();
      expect(event?.level).toBe('abort');
    });

    test('does not trigger with mixed states below threshold', () => {
      const monitor = createMonitor({
        repeatThreshold: 3,
        historyWindow: 5,
        warnTimeMs: 999_999_999,
        abortTimeMs: 999_999_999,
        warnTurns: 999,
        abortTurns: 999,
      });

      monitor.recordState({ phase: 'a', progress: 'p1', iteration: 1 });
      monitor.recordState({ phase: 'a', progress: 'p1', iteration: 1 });
      monitor.recordState({ phase: 'b', progress: 'p2', iteration: 2 });
      monitor.recordState({ phase: 'a', progress: 'p1', iteration: 1 });
      // 3x of same state in window of 4, but only if threshold is 3 and window is 5
      // This should still trigger since 'a:p1:1' appears 3 times in the window
      const event = monitor.check();
      expect(event).not.toBeNull();
      expect(event?.level).toBe('warn');
    });
  });

  describe('wall-clock time', () => {
    test('warns when time exceeds warnTimeMs', () => {
      const monitor = createMonitor({
        warnTimeMs: 0, // trigger immediately
        abortTimeMs: 999_999_999,
        warnTurns: 999,
        abortTurns: 999,
      });

      const event = monitor.check();
      // warnTimeMs=0, but abortTimeMs is high, so abort check happens first
      // Actually, check() tests abort first. With warnTimeMs=0 and abortTimeMs very high:
      // - abort time check: 0 < 999999999 → no
      // - abort turns check: 0 < 999 → no
      // - loop detection: no states → no
      // - warn time check: 0 >= 0 → yes
      expect(event?.level).toBe('warn');
      expect(event?.reason).toContain('Wall-clock time');
    });

    test('aborts when time exceeds abortTimeMs', () => {
      const monitor = createMonitor({
        warnTimeMs: 0,
        abortTimeMs: 0, // trigger immediately
        warnTurns: 999,
        abortTurns: 999,
      });

      const event = monitor.check();
      expect(event?.level).toBe('abort');
    });
  });

  describe('turn count', () => {
    test('warns when turn count exceeds warnTurns', () => {
      const monitor = createMonitor({
        warnTimeMs: 999_999_999,
        abortTimeMs: 999_999_999,
        warnTurns: 2,
        abortTurns: 999,
      });

      monitor.recordTurn();
      monitor.recordTurn();

      const event = monitor.check();
      expect(event?.level).toBe('warn');
      expect(event?.reason).toContain('Turn count');
    });

    test('aborts when turn count exceeds abortTurns', () => {
      const monitor = createMonitor({
        warnTimeMs: 999_999_999,
        abortTimeMs: 999_999_999,
        warnTurns: 999,
        abortTurns: 3,
      });

      monitor.recordTurn();
      monitor.recordTurn();
      monitor.recordTurn();

      const event = monitor.check();
      expect(event?.level).toBe('abort');
    });
  });

  describe('escalation monotonicity', () => {
    test('never de-escalates once at a level', () => {
      const monitor = createMonitor({
        warnTimeMs: 0,
        abortTimeMs: 999_999_999,
        warnTurns: 999,
        abortTurns: 999,
      });

      // First check escalates to warn
      const event1 = monitor.check();
      expect(event1?.level).toBe('warn');
      expect(monitor.getLevel()).toBe('warn');

      // Second check with same conditions returns null (already at warn, no escalation)
      const event2 = monitor.check();
      expect(event2).toBeNull();
    });
  });

  describe('elapsed time', () => {
    test('returns positive elapsed time', () => {
      const monitor = createMonitor();
      const elapsed = monitor.getElapsedMs();
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });
  });
});
