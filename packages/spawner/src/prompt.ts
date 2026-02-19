import type { Task, Workflow } from '@caw/core';

export interface PromptContext {
  agentId: string;
  workflow: Pick<Workflow, 'id' | 'name' | 'plan_summary'>;
  task: Pick<Task, 'id' | 'name' | 'description'>;
  branch?: string;
  worktreePath?: string;
  issueContext?: string;
  humanAgentId?: string;
  priorMessages?: string;
}

export interface WorkPlannerContext {
  workflowId: string;
  issues: Array<{
    number: number;
    title: string;
    body: string;
    labels: string[];
    workspaceId?: string;
    branch?: string;
  }>;
  branch: string;
  repoFullName: string;
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

  if (ctx.worktreePath) {
    lines.push(
      '',
      '## Worktree',
      `You are working in an isolated git worktree at: ${ctx.worktreePath}`,
      'Do NOT modify files outside this worktree.',
    );
  }

  if (ctx.branch) {
    lines.push(
      '',
      '## Git Branch',
      `You are working on git branch \`${ctx.branch}\`. Commit all changes to this branch.`,
      'Do NOT switch branches or create new branches.',
    );
  }

  // PR creation instructions for tasks that involve creating a PR
  const taskNameLower = ctx.task.name.toLowerCase();
  if (
    taskNameLower.includes('create pr') ||
    taskNameLower.includes('pull request') ||
    taskNameLower.includes('open pr')
  ) {
    lines.push(
      '',
      '## PR Creation Instructions',
      'This task requires creating a pull request. Follow these steps:',
      `1. Ensure all changes are committed to the \`${ctx.branch ?? 'current'}\` branch`,
      '2. Push the branch: git push -u origin <branch>',
      '3. Create the PR using: gh pr create --title "..." --body "..."',
      '4. Include "Closes #<issue_number>" in the PR body to auto-link the issue',
      '5. Record the PR URL in your task outcome',
    );
  }

  if (ctx.humanAgentId) {
    lines.push(
      '',
      '## Asking for Human Input',
      'If you are blocked and need human input to proceed:',
      `1. Call message_send({ sender_id: "${ctx.agentId}", recipient_id: "${ctx.humanAgentId}", message_type: "query", body: "Your question here", task_id: "${ctx.task.id}", workflow_id: "${ctx.workflow.id}" })`,
      `2. Call task_update_status({ id: "${ctx.task.id}", status: "paused" })`,
      '3. The spawner will resume your task when a human replies.',
    );
  }

  if (ctx.priorMessages) {
    lines.push(
      '',
      '## Prior Message Thread',
      'This task was previously paused for human input. Here is the conversation:',
      ctx.priorMessages,
      'Use this context to continue without re-asking the same question.',
    );
  }

  if (ctx.issueContext) {
    lines.push('', '## Issue Context', ctx.issueContext);
  }

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

export function buildWorkPlannerPrompt(ctx: WorkPlannerContext): string {
  const issueList = ctx.issues
    .map((i) => {
      const labels = i.labels.length > 0 ? ` [${i.labels.join(', ')}]` : '';
      const workspace =
        i.workspaceId && i.branch
          ? `\n  Workspace: ${i.workspaceId} (branch: \`${i.branch}\`)`
          : '';
      return `- #${i.number}: ${i.title}${labels}${workspace}\n  ${i.body.slice(0, 500)}`;
    })
    .join('\n');

  return [
    'You are a caw planner agent for self-development. Your job is to analyze GitHub issue(s) and create an implementation plan.',
    '',
    '## Context',
    `- Workflow ID: ${ctx.workflowId}`,
    `- Repository: ${ctx.repoFullName}`,
    `- Branch: ${ctx.branch}`,
    '',
    '## GitHub Issues',
    issueList,
    '',
    '## Instructions',
    '1. Read and understand the codebase structure (check CLAUDE.md, key files, existing patterns)',
    '2. Analyze the GitHub issue(s) and determine the implementation approach',
    '3. Break the work into focused, atomic tasks with clear dependencies',
    '4. Include a final "Create PR" task that depends on all implementation tasks',
    '5. Create the plan using workflow_set_plan',
    '6. Transition the workflow to "ready" using workflow_update_status',
    '',
    '## Planning Rules',
    '- Each task should represent a single, focused unit of work (one file or one logical change)',
    '- Set sequence numbers for execution order; use parallel_group for independent tasks',
    '- The final task(s) must create PR(s) linking to the issue(s)',
    `- PR body must include "Closes #<number>" for each resolved issue`,
    '- Typically one PR per issue, but use your judgment for epics (multiple PRs may be appropriate)',
    '- Include verification tasks (build, test, lint) before the PR creation task',
    '',
    '## Workspace Assignment Rules',
    ctx.issues.some((i) => i.workspaceId)
      ? [
          '- Each issue has a pre-created worktree (workspace). The workspace IDs are listed above with each issue.',
          '- EVERY task MUST be assigned to a workspace by calling task_assign_workspace({ task_id, workspace_id }).',
          "- Default: all tasks for issue #N go to issue #N's workspace.",
          '- Backend changes (new endpoints, service changes) belong to the workspace of the issue they serve.',
          '- Each workspace gets its own verification task (build/test/lint) and its own "Create PR" task.',
          '- The "Create PR" task must be the LAST task in each workspace, depending on all other tasks in that workspace.',
          "- If issues share modified files (e.g. both touch the API client), that's OK — each worktree starts from the same base branch.",
        ].join('\n')
      : `- All work happens on branch \`${ctx.branch}\``,
    '',
    '## Task Description Format',
    'Each task description should include:',
    '- What files to create or modify',
    '- What the expected changes are',
    '- Any edge cases to handle',
  ].join('\n');
}
