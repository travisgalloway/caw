import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { TemplateDefinition } from '../services/template.service';
import type { WorkflowTemplate } from '../types/template';
import type { FileTemplateDefinition, TemplateSource } from './schema';
import { fileTemplateSchema } from './schema';

export interface ResolvedFileTemplate extends WorkflowTemplate {
  source: TemplateSource;
  filePath: string;
  definition: TemplateDefinition;
}

export interface LoadResult {
  templates: ResolvedFileTemplate[];
  warnings: string[];
}

function slugFromFilename(filename: string): string {
  return basename(filename, extname(filename));
}

function parseFile(filePath: string): unknown {
  const content = readFileSync(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();
  if (ext === '.json') {
    return JSON.parse(content);
  }
  return parseYaml(content);
}

/**
 * Normalize variables from the file format (string | object) to plain string[]
 * used by TemplateDefinition.
 */
function normalizeVariables(vars: FileTemplateDefinition['variables']): string[] {
  if (!vars) return [];
  return vars.map((v) => (typeof v === 'string' ? v : v.name));
}

/**
 * Build a map of variable defaults from rich variable declarations.
 */
export function extractVariableDefaults(
  vars: FileTemplateDefinition['variables'],
): Record<string, string> {
  const defaults: Record<string, string> = {};
  if (!vars) return defaults;
  for (const v of vars) {
    if (typeof v !== 'string' && v.default !== undefined) {
      defaults[v.name] = v.default;
    }
  }
  return defaults;
}

function toResolvedTemplate(
  def: FileTemplateDefinition,
  source: TemplateSource,
  filePath: string,
): ResolvedFileTemplate {
  const slug = slugFromFilename(filePath);
  const prefix = source === 'file:repo' ? 'file:repo' : 'file:global';
  const id = `${prefix}:${slug}`;

  const templateDef: TemplateDefinition = {
    tasks: def.tasks,
    variables: normalizeVariables(def.variables),
  };

  return {
    id,
    name: def.name,
    description: def.description ?? null,
    template: JSON.stringify(templateDef),
    version: 1,
    created_at: 0,
    updated_at: 0,
    source,
    filePath,
    definition: templateDef,
  };
}

/** Load all valid templates from a directory. */
export function loadTemplatesFromDir(dir: string, source: TemplateSource): LoadResult {
  const templates: ResolvedFileTemplate[] = [];
  const warnings: string[] = [];

  if (!existsSync(dir)) {
    return { templates, warnings };
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return { templates, warnings };
  }

  for (const entry of entries) {
    const ext = extname(entry).toLowerCase();
    if (ext !== '.json' && ext !== '.yaml' && ext !== '.yml') continue;

    const filePath = join(dir, entry);
    try {
      const raw = parseFile(filePath);
      const parsed = fileTemplateSchema.parse(raw);
      templates.push(toResolvedTemplate(parsed, source, filePath));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`${filePath}: ${msg}`);
    }
  }

  return { templates, warnings };
}

/** Returns the template directories for the given repo path. */
export function getTemplateDirs(repoPath?: string): { repo: string | null; global: string } {
  return {
    repo: repoPath ? join(repoPath, '.caw', 'templates') : null,
    global: join(homedir(), '.caw', 'templates'),
  };
}

/** Load file-based templates from global + repo dirs. Repo templates override global by name. */
export function loadFileTemplates(repoPath?: string): LoadResult {
  const dirs = getTemplateDirs(repoPath);
  const allTemplates: ResolvedFileTemplate[] = [];
  const allWarnings: string[] = [];

  // Global first (lower priority)
  const globalResult = loadTemplatesFromDir(dirs.global, 'file:global');
  allTemplates.push(...globalResult.templates);
  allWarnings.push(...globalResult.warnings);

  // Repo second (higher priority — will override global by name in resolver)
  if (dirs.repo) {
    const repoResult = loadTemplatesFromDir(dirs.repo, 'file:repo');
    allTemplates.push(...repoResult.templates);
    allWarnings.push(...repoResult.warnings);
  }

  return { templates: allTemplates, warnings: allWarnings };
}
