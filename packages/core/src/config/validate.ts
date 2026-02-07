import type { CawConfig } from './schema';
import { cawConfigSchema } from './schema';

export interface ValidationResult {
  valid: boolean;
  config: CawConfig;
  warnings: string[];
}

export function validateConfig(raw: unknown): ValidationResult {
  if (raw === null || typeof raw !== 'object') {
    return { valid: false, config: {}, warnings: ['Config must be a JSON object'] };
  }

  const result = cawConfigSchema.safeParse(raw);

  if (result.success) {
    return { valid: true, config: result.data, warnings: [] };
  }

  // Zod parse failed — collect per-field warnings and build a partial config
  // by stripping only the invalid fields
  const warnings: string[] = [];
  const obj = raw as Record<string, unknown>;

  for (const issue of result.error.issues) {
    const pathParts = issue.path.map(String);
    const path = pathParts.join('.');
    const value = path ? getNestedValue(obj, pathParts) : obj;
    warnings.push(formatWarning(path, value, issue));
  }

  // Build partial config: re-parse with valid fields only by removing bad paths
  const cleaned = structuredClone(obj);
  for (const issue of result.error.issues) {
    removeNestedKey(cleaned, issue.path.map(String));
  }
  const partialResult = cawConfigSchema.safeParse(cleaned);
  const config = partialResult.success ? partialResult.data : {};

  return { valid: false, config, warnings };
}

function formatWarning(path: string, value: unknown, issue: { message: string }): string {
  if (!path) {
    return issue.message;
  }
  return `Invalid ${path}: '${String(value)}'. ${issue.message}`;
}

function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[String(key)];
  }
  return current;
}

function removeNestedKey(obj: Record<string, unknown>, path: string[]): void {
  if (path.length === 0) return;
  if (path.length === 1) {
    delete obj[path[0]];
    return;
  }
  const next = obj[path[0]];
  if (next !== null && typeof next === 'object') {
    removeNestedKey(next as Record<string, unknown>, path.slice(1));
  }
}
