import { describe, expect, test } from 'bun:test';
import { EXAMPLE_TEMPLATES } from './examples';
import { fileTemplateSchema } from './schema';

describe('example templates', () => {
  test('all examples validate against fileTemplateSchema', () => {
    for (const [name, def] of Object.entries(EXAMPLE_TEMPLATES)) {
      const result = fileTemplateSchema.safeParse(def);
      expect(result.success, `Example "${name}" failed validation: ${JSON.stringify(result)}`).toBe(
        true,
      );
    }
  });

  test('feature template has expected variables and tasks', () => {
    const feature = EXAMPLE_TEMPLATES.feature;
    expect(feature.name).toBe('feature');
    expect(feature.tasks).toHaveLength(4);
    expect(feature.variables).toHaveLength(2);
  });

  test('bugfix template has expected structure', () => {
    const bugfix = EXAMPLE_TEMPLATES.bugfix;
    expect(bugfix.name).toBe('bugfix');
    expect(bugfix.tasks).toHaveLength(4);
    expect(bugfix.variables).toHaveLength(1);
  });

  test('refactor template has expected structure', () => {
    const refactor = EXAMPLE_TEMPLATES.refactor;
    expect(refactor.name).toBe('refactor');
    expect(refactor.tasks).toHaveLength(4);
    expect(refactor.variables).toHaveLength(1);
  });

  test('provides 3 example templates', () => {
    expect(Object.keys(EXAMPLE_TEMPLATES)).toHaveLength(3);
    expect(Object.keys(EXAMPLE_TEMPLATES).sort()).toEqual(['bugfix', 'feature', 'refactor']);
  });
});
