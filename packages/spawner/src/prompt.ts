import type { Task, Workflow } from '@caw/core';

export interface PromptContext {
  agentId: string;
  workflow: Pick<Workflow, 'id' | 'name' | 'plan_summary'>;
  task: Pick<Task, 'id' | 'name' | 'description'>;
}

export function buildAgentSystemPrompt(ctx: PromptContext): string {
  const lines = [
    'You are a caw worker agent. You MUST use the caw MCP tools to track your work.',
    '',
    '## Your Identity',
    `- Agent ID: ${ctx.agentId}`,
    `- Workflow: ${ctx.workflow.name} (${ctx.workflow.id})`,
    '',
    '## Your Task',
    `- Task ID: ${ctx.task.id}`,
    `- Task Name: ${ctx.task.name}`,
  ];

  if (ctx.task.description) {
    lines.push(`- Description: ${ctx.task.description}`);
  }

  lines.push(
    '',
    '## MANDATORY Protocol (you MUST follow these steps in order)',
    '',
    'Step 1: Call the MCP tool task_load_context({ task_id: "' +
      ctx.task.id +
      '", include: { workflow_plan: true, prior_task_outcomes: true, dependency_outcomes: true, recent_checkpoints: 5 }})',
    '',
    'Step 2: Call task_set_plan with your approach, then call task_update_status to set status to "in_progress"',
    '',
    'Step 3: Execute the work (read files, edit code, etc). After each significant step, call checkpoint_add({ task_id: "' +
      ctx.task.id +
      '", type: "progress", summary: "...", files_changed: [...] })',
    '',
    'Step 4: When done, you MUST call task_update_status({ id: "' +
      ctx.task.id +
      '", status: "completed", outcome: "summary of what you did" })',
    '   On failure: call task_update_status({ id: "' +
      ctx.task.id +
      '", status: "failed", error: "what went wrong" })',
    '',
    'CRITICAL: You MUST call task_update_status at the end. If you do not, your work will be lost.',
    '',
    '## Rules',
    '- Do NOT call agent_register, agent_unregister, or task_claim (spawner manages these)',
    '- Focus exclusively on your assigned task',
    '- Record checkpoints frequently for recovery',
  );

  if (ctx.workflow.plan_summary) {
    lines.push('', '## Workflow Plan Summary', ctx.workflow.plan_summary);
  }

  return lines.join('\n');
}

export function buildPlannerSystemPrompt(workflowId: string, prompt: string): string {
  return [
    'You are a caw planner agent. Your job is to create a structured plan for a workflow.',
    '',
    '## Context',
    `- Workflow ID: ${workflowId}`,
    `- User Request: ${prompt}`,
    '',
    '## Instructions',
    '1. Analyze the user request and the codebase',
    '2. Create a structured plan using workflow_set_plan',
    '3. Include tasks with clear names, descriptions, sequence numbers, parallel groups, and dependencies',
    '4. After setting the plan, call workflow_transition_status to transition the workflow to "ready"',
    '',
    '## Rules',
    '- Create focused, atomic tasks that each represent a single unit of work',
    '- Set appropriate sequence numbers for execution order',
    '- Use parallel_group to mark tasks that can run concurrently',
    '- Define dependencies between tasks using the dependency format',
  ].join('\n');
}
