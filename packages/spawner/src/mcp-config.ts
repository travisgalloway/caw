import type { McpSSEServerConfig } from '@anthropic-ai/claude-agent-sdk';

export function buildMcpConfig(mcpServerUrl: string): Record<string, McpSSEServerConfig> {
  return {
    caw: {
      type: 'sse',
      url: mcpServerUrl,
    },
  };
}
