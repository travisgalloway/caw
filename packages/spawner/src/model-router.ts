import type { Task } from '@caw/core';

export type ComplexityLevel = 'trivial' | 'low' | 'medium' | 'high';

export interface ModelRoute {
  model: string;
  maxTurns: number;
  maxBudgetUsd?: number;
}

export interface ModelRoutingConfig {
  /** Enable model routing based on task complexity. */
  enabled: boolean;
  /** Model/limits for trivial tasks (rename, config change). */
  trivial?: ModelRoute;
  /** Model/limits for low complexity tasks. */
  low?: ModelRoute;
  /** Model/limits for medium complexity tasks. */
  medium?: ModelRoute;
  /** Model/limits for high complexity tasks (new feature, large refactor). */
  high?: ModelRoute;
}

/**
 * Default routing table.
 * Trivial/low → Haiku (fast, cheap), medium → Sonnet, high → Sonnet with higher budget.
 */
const DEFAULT_ROUTES: Record<ComplexityLevel, ModelRoute> = {
  trivial: { model: 'claude-haiku-4-5-20251001', maxTurns: 5, maxBudgetUsd: 0.5 },
  low: { model: 'claude-haiku-4-5-20251001', maxTurns: 10, maxBudgetUsd: 1 },
  medium: { model: 'claude-sonnet-4-5-20250514', maxTurns: 15, maxBudgetUsd: 5 },
  high: { model: 'claude-sonnet-4-5-20250514', maxTurns: 25, maxBudgetUsd: 10 },
};

/**
 * Keyword patterns that suggest trivial complexity.
 * Used as a fallback when estimated_complexity is not set.
 */
const TRIVIAL_KEYWORDS = [
  'rename',
  'typo',
  'fix typo',
  'config change',
  'update version',
  'bump version',
  'update dependency',
  'remove unused',
  'delete file',
  'add comment',
  'update comment',
  'fix import',
  'formatting',
];

/**
 * Keyword patterns that suggest high complexity.
 */
const HIGH_KEYWORDS = [
  'new feature',
  'implement',
  'refactor',
  'redesign',
  'rewrite',
  'architecture',
  'migration',
  'security',
  'authentication',
  'performance',
  'optimize',
  'concurrent',
  'parallel',
];

/**
 * Classify task complexity from its description and metadata.
 * Uses estimated_complexity from the task context if available,
 * otherwise falls back to keyword heuristics.
 */
export function classifyComplexity(task: Task): ComplexityLevel {
  // Check if estimated_complexity is set in the task context
  if (task.context) {
    try {
      const context = JSON.parse(task.context);
      if (context.estimated_complexity) {
        const ec = context.estimated_complexity.toLowerCase();
        if (ec === 'trivial') return 'trivial';
        if (ec === 'low') return 'low';
        if (ec === 'medium') return 'medium';
        if (ec === 'high') return 'high';
      }
    } catch {
      // Invalid JSON, fall through to heuristics
    }
  }

  // Keyword heuristic fallback — check HIGH first so complex tasks
  // aren't misclassified as trivial when both keywords appear.
  const text = `${task.name} ${task.description ?? ''}`.toLowerCase();

  for (const keyword of HIGH_KEYWORDS) {
    if (text.includes(keyword)) return 'high';
  }

  for (const keyword of TRIVIAL_KEYWORDS) {
    if (text.includes(keyword)) return 'trivial';
  }

  // Default to medium
  return 'medium';
}

/**
 * Route a task to the appropriate model and limits based on its complexity.
 * Returns the model route with model name, max turns, and optional budget.
 */
export function routeTask(task: Task, config?: ModelRoutingConfig): ModelRoute {
  if (!config?.enabled) {
    // Return a sentinel indicating no routing override
    return { model: '', maxTurns: 0 };
  }

  const complexity = classifyComplexity(task);
  return config[complexity] ?? DEFAULT_ROUTES[complexity];
}

/**
 * Get the default routing configuration.
 */
export function getDefaultRoutes(): Record<ComplexityLevel, ModelRoute> {
  return { ...DEFAULT_ROUTES };
}
