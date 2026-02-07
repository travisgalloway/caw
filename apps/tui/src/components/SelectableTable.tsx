import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { ScrollArea } from './ScrollArea';

export interface Column<T> {
  key: keyof T & string;
  header: string;
  width?: number;
  render?: (value: T[keyof T], row: T) => React.JSX.Element | string;
  /** Unique identifier for React key when multiple columns share the same data key */
  id?: string;
}

interface SelectableTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onConfirm: (item: T) => void;
  isFocused?: boolean;
  emptyMessage?: string;
}

export function SelectableTable<T extends { id: string }>({
  data,
  columns,
  selectedIndex,
  onSelectIndex,
  onConfirm,
  isFocused = true,
  emptyMessage = 'No data',
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

  if (data.length === 0) {
    return <Text dimColor>{emptyMessage}</Text>;
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header row */}
      <Box>
        {columns.map((col) => (
          <Box
            key={col.id ?? col.key}
            {...(col.width ? { width: col.width } : { flexGrow: 1, overflow: 'hidden' as const })}
          >
            <Text bold dimColor>
              {col.header}
            </Text>
          </Box>
        ))}
      </Box>
      {/* Data rows */}
      <ScrollArea focusIndex={selectedIndex}>
        {data.map((row, idx) => {
          const isSelected = isFocused && idx === selectedIndex;
          return (
            <Box key={row.id}>
              {columns.map((col) => (
                <Box
                  key={col.id ?? col.key}
                  {...(col.width
                    ? { width: col.width }
                    : { flexGrow: 1, overflow: 'hidden' as const })}
                >
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
      </ScrollArea>
    </Box>
  );
}
