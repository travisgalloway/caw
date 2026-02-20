import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { agentService, type DatabaseType, messageService, workflowService } from '@caw/core';
import { createRestApi } from '../api';
import { createTestDb } from '../test-utils';

describe('Stats Routes', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('GET /api/stats/summary', () => {
    it('returns summary statistics', async () => {
      // Create some test data
      const wf1 = workflowService.create(db, {
        name: 'Active Workflow',
        source_type: 'prompt',
        source_content: 'test',
      });
      workflowService.updateStatus(db, wf1.id, 'ready');
      workflowService.updateStatus(db, wf1.id, 'in_progress');

      const wf2 = workflowService.create(db, {
        name: 'Completed Workflow',
        source_type: 'prompt',
        source_content: 'test',
      });
      workflowService.updateStatus(db, wf2.id, 'ready');
      workflowService.updateStatus(db, wf2.id, 'in_progress');
      workflowService.updateStatus(db, wf2.id, 'completed');

      const agent1 = agentService.register(db, {
        name: 'Agent 1',
        runtime: 'test',
        role: 'worker',
      });

      const agent2 = agentService.register(db, {
        name: 'Agent 2',
        runtime: 'test',
        role: 'worker',
      });
      agentService.update(db, agent2.id, { status: 'offline' });

      const sender = agentService.register(db, {
        name: 'Sender',
        runtime: 'test',
        role: 'worker',
      });

      messageService.send(db, {
        sender_id: sender.id,
        recipient_id: agent1.id,
        message_type: 'query',
        body: 'Test message',
      });

      const api = createRestApi(db);
      const req = new Request('http://localhost/api/stats/summary');
      const res = await api.handle(req);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: unknown };

      expect(body.data).toEqual({
        activeWorkflows: 1,
        onlineAgents: 2, // agent1 and sender are online, agent2 is offline
        unreadMessages: 1,
        completedToday: 1,
      });
    });

    it('returns zero values when no data exists', async () => {
      const api = createRestApi(db);
      const req = new Request('http://localhost/api/stats/summary');
      const res = await api.handle(req);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: unknown };

      expect(body.data).toEqual({
        activeWorkflows: 0,
        onlineAgents: 0,
        unreadMessages: 0,
        completedToday: 0,
      });
    });

    it('only counts completed workflows from today', async () => {
      const wf = workflowService.create(db, {
        name: 'Old Workflow',
        source_type: 'prompt',
        source_content: 'test',
      });

      // Manually set the workflow to completed with an old timestamp
      const yesterday = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      db.prepare("UPDATE workflows SET status = 'completed', updated_at = ? WHERE id = ?").run(
        yesterday,
        wf.id,
      );

      const api = createRestApi(db);
      const req = new Request('http://localhost/api/stats/summary');
      const res = await api.handle(req);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { completedToday: number } };

      expect(body.data.completedToday).toBe(0); // Should not count workflows from yesterday
    });
  });
});
