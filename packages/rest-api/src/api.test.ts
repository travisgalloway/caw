import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { agentService, sessionService, workflowService } from '@caw/core';
import type { RestApi } from './api';
import { createRestApi } from './api';
import { apiRequest, createTestDb } from './test-utils';

let db: DatabaseType;
let api: RestApi;

beforeEach(() => {
  db = createTestDb();
  api = createRestApi(db);
});

afterEach(() => {
  db.close();
});

// --- Helper ---

function req(method: string, path: string, body?: unknown) {
  return apiRequest(api.handle, method, path, body);
}

// --- Workflow Routes ---

describe('workflow routes', () => {
  test('POST /api/workflows creates a workflow', async () => {
    const res = await req('POST', '/api/workflows', {
      name: 'Test Workflow',
      source_type: 'prompt',
      source_content: 'Build something',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string; name: string; status: string } };
    expect(body.data.name).toBe('Test Workflow');
    expect(body.data.status).toBe('planning');
    expect(body.data.id).toMatch(/^wf_/);
  });

  test('GET /api/workflows lists workflows', async () => {
    workflowService.create(db, { name: 'WF1', source_type: 'prompt' });
    workflowService.create(db, { name: 'WF2', source_type: 'prompt' });

    const res = await req('GET', '/api/workflows');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ name: string }>; meta: { total: number } };
    expect(body.data).toHaveLength(2);
    expect(body.meta.total).toBe(2);
  });

  test('GET /api/workflows/:id returns workflow with tasks', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    const res = await req('GET', `/api/workflows/${wf.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; tasks: unknown[] } };
    expect(body.data.id).toBe(wf.id);
    expect(body.data.tasks).toEqual([]);
  });

  test('GET /api/workflows/:id returns 404 for missing workflow', async () => {
    const res = await req('GET', '/api/workflows/wf_nonexistent');
    expect(res.status).toBe(404);
  });

  test('PUT /api/workflows/:id/status updates workflow status', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'Task1' }] });

    const res = await req('PUT', `/api/workflows/${wf.id}/status`, { status: 'in_progress' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe('in_progress');
  });

  test('PUT /api/workflows/:id/status returns 400 for invalid transition', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    const res = await req('PUT', `/api/workflows/${wf.id}/status`, { status: 'completed' });
    expect(res.status).toBe(400);
  });

  test('PUT /api/workflows/:id/plan sets workflow plan', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    const res = await req('PUT', `/api/workflows/${wf.id}/plan`, {
      summary: 'Plan summary',
      tasks: [{ name: 'Task A' }, { name: 'Task B', depends_on: ['Task A'] }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { tasks_created: number; status: string } };
    expect(body.data.tasks_created).toBe(2);
    expect(body.data.status).toBe('ready');
  });
});

// --- Task Routes ---

describe('task routes', () => {
  function createWorkflowWithTasks() {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    workflowService.setPlan(db, wf.id, {
      summary: 'Test',
      tasks: [{ name: 'Task 1' }, { name: 'Task 2', depends_on: ['Task 1'] }],
    });
    return wf;
  }

  test('GET /api/workflows/:id/tasks lists tasks', async () => {
    const wf = createWorkflowWithTasks();
    const res = await req('GET', `/api/workflows/${wf.id}/tasks`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ name: string }> };
    expect(body.data).toHaveLength(2);
  });

  test('GET /api/tasks/:id returns task', async () => {
    const wf = createWorkflowWithTasks();
    const tasks = db.prepare('SELECT id FROM tasks WHERE workflow_id = ?').all(wf.id) as Array<{
      id: string;
    }>;
    const res = await req('GET', `/api/tasks/${tasks[0].id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; name: string } };
    expect(body.data.id).toBe(tasks[0].id);
  });

  test('PUT /api/tasks/:id/status updates task status', async () => {
    const wf = createWorkflowWithTasks();
    const tasks = db
      .prepare('SELECT id FROM tasks WHERE workflow_id = ? ORDER BY sequence')
      .all(wf.id) as Array<{
      id: string;
    }>;
    // Move first task through planning -> in_progress -> completed
    await req('PUT', `/api/tasks/${tasks[0].id}/status`, { status: 'planning' });
    await req('PUT', `/api/tasks/${tasks[0].id}/status`, { status: 'in_progress' });
    const res = await req('PUT', `/api/tasks/${tasks[0].id}/status`, {
      status: 'completed',
      outcome: 'Done',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe('completed');
  });

  test('POST /api/tasks/:id/claim claims a task', async () => {
    const wf = createWorkflowWithTasks();
    const agent = agentService.register(db, {
      name: 'Agent 1',
      runtime: 'claude',
      workflow_id: wf.id,
    });
    const tasks = db
      .prepare('SELECT id FROM tasks WHERE workflow_id = ? ORDER BY sequence')
      .all(wf.id) as Array<{
      id: string;
    }>;

    const res = await req('POST', `/api/tasks/${tasks[0].id}/claim`, { agent_id: agent.id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { success: boolean } };
    expect(body.data.success).toBe(true);
  });

  test('GET /api/tasks/:id/dependencies returns deps', async () => {
    const wf = createWorkflowWithTasks();
    const tasks = db
      .prepare('SELECT id FROM tasks WHERE workflow_id = ? ORDER BY sequence')
      .all(wf.id) as Array<{
      id: string;
    }>;
    const res = await req('GET', `/api/tasks/${tasks[1].id}/dependencies`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { dependencies: unknown[]; dependents: unknown[] } };
    expect(body.data.dependencies).toHaveLength(1);
  });
});

// --- Orchestration Routes ---

describe('orchestration routes', () => {
  test('GET /api/workflows/:id/progress returns progress', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    workflowService.setPlan(db, wf.id, {
      summary: 'Plan',
      tasks: [{ name: 'T1' }, { name: 'T2' }],
    });

    const res = await req('GET', `/api/workflows/${wf.id}/progress`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { total_tasks: number } };
    expect(body.data.total_tasks).toBe(2);
  });

  test('GET /api/workflows/:id/next-tasks returns available tasks', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    workflowService.setPlan(db, wf.id, {
      summary: 'Plan',
      tasks: [{ name: 'T1' }, { name: 'T2', depends_on: ['T1'] }],
    });

    const res = await req('GET', `/api/workflows/${wf.id}/next-tasks`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { tasks: Array<{ name: string }>; all_complete: boolean };
    };
    expect(body.data.tasks).toHaveLength(1);
    expect(body.data.tasks[0].name).toBe('T1');
    expect(body.data.all_complete).toBe(false);
  });

  test('GET /api/tasks/:id/check-dependencies returns dependency status', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    workflowService.setPlan(db, wf.id, {
      summary: 'Plan',
      tasks: [{ name: 'T1' }, { name: 'T2', depends_on: ['T1'] }],
    });
    const tasks = db
      .prepare('SELECT id FROM tasks WHERE workflow_id = ? ORDER BY sequence')
      .all(wf.id) as Array<{
      id: string;
    }>;

    const res = await req('GET', `/api/tasks/${tasks[1].id}/check-dependencies`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { satisfied: boolean; pending: unknown[] } };
    expect(body.data.satisfied).toBe(false);
    expect(body.data.pending).toHaveLength(1);
  });
});

