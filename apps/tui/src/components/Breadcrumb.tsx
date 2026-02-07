import { Box, Text } from 'ink';
import type React from 'react';
import { THEME } from '../utils/theme';

export interface BreadcrumbSegment {
  label: string;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

export function Breadcrumb({ segments }: BreadcrumbProps): React.JSX.Element {
  return (
    <Box paddingX={1}>
      <Text bold color={THEME.brand}>
        caw
      </Text>
      {segments.map((seg) => (
        <Text key={seg.label}>
          <Text dimColor> {'>'} </Text>
          <Text>{seg.label}</Text>
        </Text>
      ))}
    </Box>
  );
}
