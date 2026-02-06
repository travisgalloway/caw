import type { DatabaseType } from '@caw/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodTypeAny } from 'zod';

export type ToolRegistrar = (server: McpServer, db: DatabaseType) => void;

export interface ToolErrorInfo {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion: string;
}

export class ToolCallError extends Error {
  readonly code: string;
  readonly recoverable: boolean;
  readonly suggestion: string;

  constructor(info: ToolErrorInfo) {
    super(info.message);
    this.name = 'ToolCallError';
    this.code = info.code;
    this.recoverable = info.recoverable;
    this.suggestion = info.suggestion;
  }

  toJSON(): ToolErrorInfo {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      suggestion: this.suggestion,
    };
  }
}

/**
 * Registers a tool on the MCP server, bypassing deep Zod generic inference
 * that causes tsc to hang with complex nested schemas across 43 tools.
 * Zod schemas still validate at runtime; args are typed as Record<string, any>.
 */
export function defineTool(
  server: McpServer,
  name: string,
  config: { description: string; inputSchema?: Record<string, ZodTypeAny> },
  // biome-ignore lint/suspicious/noExplicitAny: intentional — breaks tsc inference chain
  handler: (args: Record<string, any>) => CallToolResult | Promise<CallToolResult>,
): void {
  // biome-ignore lint/suspicious/noExplicitAny: intentional — avoids registerTool generic inference
  (server as any).registerTool(name, config, handler);
}

export function toolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export function handleToolCall<T>(fn: () => T): CallToolResult {
  try {
    const result = fn();
    return toolResult(result);
  } catch (err: unknown) {
    if (err instanceof ToolCallError) {
      return {
        content: [{ type: 'text', text: JSON.stringify(err.toJSON(), null, 2) }],
        isError: true,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return toolError(message);
  }
}

export async function handleToolCallAsync<T>(fn: () => Promise<T>): Promise<CallToolResult> {
  try {
    const result = await fn();
    return toolResult(result);
  } catch (err: unknown) {
    if (err instanceof ToolCallError) {
      return {
        content: [{ type: 'text', text: JSON.stringify(err.toJSON(), null, 2) }],
        isError: true,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return toolError(message);
  }
}