// --- Agent Routes ---

describe('agent routes', () => {
  test('POST /api/agents registers an agent', async () => {
    const res = await req('POST', '/api/agents', { name: 'Agent1', runtime: 'claude' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string; name: string; status: string } };
    expect(body.data.name).toBe('Agent1');
    expect(body.data.status).toBe('online');
  });

  test('GET /api/agents lists agents', async () => {
    agentService.register(db, { name: 'A1', runtime: 'claude' });
    agentService.register(db, { name: 'A2', runtime: 'claude' });

    const res = await req('GET', '/api/agents');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ name: string }> };
    expect(body.data).toHaveLength(2);
  });

  test('GET /api/agents/:id returns agent', async () => {
    const agent = agentService.register(db, { name: 'A1', runtime: 'claude' });
    const res = await req('GET', `/api/agents/${agent.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string } };
    expect(body.data.id).toBe(agent.id);
  });

  test('PUT /api/agents/:id/heartbeat updates heartbeat', async () => {
    const agent = agentService.register(db, { name: 'A1', runtime: 'claude' });
    const res = await req('PUT', `/api/agents/${agent.id}/heartbeat`, {});
    expect(res.status).toBe(200);
  });

  test('DELETE /api/agents/:id unregisters agent', async () => {
    const agent = agentService.register(db, { name: 'A1', runtime: 'claude' });
    const res = await req('DELETE', `/api/agents/${agent.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { success: boolean } };
    expect(body.data.success).toBe(true);
  });
});

// --- Message Routes ---

