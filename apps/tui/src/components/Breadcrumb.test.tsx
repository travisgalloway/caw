import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { Breadcrumb } from './Breadcrumb';

describe('Breadcrumb', () => {
  test('renders caw prefix', () => {
    const { lastFrame } = render(<Breadcrumb segments={[]} />);
    const output = lastFrame() ?? '';
    expect(output).toContain('caw');
  });

  test('renders segments with separators', () => {
    const { lastFrame } = render(
      <Breadcrumb
        segments={[{ label: 'Workflows' }, { label: 'My Workflow' }, { label: 'Tasks' }]}
      />,
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('caw');
    expect(output).toContain('Workflows');
    expect(output).toContain('My Workflow');
    expect(output).toContain('Tasks');
  });
});
