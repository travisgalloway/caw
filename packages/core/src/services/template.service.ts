import type { DatabaseType } from '../db/connection';
import type { Task, TaskDependency } from '../types/task';
import type { WorkflowTemplate } from '../types/template';
import type { Workflow } from '../types/workflow';
import { templateId } from '../utils/id';
import * as workflowService from './workflow.service';

// --- Parameter / Result types ---

export interface TemplateTaskDefinition {
  name: string;
  description?: string;
  parallel_group?: string;
  estimated_complexity?: string;
  files_likely_affected?: string[];
  depends_on?: string[];
}

export interface TemplateDefinition {
  tasks: TemplateTaskDefinition[];
  variables?: string[];
}

export interface CreateParams {
  name: string;
  description?: string;
  fromWorkflowId?: string;
  template?: TemplateDefinition;
}

export interface ApplyParams {
  workflowName: string;
  variables?: Record<string, string>;
  repoPath?: string;
  maxParallel?: number;
}

export interface ApplyResult {
  workflow_id: string;
}

// --- Service functions ---

export function create(db: DatabaseType, params: CreateParams): WorkflowTemplate {
  if (params.fromWorkflowId && params.template) {
    throw new Error('Cannot provide both fromWorkflowId and template');
  }

  if (!params.fromWorkflowId && !params.template) {
    throw new Error('Must provide either fromWorkflowId or template');
  }

  let templateDef: TemplateDefinition;

  if (params.fromWorkflowId) {
    const workflow = db
      .prepare('SELECT * FROM workflows WHERE id = ?')
      .get(params.fromWorkflowId) as Workflow | undefined;

    if (!workflow) {
      throw new Error(`Workflow not found: ${params.fromWorkflowId}`);
    }

    const tasks = db
      .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence, name')
      .all(params.fromWorkflowId) as Task[];

    const allDeps = db
      .prepare(
        `SELECT td.* FROM task_dependencies td
         JOIN tasks t ON t.id = td.task_id
         WHERE t.workflow_id = ?`,
      )
      .all(params.fromWorkflowId) as TaskDependency[];

    // Build id→name map
    const idToName = new Map<string, string>();
    for (const task of tasks) {
      idToName.set(task.id, task.name);
    }

    // Build task definitions
    const taskDefs: TemplateTaskDefinition[] = tasks.map((task) => {
      const taskDepIds = allDeps
        .filter((d) => d.task_id === task.id && d.dependency_type === 'blocks')
        .map((d) => idToName.get(d.depends_on_id))
        .filter((name): name is string => !!name);

      const context = task.context ? JSON.parse(task.context) : {};

      const def: TemplateTaskDefinition = {
        name: task.name,
      };

      if (task.description) def.description = task.description;
      if (task.parallel_group) def.parallel_group = task.parallel_group;
      if (context.estimated_complexity) def.estimated_complexity = context.estimated_complexity;
      if (context.files_likely_affected) def.files_likely_affected = context.files_likely_affected;
      if (taskDepIds.length > 0) def.depends_on = taskDepIds;

      return def;
    });

    templateDef = { tasks: taskDefs };
  } else {
    templateDef = params.template as TemplateDefinition;
  }

  const now = Date.now();
  const templateJson = JSON.stringify(templateDef);

  const tmpl: WorkflowTemplate = {
    id: templateId(),
    name: params.name,
    description: params.description ?? null,
    template: templateJson,
    version: 1,
    created_at: now,
    updated_at: now,
  };

  try {
    db.prepare(
      `INSERT INTO workflow_templates
        (id, name, description, template, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      tmpl.id,
      tmpl.name,
      tmpl.description,
      tmpl.template,
      tmpl.version,
      tmpl.created_at,
      tmpl.updated_at,
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new Error(`Template name already exists: ${params.name}`);
    }
    throw err;
  }

  return tmpl;
}

export function get(db: DatabaseType, id: string): WorkflowTemplate | null {
  const row = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(id) as
    | WorkflowTemplate
    | undefined;
  return row ?? null;
}

export function list(db: DatabaseType): WorkflowTemplate[] {
  return db.prepare('SELECT * FROM workflow_templates ORDER BY name').all() as WorkflowTemplate[];
}

export function apply(db: DatabaseType, templateIdValue: string, params: ApplyParams): ApplyResult {
  const run = db.transaction(() => {
    const tmpl = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(templateIdValue) as
      | WorkflowTemplate
      | undefined;

    if (!tmpl) {
      throw new Error(`Template not found: ${templateIdValue}`);
    }

    const templateDef = JSON.parse(tmpl.template) as TemplateDefinition;

    // Collect required variables from template
    const requiredVars = templateDef.variables ?? [];

    // Also scan task names and descriptions for {{variable}} patterns
    const variablePattern = /\{\{(\w+)\}\}/g;
    const discoveredVars = new Set<string>(requiredVars);

    for (const task of templateDef.tasks) {
      for (const match of task.name.matchAll(variablePattern)) {
        discoveredVars.add(match[1]);
      }
      if (task.description) {
        for (const match of task.description.matchAll(variablePattern)) {
          discoveredVars.add(match[1]);
        }
      }
      if (task.depends_on) {
        for (const dep of task.depends_on) {
          for (const match of dep.matchAll(variablePattern)) {
            discoveredVars.add(match[1]);
          }
        }
      }
    }

    // Validate all required variables are provided
    const providedVars = params.variables ?? {};
    const missingVars = [...discoveredVars].filter((v) => !(v in providedVars));
    if (missingVars.length > 0) {
      throw new Error(`Missing required variables: ${missingVars.join(', ')}`);
    }

    // Interpolate variables
    function interpolate(text: string): string {
      return text.replace(variablePattern, (_, varName) => {
        return providedVars[varName] ?? '';
      });
    }

    const interpolatedTasks: workflowService.PlanTask[] = templateDef.tasks.map((task) => {
      const planTask: workflowService.PlanTask = {
        name: interpolate(task.name),
      };

      if (task.description) planTask.description = interpolate(task.description);
      if (task.parallel_group) planTask.parallel_group = task.parallel_group;
      if (task.estimated_complexity) planTask.estimated_complexity = task.estimated_complexity;
      if (task.files_likely_affected) planTask.files_likely_affected = task.files_likely_affected;
      if (task.depends_on) {
        planTask.depends_on = task.depends_on.map((dep) => interpolate(dep));
      }

      return planTask;
    });

    // Create workflow
    const workflow = workflowService.create(db, {
      name: params.workflowName,
      source_type: 'template',
      source_ref: tmpl.id,
      repository_path: params.repoPath,
      max_parallel_tasks: params.maxParallel,
    });

    // Set plan
    workflowService.setPlan(db, workflow.id, {
      summary: `Applied template: ${tmpl.name}`,
      tasks: interpolatedTasks,
    });

    return { workflow_id: workflow.id };
  });

  return run();
}

export function updateVersion(
  db: DatabaseType,
  id: string,
  template: TemplateDefinition,
): WorkflowTemplate {
  const existing = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(id) as
    | WorkflowTemplate
    | undefined;

  if (!existing) {
    throw new Error(`Template not found: ${id}`);
  }

  const now = Date.now();
  const newVersion = existing.version + 1;
  const templateJson = JSON.stringify(template);

  db.prepare(
    'UPDATE workflow_templates SET template = ?, version = ?, updated_at = ? WHERE id = ?',
  ).run(templateJson, newVersion, now, id);

  return { ...existing, template: templateJson, version: newVersion, updated_at: now };
}
