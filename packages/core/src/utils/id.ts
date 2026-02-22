import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const nanoid = customAlphabet(alphabet, 12);

export function generateId(prefix: string): string {
  return `${prefix}_${nanoid()}`;
}

export function workflowId(): string {
  return generateId('wf');
}

export function taskId(): string {
  return generateId('tk');
}

export function checkpointId(): string {
  return generateId('cp');
}

export function workspaceId(): string {
  return generateId('ws');
}

export function repositoryId(): string {
  return generateId('rp');
}

export function templateId(): string {
  return generateId('tmpl');
}

export function agentId(): string {
  return generateId('ag');
}

export function messageId(): string {
  return generateId('msg');
}

export function sessionId(): string {
  return generateId('ss');
}

export function memoryId(): string {
  return generateId('mem');
}
