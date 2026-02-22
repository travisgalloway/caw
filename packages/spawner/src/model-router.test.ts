import { describe, expect, test } from 'bun:test';
import type { Task } from '@caw/core';
import type { ModelRoutingConfig } from './model-router';
import { classifyComplexity, getDefaultRoutes, routeTask } from './model-router';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'tk_test123',
    workflow_id: 'wf_test123',
    name: 'Test task',
    description: null,
    status: 'pending',
    sequence: 1,
    parallel_group: null,
    plan: null,
    plan_summary: null,
    context: null,
    outcome: null,
    outcome_detail: null,
    workspace_id: null,
    repository_id: null,
    assigned_agent_id: null,
    claimed_at: null,
    context_from: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

describe('classifyComplexity', () => {
  test('uses estimated_complexity from context JSON', () => {
    const task = makeTask({
      context: JSON.stringify({ estimated_complexity: 'high' }),
    });
    expect(classifyComplexity(task)).toBe('high');
  });

  test('handles all complexity levels from context', () => {
    for (const level of ['trivial', 'low', 'medium', 'high'] as const) {
      const task = makeTask({
        context: JSON.stringify({ estimated_complexity: level }),
      });
      expect(classifyComplexity(task)).toBe(level);
    }
  });

  test('falls back to keyword heuristics for trivial tasks', () => {
    const task = makeTask({ name: 'Fix typo in README' });
    expect(classifyComplexity(task)).toBe('trivial');
  });

  test('detects high complexity from keywords', () => {
    const task = makeTask({ name: 'Implement new authentication system' });
    expect(classifyComplexity(task)).toBe('high');
  });

  test('detects high complexity from description keywords', () => {
    const task = makeTask({
      name: 'Update auth',
      description: 'Refactor the entire authentication module',
    });
    expect(classifyComplexity(task)).toBe('high');
  });

  test('defaults to medium for unrecognized tasks', () => {
    const task = makeTask({ name: 'Update API endpoint' });
    expect(classifyComplexity(task)).toBe('medium');
  });

  test('handles invalid JSON in context gracefully', () => {
    const task = makeTask({ context: 'not json' });
    expect(classifyComplexity(task)).toBe('medium');
  });

  test('handles null context', () => {
    const task = makeTask({ context: null });
    expect(classifyComplexity(task)).toBe('medium');
  });
});

describe('routeTask', () => {
  test('returns empty model when routing is disabled', () => {
    const task = makeTask();
    const result = routeTask(task);
    expect(result.model).toBe('');
    expect(result.maxTurns).toBe(0);
  });

  test('returns empty model when config is undefined', () => {
    const task = makeTask();
    const result = routeTask(task, undefined);
    expect(result.model).toBe('');
  });

  test('routes trivial task to haiku', () => {
    const task = makeTask({ name: 'Fix typo' });
    const config: ModelRoutingConfig = { enabled: true };
    const result = routeTask(task, config);
    expect(result.model).toContain('haiku');
    expect(result.maxTurns).toBeLessThanOrEqual(5);
  });

  test('routes high complexity task to sonnet', () => {
    const task = makeTask({
      context: JSON.stringify({ estimated_complexity: 'high' }),
    });
    const config: ModelRoutingConfig = { enabled: true };
    const result = routeTask(task, config);
    expect(result.model).toContain('sonnet');
    expect(result.maxTurns).toBeGreaterThan(15);
  });

  test('uses custom route overrides', () => {
    const task = makeTask({ name: 'Fix typo' });
    const config: ModelRoutingConfig = {
      enabled: true,
      trivial: { model: 'custom-model', maxTurns: 3, maxBudgetUsd: 0.1 },
    };
    const result = routeTask(task, config);
    expect(result.model).toBe('custom-model');
    expect(result.maxTurns).toBe(3);
    expect(result.maxBudgetUsd).toBe(0.1);
  });
});

describe('getDefaultRoutes', () => {
  test('returns all four complexity levels', () => {
    const routes = getDefaultRoutes();
    expect(routes.trivial).toBeDefined();
    expect(routes.low).toBeDefined();
    expect(routes.medium).toBeDefined();
    expect(routes.high).toBeDefined();
  });

  test('trivial has fewer turns than high', () => {
    const routes = getDefaultRoutes();
    expect(routes.trivial.maxTurns).toBeLessThan(routes.high.maxTurns);
  });
});
