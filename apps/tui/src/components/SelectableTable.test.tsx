import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import type { Column } from './SelectableTable';
import { SelectableTable } from './SelectableTable';

interface TestRow {
  id: string;
  name: string;
  status: string;
}

const columns: Column<TestRow>[] = [
  { key: 'name', header: 'Name', width: 20 },
  { key: 'status', header: 'Status', width: 10 },
];

const data: TestRow[] = [
  { id: '1', name: 'Alpha', status: 'active' },
  { id: '2', name: 'Beta', status: 'paused' },
  { id: '3', name: 'Gamma', status: 'done' },
];

describe('SelectableTable', () => {
  test('renders header row and data rows', () => {
    const { lastFrame } = render(
      <SelectableTable
        data={data}
        columns={columns}
        selectedIndex={0}
        onSelectIndex={() => {}}
        onConfirm={() => {}}
      />,
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('Name');
    expect(output).toContain('Status');
    expect(output).toContain('Alpha');
    expect(output).toContain('Beta');
    expect(output).toContain('Gamma');
  });

  test('shows empty message when data is empty', () => {
    const { lastFrame } = render(
      <SelectableTable
        data={[]}
        columns={columns}
        selectedIndex={0}
        onSelectIndex={() => {}}
        onConfirm={() => {}}
        emptyMessage="Nothing here"
      />,
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('Nothing here');
  });

  test('renders default empty message', () => {
    const { lastFrame } = render(
      <SelectableTable
        data={[]}
        columns={columns}
        selectedIndex={0}
        onSelectIndex={() => {}}
        onConfirm={() => {}}
      />,
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('No data');
  });
});
