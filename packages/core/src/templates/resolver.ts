import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { DatabaseType } from '../db/connection';
import * as templateService from '../services/template.service';
import type { WorkflowTemplate } from '../types/template';
import type { ResolvedFileTemplate } from './loader';
import { extractVariableDefaults, loadFileTemplates } from './loader';
import type { FileTemplateDefinition, TemplateSource } from './schema';
import { fileTemplateSchema } from './schema';

export interface UnifiedTemplate extends WorkflowTemplate {
  source: TemplateSource;
}

/**
 * List all templates: file-based + DB. Deduplicates by name with priority:
 * repo file > global file > DB. Sorted alphabetically.
 */
export function listAll(db: DatabaseType, repoPath?: string): UnifiedTemplate[] {
  const byName = new Map<string, UnifiedTemplate>();

  // DB templates (lowest priority)
  const dbTemplates = templateService.list(db);
  for (const t of dbTemplates) {
    byName.set(t.name, { ...t, source: 'db' });
  }

  // File templates (higher priority — overwrites DB entries with same name)
  const fileResult = loadFileTemplates(repoPath);
  for (const ft of fileResult.templates) {
    byName.set(ft.name, toUnified(ft));
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Look up a template by name. Priority: repo file > global file > DB.
 */
export function getByName(
  db: DatabaseType,
  name: string,
  repoPath?: string,
): UnifiedTemplate | null {
  // Check file templates first
  const fileResult = loadFileTemplates(repoPath);
  // Prefer repo over global — since repo comes later in the array, find from end
  for (let i = fileResult.templates.length - 1; i >= 0; i--) {
    if (fileResult.templates[i].name === name) {
      return toUnified(fileResult.templates[i]);
    }
  }

  // Fall back to DB
  const dbTemplate = templateService.getByName(db, name);
  if (dbTemplate) {
    return { ...dbTemplate, source: 'db' };
  }

  return null;
}

/**
 * Look up a template by ID. Routes file:* IDs to the loader, tmpl_* IDs to the DB.
 */
export function getById(db: DatabaseType, id: string, repoPath?: string): UnifiedTemplate | null {
  if (id.startsWith('file:')) {
    const fileResult = loadFileTemplates(repoPath);
    const found = fileResult.templates.find((t) => t.id === id);
    return found ? toUnified(found) : null;
  }

  const dbTemplate = templateService.get(db, id);
  if (dbTemplate) {
    return { ...dbTemplate, source: 'db' };
  }

  return null;
}

/**
 * Apply a template (from any source) to create a workflow.
 * For file templates, resolves variable defaults from rich declarations before delegating.
 */
export function applyTemplate(
  db: DatabaseType,
  id: string,
  params: templateService.ApplyParams,
  repoPath?: string,
): templateService.ApplyResult {
  if (id.startsWith('file:')) {
    return applyFileTemplate(db, id, params, repoPath);
  }

  // DB template — use existing service
  return templateService.apply(db, id, params);
}

function applyFileTemplate(
  db: DatabaseType,
  id: string,
  params: templateService.ApplyParams,
  repoPath?: string,
): templateService.ApplyResult {
  const fileResult = loadFileTemplates(repoPath);
  const found = fileResult.templates.find((t) => t.id === id);
  if (!found) {
    throw new Error(`Template not found: ${id}`);
  }

  // Re-parse original file to get rich variable definitions
  let fileDef: FileTemplateDefinition | undefined;
  if (existsSync(found.filePath)) {
    const content = readFileSync(found.filePath, 'utf-8');
    const ext = extname(found.filePath).toLowerCase();
    const raw = ext === '.json' ? JSON.parse(content) : parseYaml(content);
    fileDef = fileTemplateSchema.parse(raw);
  }

  // Merge variable defaults into provided variables
  const defaults = fileDef ? extractVariableDefaults(fileDef.variables) : {};
  const mergedVars = { ...defaults, ...params.variables };

  return db.transaction(() => {
    return templateService.applyDefinition(
      db,
      found.definition,
      { ...params, variables: mergedVars },
      found.id,
      found.name,
    );
  })();
}

function toUnified(ft: ResolvedFileTemplate): UnifiedTemplate {
  return {
    id: ft.id,
    name: ft.name,
    description: ft.description,
    template: ft.template,
    version: ft.version,
    created_at: ft.created_at,
    updated_at: ft.updated_at,
    source: ft.source,
  };
}
