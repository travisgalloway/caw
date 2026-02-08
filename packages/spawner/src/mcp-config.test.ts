import { describe, expect, test } from 'bun:test';
import { buildMcpConfig } from './mcp-config';

describe('buildMcpConfig', () => {
  test('returns SSE config pointing to given URL', () => {
    const config = buildMcpConfig('http://localhost:3100/mcp');

    expect(config).toEqual({
      caw: {
        type: 'sse',
        url: 'http://localhost:3100/mcp',
      },
    });
  });

  test('uses the caw server name', () => {
    const config = buildMcpConfig('http://example.com/mcp');
    expect(config.caw).toBeDefined();
    expect(Object.keys(config)).toEqual(['caw']);
  });
});
