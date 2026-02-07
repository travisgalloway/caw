import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useMemo } from 'react';

export interface Column<T> {
  key: keyof T & string;
  header: string;
  width?: number;
  render?: (value: T[keyof T], row: T) => React.JSX.Element | string;
}

interface SelectableTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onConfirm: (item: T) => void;
  isFocused?: boolean;
  emptyMessage?: string;
  maxVisibleRows?: number;
}

export function SelectableTable<T extends { id: string }>({
  data,
  columns,
  selectedIndex,
  onSelectIndex,
  onConfirm,
  isFocused = true,
  emptyMessage = 'No data',
  maxVisibleRows,
}: SelectableTableProps<T>): React.JSX.Element {
  useInput(
    (_input, key) => {
      if (data.length === 0) return;

      if (key.upArrow) {
        onSelectIndex(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        onSelectIndex(Math.min(data.length - 1, selectedIndex + 1));
      } else if (key.return) {
        const item = data[selectedIndex];
        if (item) {
          onConfirm(item);
        }
      }
    },
    { isActive: isFocused },
  );

  const scrollWindow = useMemo(() => {
    if (!maxVisibleRows || data.length <= maxVisibleRows) {
      return { start: 0, end: data.length };
    }
    const half = Math.floor(maxVisibleRows / 2);
    let start = selectedIndex - half;
    if (start < 0) start = 0;
    let end = start + maxVisibleRows;
    if (end > data.length) {
      end = data.length;
      start = Math.max(0, end - maxVisibleRows);
    }
    return { start, end };
  }, [data.length, maxVisibleRows, selectedIndex]);

  const visibleData = data.slice(scrollWindow.start, scrollWindow.end);

  if (data.length === 0) {
    return <Text dimColor>{emptyMessage}</Text>;
  }

  return (
    <Box flexDirection="column">
      {/* Header row */}
      <Box>
        {columns.map((col) => (
          <Box key={col.key} width={col.width}>
            <Text bold dimColor>
              {col.header}
            </Text>
          </Box>
        ))}
      </Box>
      {/* Data rows */}
      {visibleData.map((row, visibleIdx) => {
        const actualIndex = scrollWindow.start + visibleIdx;
        const isSelected = isFocused && actualIndex === selectedIndex;
        return (
          <Box key={row.id}>
            {columns.map((col) => (
              <Box key={col.key} width={col.width}>
                {col.render ? (
                  <Text inverse={isSelected}>{col.render(row[col.key], row)}</Text>
                ) : (
                  <Text inverse={isSelected}>{String(row[col.key] ?? '')}</Text>
                )}
              </Box>
            ))}
          </Box>
        );
      })}
      {maxVisibleRows && data.length > maxVisibleRows && (
        <Text dimColor>
          [{scrollWindow.start + 1}-{scrollWindow.end} of {data.length}]
        </Text>
      )}
    </Box>
  );
}
