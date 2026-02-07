import { useStdout } from 'ink';
import { useEffect, useState } from 'react';

export interface TerminalSize {
  columns: number;
  rows: number;
}

const FALLBACK: TerminalSize = { columns: 80, rows: 24 };

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [, rerender] = useState(0);

  useEffect(() => {
    if (!stdout) return;

    const onResize = () => {
      rerender((n) => n + 1);
    };

    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return {
    columns: stdout?.columns ?? FALLBACK.columns,
    rows: stdout?.rows ?? FALLBACK.rows,
  };
}
