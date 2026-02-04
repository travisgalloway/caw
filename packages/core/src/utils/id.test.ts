import { describe, expect, it } from 'bun:test';
import {
  agentId,
  checkpointId,
  generateId,
  messageId,
  repositoryId,
  taskId,
  templateId,
  workflowId,
  workspaceId,
} from './id';

describe('generateId', () => {
  it('generates an ID with the given prefix', () => {
    const id = generateId('test');
    expect(id).toMatch(/^test_[0-9a-z]{12}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('u')));
    expect(ids.size).toBe(100);
  });

  it('only contains valid characters after prefix', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateId('x');
      const suffix = id.split('_')[1];
      expect(suffix).toMatch(/^[0-9a-z]{12}$/);
    }
  });
});

describe('prefix helpers', () => {
  it('workflowId starts with wf_', () => {
    expect(workflowId()).toMatch(/^wf_[0-9a-z]{12}$/);
  });

  it('taskId starts with tk_', () => {
    expect(taskId()).toMatch(/^tk_[0-9a-z]{12}$/);
  });

  it('checkpointId starts with cp_', () => {
    expect(checkpointId()).toMatch(/^cp_[0-9a-z]{12}$/);
  });

  it('workspaceId starts with ws_', () => {
    expect(workspaceId()).toMatch(/^ws_[0-9a-z]{12}$/);
  });

  it('repositoryId starts with rp_', () => {
    expect(repositoryId()).toMatch(/^rp_[0-9a-z]{12}$/);
  });

  it('templateId starts with tmpl_', () => {
    expect(templateId()).toMatch(/^tmpl_[0-9a-z]{12}$/);
  });

  it('agentId starts with ag_', () => {
    expect(agentId()).toMatch(/^ag_[0-9a-z]{12}$/);
  });

  it('messageId starts with msg_', () => {
    expect(messageId()).toMatch(/^msg_[0-9a-z]{12}$/);
  });
});
