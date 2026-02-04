import type { DatabaseType, SQLParam } from '../db/connection';
import type { Checkpoint, CheckpointType } from '../types/checkpoint';
import { checkpointId } from '../utils/id';

// --- Parameter / Result types ---

export interface AddParams {
  type: CheckpointType;
  summary: string;
  detail?: Record<string, unknown>;
  filesChanged?: string[];
}

export interface AddResult {
  id: string;
  sequence: number;
}

export interface ListFilters {
  types?: CheckpointType[];
  since_sequence?: number;
  limit?: number;
}

// --- Service functions ---

export function add(db: DatabaseType, taskId: string, params: AddParams): AddResult {
  const run = db.transaction(() => {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const row = db
      .prepare('SELECT MAX(sequence) as max_seq FROM checkpoints WHERE task_id = ?')
      .get(taskId) as { max_seq: number | null };

    const sequence = (row.max_seq ?? 0) + 1;
    const id = checkpointId();
    const now = Date.now();
    const detailJson = params.detail ? JSON.stringify(params.detail) : null;
    const filesJson = params.filesChanged ? JSON.stringify(params.filesChanged) : null;

    db.prepare(
      `INSERT INTO checkpoints (id, task_id, sequence, checkpoint_type, summary, detail, files_changed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, taskId, sequence, params.type, params.summary, detailJson, filesJson, now);

    return { id, sequence };
  });

  return run();
}

export function list(db: DatabaseType, taskId: string, filters?: ListFilters): Checkpoint[] {
  const conditions: string[] = ['task_id = ?'];
  const params: SQLParam[] = [taskId];

  if (filters?.types && filters.types.length > 0) {
    conditions.push(`checkpoint_type IN (${filters.types.map(() => '?').join(', ')})`);
    params.push(...filters.types);
  }

  if (filters?.since_sequence != null) {
    conditions.push('sequence > ?');
    params.push(filters.since_sequence);
  }

  const where = conditions.join(' AND ');
  let sql = `SELECT * FROM checkpoints WHERE ${where} ORDER BY sequence ASC`;

  if (filters?.limit != null) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  return db.prepare(sql).all(...params) as Checkpoint[];
}
