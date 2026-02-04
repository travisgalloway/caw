import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { Task } from '../types/task';
import * as agentService from './agent.service';
import * as workflowService from './workflow.service';

function createTask(db: DatabaseType): string {
  const wf = workflowService.create(db, { name: 'WF', source_type: 'issue' });
  workflowService.setPlan(db, wf.id, {
    summary: 'Plan',
    tasks: [{ name: 'Task' }],
  });
  const tasks = db.prepare('SELECT * FROM tasks WHERE workflow_id = ?').all(wf.id) as Task[];
  return tasks[0].id;
}

describe('agentService', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- register ---

  describe('register', () => {
    it('creates an agent with defaults', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      expect(agent.id).toMatch(/^ag_[0-9a-z]{12}$/);
      expect(agent.name).toBe('worker-1');
      expect(agent.runtime).toBe('claude_code');
      expect(agent.role).toBe('worker');
      expect(agent.status).toBe('online');
      expect(agent.capabilities).toBeNull();
      expect(agent.current_task_id).toBeNull();
      expect(agent.workspace_path).toBeNull();
      expect(agent.last_heartbeat).toBeGreaterThan(0);
      expect(agent.metadata).toBeNull();
    });

    it('uses custom role', () => {
      const agent = agentService.register(db, {
        name: 'orchestrator',
        runtime: 'claude_code',
        role: 'coordinator',
      });

      expect(agent.role).toBe('coordinator');
    });

    it('serializes capabilities as JSON', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
        capabilities: ['code', 'test', 'review'],
      });

      expect(agent.capabilities).toBe(JSON.stringify(['code', 'test', 'review']));

      const parsed = JSON.parse(agent.capabilities as string);
      expect(parsed).toEqual(['code', 'test', 'review']);
    });

    it('serializes metadata as JSON', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
        metadata: { version: '1.0', model: 'opus' },
      });

      const parsed = JSON.parse(agent.metadata as string);
      expect(parsed).toEqual({ version: '1.0', model: 'opus' });
    });

    it('stores workspace_path', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
        workspace_path: '/tmp/workspace',
      });

      expect(agent.workspace_path).toBe('/tmp/workspace');
    });

    it('persists to database', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const fetched = agentService.get(db, agent.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe('worker-1');
    });
  });

  // --- heartbeat ---

  describe('heartbeat', () => {
    it('updates last_heartbeat timestamp', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const originalHeartbeat = agent.last_heartbeat as number;
      const updated = agentService.heartbeat(db, agent.id);
      expect(updated.last_heartbeat).toBeGreaterThanOrEqual(originalHeartbeat);
    });

    it('optionally updates current_task_id', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });
      const taskId = createTask(db);

      const updated = agentService.heartbeat(db, agent.id, taskId);
      expect(updated.current_task_id).toBe(taskId);
    });

    it('optionally updates status', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const updated = agentService.heartbeat(db, agent.id, undefined, 'busy');
      expect(updated.status).toBe('busy');
    });

    it('throws when agent not found', () => {
      expect(() => agentService.heartbeat(db, 'ag_nonexistent')).toThrow('Agent not found');
    });

    it('throws when agent is offline', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });
      agentService.unregister(db, agent.id);

      expect(() => agentService.heartbeat(db, agent.id)).toThrow('Cannot heartbeat offline agent');
    });

    it('persists heartbeat to database', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });
      const taskId = createTask(db);

      agentService.heartbeat(db, agent.id, taskId, 'busy');

      const fetched = agentService.get(db, agent.id);
      expect(fetched?.current_task_id).toBe(taskId);
      expect(fetched?.status).toBe('busy');
    });
  });

  // --- update ---

  describe('update', () => {
    it('updates status', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const updated = agentService.update(db, agent.id, { status: 'busy' });
      expect(updated.status).toBe('busy');
    });

    it('updates current_task_id', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });
      const taskId = createTask(db);

      const updated = agentService.update(db, agent.id, { current_task_id: taskId });
      expect(updated.current_task_id).toBe(taskId);
    });

    it('clears current_task_id with null', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });
      const taskId = createTask(db);

      agentService.update(db, agent.id, { current_task_id: taskId });
      const updated = agentService.update(db, agent.id, { current_task_id: null });
      expect(updated.current_task_id).toBeNull();
    });

    it('updates workspace_path', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const updated = agentService.update(db, agent.id, { workspace_path: '/new/path' });
      expect(updated.workspace_path).toBe('/new/path');
    });

    it('updates capabilities', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const updated = agentService.update(db, agent.id, { capabilities: ['code', 'test'] });
      expect(JSON.parse(updated.capabilities as string)).toEqual(['code', 'test']);
    });

    it('merges metadata with existing', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
        metadata: { key1: 'value1' },
      });

      const updated = agentService.update(db, agent.id, { metadata: { key2: 'value2' } });
      const parsed = JSON.parse(updated.metadata as string);
      expect(parsed.key1).toBe('value1');
      expect(parsed.key2).toBe('value2');
    });

    it('overwrites existing metadata keys', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
        metadata: { key1: 'old' },
      });

      const updated = agentService.update(db, agent.id, { metadata: { key1: 'new' } });
      const parsed = JSON.parse(updated.metadata as string);
      expect(parsed.key1).toBe('new');
    });

    it('merges metadata when no existing metadata', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const updated = agentService.update(db, agent.id, { metadata: { key1: 'value1' } });
      const parsed = JSON.parse(updated.metadata as string);
      expect(parsed.key1).toBe('value1');
    });

    it('throws when agent not found', () => {
      expect(() => agentService.update(db, 'ag_nonexistent', { status: 'busy' })).toThrow(
        'Agent not found',
      );
    });

    it('updates the updated_at timestamp', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const updated = agentService.update(db, agent.id, { status: 'busy' });
      expect(updated.updated_at).toBeGreaterThanOrEqual(agent.updated_at);
    });
  });

  // --- get ---

  describe('get', () => {
    it('returns agent when found', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const result = agentService.get(db, agent.id);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('worker-1');
    });

    it('returns null when not found', () => {
      const result = agentService.get(db, 'ag_nonexistent');
      expect(result).toBeNull();
    });
  });

  // --- list ---

  describe('list', () => {
    it('returns all agents when no filters', () => {
      agentService.register(db, { name: 'a', runtime: 'claude_code' });
      agentService.register(db, { name: 'b', runtime: 'codex' });

      const agents = agentService.list(db);
      expect(agents).toHaveLength(2);
    });

    it('filters by single status', () => {
      agentService.register(db, { name: 'a', runtime: 'claude_code' });
      const b = agentService.register(db, { name: 'b', runtime: 'codex' });
      agentService.unregister(db, b.id);

      const online = agentService.list(db, { status: 'online' });
      expect(online).toHaveLength(1);
      expect(online[0].name).toBe('a');
    });

    it('filters by array of statuses', () => {
      agentService.register(db, { name: 'a', runtime: 'claude_code' });
      const b = agentService.register(db, { name: 'b', runtime: 'codex' });
      agentService.update(db, b.id, { status: 'busy' });

      const result = agentService.list(db, { status: ['online', 'busy'] });
      expect(result).toHaveLength(2);
    });

    it('filters by role', () => {
      agentService.register(db, { name: 'a', runtime: 'claude_code', role: 'coordinator' });
      agentService.register(db, { name: 'b', runtime: 'codex', role: 'worker' });

      const coordinators = agentService.list(db, { role: 'coordinator' });
      expect(coordinators).toHaveLength(1);
      expect(coordinators[0].name).toBe('a');
    });

    it('filters by runtime', () => {
      agentService.register(db, { name: 'a', runtime: 'claude_code' });
      agentService.register(db, { name: 'b', runtime: 'codex' });

      const codex = agentService.list(db, { runtime: 'codex' });
      expect(codex).toHaveLength(1);
      expect(codex[0].name).toBe('b');
    });

    it('returns empty array when status filter is empty array', () => {
      agentService.register(db, { name: 'a', runtime: 'claude_code' });

      const result = agentService.list(db, { status: [] });
      expect(result).toEqual([]);
    });

    it('combines filters', () => {
      agentService.register(db, { name: 'a', runtime: 'claude_code', role: 'worker' });
      agentService.register(db, { name: 'b', runtime: 'claude_code', role: 'coordinator' });
      agentService.register(db, { name: 'c', runtime: 'codex', role: 'worker' });

      const result = agentService.list(db, { runtime: 'claude_code', role: 'worker' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('a');
    });
  });

  // --- unregister ---

  describe('unregister', () => {
    it('sets agent status to offline', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      agentService.unregister(db, agent.id);

      const fetched = agentService.get(db, agent.id);
      expect(fetched?.status).toBe('offline');
      expect(fetched?.current_task_id).toBeNull();
    });

    it('releases claimed non-terminal tasks', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      // Create a workflow with tasks
      const wf = workflowService.create(db, { name: 'WF', source_type: 'issue' });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Task A' }, { name: 'Task B' }],
      });
      const tasks = db.prepare('SELECT * FROM tasks WHERE workflow_id = ?').all(wf.id) as {
        id: string;
      }[];

      // Claim both tasks via direct SQL (simulating task service)
      const now = Date.now();
      for (const task of tasks) {
        db.prepare(
          'UPDATE tasks SET assigned_agent_id = ?, claimed_at = ?, updated_at = ? WHERE id = ?',
        ).run(agent.id, now, now, task.id);
      }

      const result = agentService.unregister(db, agent.id);
      expect(result.success).toBe(true);
      expect(result.tasks_released).toBe(2);

      // Verify tasks are released
      for (const task of tasks) {
        const fetched = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) as {
          assigned_agent_id: string | null;
          claimed_at: number | null;
        };
        expect(fetched.assigned_agent_id).toBeNull();
        expect(fetched.claimed_at).toBeNull();
      }
    });

    it('returns correct count', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const result = agentService.unregister(db, agent.id);
      expect(result.success).toBe(true);
      expect(result.tasks_released).toBe(0);
    });

    it('skips terminal tasks', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const wf = workflowService.create(db, { name: 'WF', source_type: 'issue' });
      workflowService.setPlan(db, wf.id, {
        summary: 'Plan',
        tasks: [{ name: 'Done Task' }, { name: 'Active Task' }],
      });
      const tasks = db.prepare('SELECT * FROM tasks WHERE workflow_id = ?').all(wf.id) as {
        id: string;
      }[];

      const now = Date.now();
      // Assign both, but mark first as completed
      db.prepare(
        "UPDATE tasks SET assigned_agent_id = ?, claimed_at = ?, status = 'completed', updated_at = ? WHERE id = ?",
      ).run(agent.id, now, now, tasks[0].id);
      db.prepare(
        'UPDATE tasks SET assigned_agent_id = ?, claimed_at = ?, updated_at = ? WHERE id = ?',
      ).run(agent.id, now, now, tasks[1].id);

      const result = agentService.unregister(db, agent.id);
      expect(result.tasks_released).toBe(1);

      // Completed task should still be assigned
      const completed = db.prepare('SELECT * FROM tasks WHERE id = ?').get(tasks[0].id) as {
        assigned_agent_id: string | null;
      };
      expect(completed.assigned_agent_id).toBe(agent.id);
    });

    it('throws when agent not found', () => {
      expect(() => agentService.unregister(db, 'ag_nonexistent')).toThrow('Agent not found');
    });
  });

  // --- getStale ---

  describe('getStale', () => {
    it('returns agents with old heartbeats', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      // Set heartbeat to 10 minutes ago
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      db.prepare('UPDATE agents SET last_heartbeat = ? WHERE id = ?').run(tenMinutesAgo, agent.id);

      const stale = agentService.getStale(db, 5 * 60 * 1000); // 5 min timeout
      expect(stale).toHaveLength(1);
      expect(stale[0].id).toBe(agent.id);
    });

    it('excludes offline agents', () => {
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      // Set heartbeat to old time, then mark offline
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      db.prepare('UPDATE agents SET last_heartbeat = ?, status = ? WHERE id = ?').run(
        tenMinutesAgo,
        'offline',
        agent.id,
      );

      const stale = agentService.getStale(db, 5 * 60 * 1000);
      expect(stale).toHaveLength(0);
    });

    it('excludes fresh agents', () => {
      agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude_code',
      });

      const stale = agentService.getStale(db, 5 * 60 * 1000);
      expect(stale).toHaveLength(0);
    });

    it('returns multiple stale agents', () => {
      const a = agentService.register(db, { name: 'a', runtime: 'claude_code' });
      const b = agentService.register(db, { name: 'b', runtime: 'codex' });

      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      db.prepare('UPDATE agents SET last_heartbeat = ? WHERE id IN (?, ?)').run(
        tenMinutesAgo,
        a.id,
        b.id,
      );

      const stale = agentService.getStale(db, 5 * 60 * 1000);
      expect(stale).toHaveLength(2);
    });
  });
});
