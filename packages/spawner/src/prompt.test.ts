import { describe, expect, test } from 'bun:test';
import { buildAgentSystemPrompt, buildPlannerSystemPrompt } from './prompt';

describe('buildAgentSystemPrompt', () => {
  test('includes agent ID, workflow, and task info', () => {
    const prompt = buildAgentSystemPrompt({
      agentId: 'ag_test123',
      workflow: { id: 'wf_abc', name: 'Test Workflow', plan_summary: null, source_content: null },
      task: { id: 'tk_def', name: 'Fix bug', description: 'Fix the login bug' },
    });

    expect(prompt).toContain('ag_test123');
    expect(prompt).toContain('wf_abc');
    expect(prompt).toContain('Test Workflow');
    expect(prompt).toContain('tk_def');
    expect(prompt).toContain('Fix bug');
    expect(prompt).toContain('Fix the login bug');
  });

  test('includes protocol instructions', () => {
    const prompt = buildAgentSystemPrompt({
      agentId: 'ag_test123',
      workflow: { id: 'wf_abc', name: 'Test', plan_summary: null, source_content: null },
      task: { id: 'tk_def', name: 'Task', description: null },
    });

    expect(prompt).toContain('task_load_context');
    expect(prompt).toContain('task_set_plan');
    expect(prompt).toContain('task_update_status');
    expect(prompt).toContain('checkpoint_add');
  });

  test('includes rules about restricted tools', () => {
    const prompt = buildAgentSystemPrompt({
      agentId: 'ag_test123',
      workflow: { id: 'wf_abc', name: 'Test', plan_summary: null, source_content: null },
      task: { id: 'tk_def', name: 'Task', description: null },
    });

    expect(prompt).toContain('Do NOT call agent_register');
    expect(prompt).toContain('agent_unregister');
    expect(prompt).toContain('task_claim');
  });

  test('includes plan summary when available', () => {
    const prompt = buildAgentSystemPrompt({
      agentId: 'ag_test123',
      workflow: {
        id: 'wf_abc',
        name: 'Test',
        plan_summary: 'This is the overall plan for the workflow',
        source_content: null,
      },
      task: { id: 'tk_def', name: 'Task', description: null },
    });

    expect(prompt).toContain('Workflow Plan Summary');
    expect(prompt).toContain('This is the overall plan for the workflow');
  });

  test('omits plan summary section when null', () => {
    const prompt = buildAgentSystemPrompt({
      agentId: 'ag_test123',
      workflow: { id: 'wf_abc', name: 'Test', plan_summary: null, source_content: null },
      task: { id: 'tk_def', name: 'Task', description: null },
    });

    expect(prompt).not.toContain('Workflow Plan Summary');
  });

  test('includes goal chain when source_content and dependency chain are provided', () => {
    const prompt = buildAgentSystemPrompt({
      agentId: 'ag_test123',
      workflow: {
        id: 'wf_abc',
        name: 'Test',
        plan_summary: null,
        source_content: 'Build a REST API with user auth',
      },
      task: { id: 'tk_def', name: 'Add auth middleware', description: null },
      dependencyChain: ['Set up database', 'Create user model'],
    });

    expect(prompt).toContain('Goal Chain');
    expect(prompt).toContain('Build a REST API with user auth');
    expect(prompt).toContain('Set up database → Create user model → **Add auth middleware**');
  });

  test('omits goal chain when source_content and dependency chain are both absent', () => {
    const prompt = buildAgentSystemPrompt({
      agentId: 'ag_test123',
      workflow: { id: 'wf_abc', name: 'Test', plan_summary: null, source_content: null },
      task: { id: 'tk_def', name: 'Task', description: null },
    });

    expect(prompt).not.toContain('Goal Chain');
  });

  test('truncates long source_content in goal chain', () => {
    const longContent = 'A'.repeat(600);
    const prompt = buildAgentSystemPrompt({
      agentId: 'ag_test123',
      workflow: {
        id: 'wf_abc',
        name: 'Test',
        plan_summary: null,
        source_content: longContent,
      },
      task: { id: 'tk_def', name: 'Task', description: null },
    });

    expect(prompt).toContain(`${'A'.repeat(500)}...`);
    expect(prompt).not.toContain('A'.repeat(501));
  });

  test('omits description line when task description is null', () => {
    const prompt = buildAgentSystemPrompt({
      agentId: 'ag_test123',
      workflow: { id: 'wf_abc', name: 'Test', plan_summary: null, source_content: null },
      task: { id: 'tk_def', name: 'Task', description: null },
    });

    expect(prompt).not.toContain('Description:');
  });
});

describe('buildPlannerSystemPrompt', () => {
  test('includes workflow ID and prompt', () => {
    const prompt = buildPlannerSystemPrompt('wf_abc123', 'Build a REST API');

    expect(prompt).toContain('wf_abc123');
    expect(prompt).toContain('Build a REST API');
  });

  test('includes planning instructions', () => {
    const prompt = buildPlannerSystemPrompt('wf_abc', 'task');

    expect(prompt).toContain('workflow_set_plan');
    expect(prompt).toContain('workflow_transition_status');
    expect(prompt).toContain('ready');
  });
});
