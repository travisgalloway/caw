import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateId } from '@caw/core';

export function buildMcpConfigFile(mcpServerUrl: string): string {
  const config = {
    mcpServers: {
      caw: {
        type: 'http',
        url: mcpServerUrl,
      },
    },
  };

  const filePath = join(tmpdir(), `caw-mcp-${generateId('mc')}.json`);
  writeFileSync(filePath, JSON.stringify(config, null, 2));
  return filePath;
}

export function cleanupMcpConfigFile(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // File may already be cleaned up
  }
}
