import { describe, expect, test } from 'bun:test';
import * as spawner from './index';

describe('spawner barrel exports', () => {
  test('exports AgentSession class', () => {
    expect(spawner.AgentSession).toBeDefined();
    expect(typeof spawner.AgentSession).toBe('function');
  });

  test('exports AgentPool class', () => {
    expect(spawner.AgentPool).toBeDefined();
    expect(typeof spawner.AgentPool).toBe('function');
  });

  test('exports WorkflowSpawner class', () => {
    expect(spawner.WorkflowSpawner).toBeDefined();
    expect(typeof spawner.WorkflowSpawner).toBe('function');
  });

  test('exports prompt builders', () => {
    expect(typeof spawner.buildAgentSystemPrompt).toBe('function');
    expect(typeof spawner.buildPlannerSystemPrompt).toBe('function');
  });

  test('exports MCP config builder', () => {
    expect(typeof spawner.buildMcpConfig).toBe('function');
  });

  test('exports registry functions', () => {
    expect(typeof spawner.registerSpawner).toBe('function');
    expect(typeof spawner.unregisterSpawner).toBe('function');
    expect(typeof spawner.getSpawner).toBe('function');
    expect(typeof spawner.listSpawners).toBe('function');
    expect(typeof spawner.clearRegistry).toBe('function');
  });
});
