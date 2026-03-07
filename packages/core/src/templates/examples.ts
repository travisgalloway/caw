import type { FileTemplateDefinition } from './schema';

export const EXAMPLE_TEMPLATES: Record<string, FileTemplateDefinition> = {
  feature: {
    name: 'feature',
    description: 'Standard feature development workflow',
    variables: [
      { name: 'feature', description: 'Name of the feature to implement', required: true },
      { name: 'scope', description: 'Optional scope prefix', required: false, default: '' },
    ],
    tasks: [
      {
        name: 'Setup {{feature}}',
        description: 'Create scaffolding and initial structure',
      },
      {
        name: 'Implement {{feature}}',
        description: 'Core implementation',
        depends_on: ['Setup {{feature}}'],
        estimated_complexity: 'high',
      },
      {
        name: 'Test {{feature}}',
        description: 'Write tests',
        depends_on: ['Implement {{feature}}'],
        parallel_group: 'verify',
      },
      {
        name: 'Document {{feature}}',
        description: 'Update documentation',
        depends_on: ['Implement {{feature}}'],
        parallel_group: 'verify',
      },
    ],
  },

  bugfix: {
    name: 'bugfix',
    description: 'Bug investigation and fix workflow',
    variables: [{ name: 'bug', description: 'Brief description of the bug', required: true }],
    tasks: [
      {
        name: 'Reproduce {{bug}}',
        description: 'Create a reliable reproduction case',
      },
      {
        name: 'Diagnose {{bug}}',
        description: 'Identify root cause through debugging and code analysis',
        depends_on: ['Reproduce {{bug}}'],
      },
      {
        name: 'Fix {{bug}}',
        description: 'Implement the fix',
        depends_on: ['Diagnose {{bug}}'],
        estimated_complexity: 'medium',
      },
      {
        name: 'Verify fix for {{bug}}',
        description: 'Add regression tests and verify the fix',
        depends_on: ['Fix {{bug}}'],
      },
    ],
  },

  refactor: {
    name: 'refactor',
    description: 'Code refactoring workflow',
    variables: [{ name: 'target', description: 'Module or component to refactor', required: true }],
    tasks: [
      {
        name: 'Analyze {{target}}',
        description: 'Review current implementation, identify improvement areas',
      },
      {
        name: 'Add test coverage for {{target}}',
        description: 'Ensure sufficient test coverage before refactoring',
        depends_on: ['Analyze {{target}}'],
      },
      {
        name: 'Refactor {{target}}',
        description: 'Apply refactoring changes',
        depends_on: ['Add test coverage for {{target}}'],
        estimated_complexity: 'high',
      },
      {
        name: 'Verify {{target}} refactor',
        description: 'Run tests, check for regressions, update docs',
        depends_on: ['Refactor {{target}}'],
      },
    ],
  },
};
