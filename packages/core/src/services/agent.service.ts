import type { DatabaseType } from '../db/connection';
import type { Agent, AgentRole, AgentStatus } from '../types/agent';
import { agentId } from '../utils/id';

// --- Parameter / Result types ---

export interface RegisterParams {
  name: string;
  runtime: string;
  role?: AgentRole;
  capabilities?: string[];
  workspace_path?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateParams {
  status?: AgentStatus;
  current_task_id?: string | null;
  workspace_path?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface ListFilters {
  status?: AgentStatus | AgentStatus[];
  role?: AgentRole;
  runtime?: string;
}

export interface UnregisterResult {
  success: boolean;
  tasks_released: number;
}

// --- Service functions ---

export function register(db: DatabaseType, params: RegisterParams): Agent {
  const id = agentId();
  const now = Date.now();
  const role = params.role ?? 'worker';
  const capabilities = params.capabilities ? JSON.stringify(params.capabilities) : null;
  const metadata = params.metadata ? JSON.stringify(params.metadata) : null;
  const workspacePath = params.workspace_path ?? null;

  db.prepare(
    `INSERT INTO agents (id, name, runtime, role, status, capabilities, workspace_path, last_heartbeat, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'online', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.name,
    params.runtime,
    role,
    capabilities,
    workspacePath,
    now,
    metadata,
    now,
    now,
  );

  return {
    id,
    name: params.name,
    runtime: params.runtime,
    role,
    status: 'online',
    capabilities,
    current_task_id: null,
    workspace_path: workspacePath,
    last_heartbeat: now,
    metadata,
    created_at: now,
    updated_at: now,
  };
}

export function heartbeat(
  db: DatabaseType,
  id: string,
  currentTaskId?: string,
  status?: AgentStatus,
): Agent {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined;

  if (!agent) {
    throw new Error(`Agent not found: ${id}`);
  }

  if (agent.status === 'offline') {
    throw new Error(`Cannot heartbeat offline agent: ${id}`);
  }

  const now = Date.now();
  const sets: string[] = ['last_heartbeat = ?', 'updated_at = ?'];
  const values: unknown[] = [now, now];

  if (currentTaskId !== undefined) {
    sets.push('current_task_id = ?');
    values.push(currentTaskId);
  }

  if (status !== undefined) {
    sets.push('status = ?');
    values.push(status);
  }

  values.push(id);
  db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return {
    ...agent,
    last_heartbeat: now,
    updated_at: now,
    ...(currentTaskId !== undefined ? { current_task_id: currentTaskId } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}

export function update(db: DatabaseType, id: string, fields: UpdateParams): Agent {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined;

  if (!agent) {
    throw new Error(`Agent not found: ${id}`);
  }

  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];
  const updated: Partial<Agent> = { updated_at: now };

  if (fields.status !== undefined) {
    sets.push('status = ?');
    values.push(fields.status);
    updated.status = fields.status;
  }

  if (fields.current_task_id !== undefined) {
    sets.push('current_task_id = ?');
    values.push(fields.current_task_id);
    updated.current_task_id = fields.current_task_id;
  }

  if (fields.workspace_path !== undefined) {
    sets.push('workspace_path = ?');
    values.push(fields.workspace_path);
    updated.workspace_path = fields.workspace_path;
  }

  if (fields.capabilities !== undefined) {
    const json = JSON.stringify(fields.capabilities);
    sets.push('capabilities = ?');
    values.push(json);
    updated.capabilities = json;
  }

  if (fields.metadata !== undefined) {
    const existing = agent.metadata ? JSON.parse(agent.metadata) : {};
    const merged = { ...existing, ...fields.metadata };
    const json = JSON.stringify(merged);
    sets.push('metadata = ?');
    values.push(json);
    updated.metadata = json;
  }

  values.push(id);
  db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return { ...agent, ...updated };
}

export function get(db: DatabaseType, id: string): Agent | null {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined;
  return row ?? null;
}

export function list(db: DatabaseType, filters?: ListFilters): Agent[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status !== undefined) {
    if (Array.isArray(filters.status)) {
      if (filters.status.length === 0) {
        return [];
      }
      const placeholders = filters.status.map(() => '?').join(', ');
      conditions.push(`status IN (${placeholders})`);
      params.push(...filters.status);
    } else {
      conditions.push('status = ?');
      params.push(filters.status);
    }
  }

  if (filters?.role !== undefined) {
    conditions.push('role = ?');
    params.push(filters.role);
  }

  if (filters?.runtime !== undefined) {
    conditions.push('runtime = ?');
    params.push(filters.runtime);
  }

  let sql = 'SELECT * FROM agents';
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY created_at ASC';

  return db.prepare(sql).all(...params) as Agent[];
}

export function unregister(db: DatabaseType, id: string): UnregisterResult {
  const run = db.transaction(() => {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined;

    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    // Count and release non-terminal tasks claimed by this agent
    const terminalStatuses = ['completed', 'skipped', 'failed'];
    const placeholders = terminalStatuses.map(() => '?').join(', ');

    const { count } = db
      .prepare(
        `SELECT COUNT(*) as count FROM tasks
         WHERE assigned_agent_id = ? AND status NOT IN (${placeholders})`,
      )
      .get(id, ...terminalStatuses) as { count: number };

    if (count > 0) {
      const now = Date.now();
      db.prepare(
        `UPDATE tasks SET assigned_agent_id = NULL, claimed_at = NULL, updated_at = ?
         WHERE assigned_agent_id = ? AND status NOT IN (${placeholders})`,
      ).run(now, id, ...terminalStatuses);
    }

    const now = Date.now();
    db.prepare(
      'UPDATE agents SET status = ?, current_task_id = NULL, updated_at = ? WHERE id = ?',
    ).run('offline', now, id);

    return { success: true, tasks_released: count };
  });

  return run();
}

export function getStale(db: DatabaseType, timeoutMs: number): Agent[] {
  const cutoff = Date.now() - timeoutMs;
  return db
    .prepare(
      `SELECT * FROM agents
       WHERE status != 'offline' AND last_heartbeat < ?
       ORDER BY last_heartbeat ASC`,
    )
    .all(cutoff) as Agent[];
}
