import type { WorkflowSpawner } from './spawner.service';

const spawnerRegistry = new Map<string, WorkflowSpawner>();

let globalActiveAgents = 0;

export function registerSpawner(workflowId: string, spawner: WorkflowSpawner): void {
  spawnerRegistry.set(workflowId, spawner);
}

export function unregisterSpawner(workflowId: string): void {
  spawnerRegistry.delete(workflowId);
}

export function getSpawner(workflowId: string): WorkflowSpawner | undefined {
  return spawnerRegistry.get(workflowId);
}

export function listSpawners(): Map<string, WorkflowSpawner> {
  return new Map(spawnerRegistry);
}

export function clearRegistry(): void {
  spawnerRegistry.clear();
  globalActiveAgents = 0;
}

export function getGlobalAgentCount(): number {
  return globalActiveAgents;
}

export function incrementGlobalAgentCount(): void {
  globalActiveAgents++;
}

export function decrementGlobalAgentCount(): void {
  if (globalActiveAgents > 0) {
    globalActiveAgents--;
  }
}