describe('message routes', () => {
  test('POST /api/messages sends a message', async () => {
    const sender = agentService.register(db, { name: 'Sender', runtime: 'claude' });
    const recipient = agentService.register(db, { name: 'Recipient', runtime: 'claude' });

    const res = await req('POST', '/api/messages', {
      sender_id: sender.id,
      recipient_id: recipient.id,
      message_type: 'query',
      body: 'Hello!',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string; thread_id: string } };
    expect(body.data.id).toMatch(/^msg_/);
  });

  test('GET /api/agents/:id/messages lists messages', async () => {
    const sender = agentService.register(db, { name: 'Sender', runtime: 'claude' });
    const recipient = agentService.register(db, { name: 'Recipient', runtime: 'claude' });
    messageService_send(db, sender.id, recipient.id, 'Hello!');

    const res = await req('GET', `/api/agents/${recipient.id}/messages`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  test('GET /api/messages lists all messages', async () => {
    const a1 = agentService.register(db, { name: 'A1', runtime: 'claude' });
    const a2 = agentService.register(db, { name: 'A2', runtime: 'claude' });
    messageService_send(db, a1.id, a2.id, 'Msg 1');

    const res = await req('GET', '/api/messages');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  test('PUT /api/messages/mark-read marks messages as read', async () => {
    const a1 = agentService.register(db, { name: 'A1', runtime: 'claude' });
    const a2 = agentService.register(db, { name: 'A2', runtime: 'claude' });
    const { id } = messageService_send(db, a1.id, a2.id, 'Msg');

    const res = await req('PUT', '/api/messages/mark-read', { message_ids: [id] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { updated: number } };
    expect(body.data.updated).toBe(1);
  });
});

// --- Workspace Routes ---

describe('workspace routes', () => {
  test('POST /api/workflows/:id/workspaces creates workspace', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    const res = await req('POST', `/api/workflows/${wf.id}/workspaces`, {
      path: '/tmp/ws',
      branch: 'feature/test',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string; branch: string } };
    expect(body.data.branch).toBe('feature/test');
  });

  test('GET /api/workflows/:id/workspaces lists workspaces', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    const res = await req('GET', `/api/workflows/${wf.id}/workspaces`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });
});

// --- Template Routes ---

describe('template routes', () => {
  test('POST /api/templates creates template', async () => {
    const res = await req('POST', '/api/templates', {
      name: 'My Template',
      description: 'A test template',
      template: { tasks: [{ name: 'T1' }] },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string; name: string } };
    expect(body.data.name).toBe('My Template');
  });

  test('GET /api/templates lists templates', async () => {
    await req('POST', '/api/templates', {
      name: 'Tmpl1',
      template: { tasks: [{ name: 'T1' }] },
    });
    const res = await req('GET', '/api/templates');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ name: string }> };
    expect(body.data).toHaveLength(1);
  });

  test('POST /api/templates/:id/apply creates workflow from template', async () => {
    const tmplRes = await req('POST', '/api/templates', {
      name: 'Tmpl',
      template: { tasks: [{ name: 'T1' }] },
    });
    const tmpl = (await tmplRes.json()) as { data: { id: string } };

    const res = await req('POST', `/api/templates/${tmpl.data.id}/apply`, {
      workflow_name: 'From Template',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { workflow_id: string } };
    expect(body.data.workflow_id).toMatch(/^wf_/);
  });
});

// --- Lock Routes ---

describe('lock routes', () => {
  test('GET /api/workflows/:id/lock returns lock info', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    const res = await req('GET', `/api/workflows/${wf.id}/lock`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { locked: boolean } };
    expect(body.data.locked).toBe(false);
  });

  test('POST /api/workflows/:id/lock acquires lock', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    const session = sessionService.register(db, { pid: process.pid, is_daemon: false });

    const res = await req('POST', `/api/workflows/${wf.id}/lock`, { session_id: session.id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { success: boolean } };
    expect(body.data.success).toBe(true);
  });
});

// --- Checkpoint Routes ---

describe('checkpoint routes', () => {
  test('POST /api/tasks/:id/checkpoints adds checkpoint', async () => {
    const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
    workflowService.setPlan(db, wf.id, { summary: 'Plan', tasks: [{ name: 'T1' }] });
    const tasks = db.prepare('SELECT id FROM tasks WHERE workflow_id = ?').all(wf.id) as Array<{
      id: string;
    }>;

    const res = await req('POST', `/api/tasks/${tasks[0].id}/checkpoints`, {
      type: 'progress',
      summary: 'Made progress',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string; sequence: number } };
    expect(body.data.sequence).toBe(1);
  });
});

// --- CORS ---

describe('CORS', () => {
  test('OPTIONS returns preflight headers', async () => {
    const request = new Request('http://localhost/api/workflows', { method: 'OPTIONS' });
    const res = await api.handle(request);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  test('responses include CORS headers', async () => {
    const res = await req('GET', '/api/workflows');
    expect(res.status).toBe(200);
    // The response from handle() should have CORS headers
    const request = new Request('http://localhost/api/workflows');
    const rawRes = await api.handle(request);
    expect(rawRes.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

// --- 404 ---

describe('routing', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await req('GET', '/api/nonexistent');
    expect(res.status).toBe(404);
  });
});

// Helper to send a message (avoids importing messageService directly)
import { messageService } from '@caw/core';

function messageService_send(d: DatabaseType, senderId: string, recipientId: string, body: string) {
  return messageService.send(d, {
    sender_id: senderId,
    recipient_id: recipientId,
    message_type: 'query',
    body,
  });
}
