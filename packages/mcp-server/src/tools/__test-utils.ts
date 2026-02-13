import { expect } from 'bun:test';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolErrorInfo } from './types';

export type ToolHandler = (
  args: Record<string, unknown>,
) => CallToolResult | Promise<CallToolResult>;

export function getToolHandler(server: unknown, name: string): ToolHandler {
  // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
  const tools = (server as any)._registeredTools as Record<string, { handler: ToolHandler }>;
  return tools[name].handler;
}

export function parseContent(result: CallToolResult): unknown {
  const text = result.content[0];
  if (text.type !== 'text') throw new Error('Expected text content');
  return JSON.parse(text.text);
}

export function parseError(result: CallToolResult): ToolErrorInfo {
  expect(result.isError).toBe(true);
  return parseContent(result) as ToolErrorInfo;
}

export function getRegisteredTools(server: unknown): Record<string, unknown> {
  // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
  return (server as any)._registeredTools as Record<string, unknown>;
}
