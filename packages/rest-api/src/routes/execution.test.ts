import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { DatabaseType } from '@caw/core';
import { workflowService } from '@caw/core';
import { createRestApi, type RestApi } from '../api';
import { apiRequest, createTestDb } from '../test-utils';
import type { SpawnerProvider } from './execution';

let db: DatabaseType;
let api: RestApi;

function req(method: string, path: string, body?: unknown) {
  return apiRequest(api.handle, method, path, body);
}

describe('execution routes', () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('without spawner', () => {
    beforeEach(() => {
      api = createRestApi(db);
    });

    test('POST /api/workflows/:id/execute returns 500 without spawner', async () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const res = await req('POST', `/api/workflows/${wf.id}/execute`);
      expect(res.status).toBe(500);
    });

    test('GET /api/workflows/:id/execution-status returns unavailable without spawner', async () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const res = await req('GET', `/api/workflows/${wf.id}/execution-status`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { running: boolean; available: boolean } };
      expect(body.data.running).toBe(false);
      expect(body.data.available).toBe(false);
    });
  });

  describe('with mock spawner', () => {
    let mockSpawner: SpawnerProvider;

    beforeEach(() => {
      mockSpawner = {
        start: async () => {},
        suspend: async () => {},
        resume: async () => {},
        getStatus: () => ({ running: true, agentCount: 2 }),
      };
      api = createRestApi(db, undefined, { spawner: mockSpawner });
    });

    test('POST /api/workflows/:id/execute starts execution', async () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const res = await req('POST', `/api/workflows/${wf.id}/execute`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { action: string } };
      expect(body.data.action).toBe('started');
    });

    test('POST /api/workflows/:id/execute returns 404 for missing workflow', async () => {
      const res = await req('POST', '/api/workflows/wf_nonexistent/execute');
      expect(res.status).toBe(404);
    });

    test('POST /api/workflows/:id/suspend suspends execution', async () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const res = await req('POST', `/api/workflows/${wf.id}/suspend`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { action: string } };
      expect(body.data.action).toBe('suspended');
    });

    test('POST /api/workflows/:id/resume resumes execution', async () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const res = await req('POST', `/api/workflows/${wf.id}/resume`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { action: string } };
      expect(body.data.action).toBe('resumed');
    });

    test('GET /api/workflows/:id/execution-status returns status', async () => {
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const res = await req('GET', `/api/workflows/${wf.id}/execution-status`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { running: boolean; agentCount: number; available: boolean };
      };
      expect(body.data.running).toBe(true);
      expect(body.data.agentCount).toBe(2);
      expect(body.data.available).toBe(true);
    });

    test('POST /api/workflows/:id/execute handles spawner error', async () => {
      mockSpawner.start = async () => {
        throw new Error('Failed to start');
      };
      const wf = workflowService.create(db, { name: 'WF', source_type: 'prompt' });
      const res = await req('POST', `/api/workflows/${wf.id}/execute`);
      expect(res.status).toBe(400);
    });
  });
});
