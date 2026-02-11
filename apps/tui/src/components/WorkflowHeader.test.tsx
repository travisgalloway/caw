import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { WorkflowHeader } from './WorkflowHeader';

const now = Date.now();

const baseWorkflow = {
  id: 'wf_test123456',
  name: 'Test Workflow',
  source_type: 'github_issue',
  source_ref: null,
  source_content: null,
  status: 'in_progress' as const,
  initial_plan: null,
  plan_summary: null,
  created_at: now - 3600000,
  updated_at: now,
  max_parallel_tasks: 3,
  auto_create_workspaces: 1,
  config: null,
  locked_by_session_id: null,
  locked_at: null,
  tasks: [],
};

const baseProgress = {
  total_tasks: 10,
  by_status: { completed: 6, in_progress: 2, pending: 2 },
  completed_sequence: 6,
  current_sequence: 7,
  blocked_tasks: [],
  parallel_groups: {},
  estimated_remaining: 4,
};

describe('WorkflowHeader', () => {
  test('renders workflow name', () => {
    const { lastFrame } = render(
      <WorkflowHeader workflow={baseWorkflow} progress={baseProgress} workspaceCount={2} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Test Workflow');
  });

  test('renders workflow status', () => {
    const { lastFrame } = render(
      <WorkflowHeader workflow={baseWorkflow} progress={baseProgress} workspaceCount={2} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('in_progress');
  });

  test('renders source type and parallel info', () => {
    const { lastFrame } = render(
      <WorkflowHeader workflow={baseWorkflow} progress={baseProgress} workspaceCount={2} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('github_issue');
    expect(frame).toContain('max 3');
  });

  test('renders workspace count', () => {
    const { lastFrame } = render(
      <WorkflowHeader workflow={baseWorkflow} progress={baseProgress} workspaceCount={5} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('5');
    expect(frame).toContain('Workspaces');
  });

  test('renders progress bar when progress has tasks', () => {
    const { lastFrame } = render(
      <WorkflowHeader workflow={baseWorkflow} progress={baseProgress} workspaceCount={2} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Progress');
    expect(frame).toContain('completed: 6');
    expect(frame).toContain('in_progress: 2');
    expect(frame).toContain('pending: 2');
  });

  test('does not render progress section when progress is null', () => {
    const { lastFrame } = render(
      <WorkflowHeader workflow={baseWorkflow} progress={null} workspaceCount={2} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('Progress');
  });

  test('does not render progress section when total_tasks is 0', () => {
    const emptyProgress = {
      ...baseProgress,
      total_tasks: 0,
      by_status: {},
    };
    const { lastFrame } = render(
      <WorkflowHeader workflow={baseWorkflow} progress={emptyProgress} workspaceCount={2} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('Progress');
  });

  test('renders labels for Source, Parallel, Created, Updated', () => {
    const { lastFrame } = render(
      <WorkflowHeader workflow={baseWorkflow} progress={null} workspaceCount={1} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Source:');
    expect(frame).toContain('Parallel:');
    expect(frame).toContain('Created:');
    expect(frame).toContain('Updated:');
  });
});
