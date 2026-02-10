import { describe, expect, it } from 'bun:test';
import { resolveConfig } from './config';

describe('resolveConfig', () => {
  describe('parsePort', () => {
    it('rejects port 0', () => {
      expect(() => resolveConfig({ port: '0' })).toThrow(
        "Invalid port: '0'. Must be an integer between 1 and 65535.",
      );
    });

    it('rejects negative port', () => {
      expect(() => resolveConfig({ port: '-1' })).toThrow(
        "Invalid port: '-1'. Must be an integer between 1 and 65535.",
      );
    });

    it('rejects port above 65535', () => {
      expect(() => resolveConfig({ port: '70000' })).toThrow(
        "Invalid port: '70000'. Must be an integer between 1 and 65535.",
      );
    });

    it('rejects non-integer port', () => {
      expect(() => resolveConfig({ port: '3.14' })).toThrow(
        "Invalid port: '3.14'. Must be an integer between 1 and 65535.",
      );
    });

    it('rejects non-numeric port', () => {
      expect(() => resolveConfig({ port: 'abc' })).toThrow(
        "Invalid port: 'abc'. Must be an integer between 1 and 65535.",
      );
    });

    it('accepts valid port', () => {
      const config = resolveConfig({ port: '8080' });
      expect(config.port).toBe(8080);
    });
  });

  describe('parseTransport', () => {
    it('rejects invalid transport', () => {
      expect(() => resolveConfig({ transport: 'sse' })).toThrow(
        "Invalid transport: 'sse'. Must be 'stdio' or 'http'.",
      );
    });
  });

  describe('parseDbMode', () => {
    it('rejects invalid db mode', () => {
      expect(() => resolveConfig({ mode: 'repository' })).toThrow(
        "Invalid db mode: 'repository'. Must be 'global' or 'per-repo'.",
      );
    });
  });
});
