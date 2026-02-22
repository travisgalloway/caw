import type { DatabaseType, SQLParam } from '../db/connection';
import type { Memory, MemoryType } from '../types/memory';
import { memoryId } from '../utils/id';

export interface CreateParams {
  topic: string;
  content: string;
  memory_type?: MemoryType;
  repository_id?: string;
  confidence?: number;
  decay_rate?: number;
  metadata?: Record<string, unknown>;
}

export interface ListFilters {
  topic?: string;
  memory_type?: MemoryType;
  repository_id?: string;
  min_confidence?: number;
  limit?: number;
}

export interface RecallResult {
  memories: Memory[];
  total: number;
}

/**
 * Default confidence decay rate per day.
 * At 0.05/day, a memory drops from 1.0 to ~0.5 after 14 days without reinforcement.
 */
const DEFAULT_DECAY_RATE = 0.05;

/**
 * Minimum confidence threshold — memories below this are pruned.
 */
const PRUNE_THRESHOLD = 0.1;

/**
 * Create a new memory.
 * If a memory with the same topic and content already exists, reinforce it instead.
 */
export function create(db: DatabaseType, params: CreateParams): Memory {
  // Check for existing memory with same topic and content
  const existing = db
    .prepare(
      'SELECT * FROM memories WHERE topic = ? AND content = ? AND (repository_id = ? OR (repository_id IS NULL AND ? IS NULL))',
    )
    .get(
      params.topic,
      params.content,
      params.repository_id ?? null,
      params.repository_id ?? null,
    ) as Memory | null;

  if (existing) {
    return reinforce(db, existing.id);
  }

  const now = Date.now();
  const id = memoryId();
  const memory: Memory = {
    id,
    repository_id: params.repository_id ?? null,
    topic: params.topic,
    memory_type: params.memory_type ?? 'learning',
    content: params.content,
    confidence: params.confidence ?? 1.0,
    reinforcement_count: 1,
    last_reinforced_at: now,
    decay_rate: params.decay_rate ?? DEFAULT_DECAY_RATE,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO memories (id, repository_id, topic, memory_type, content, confidence, reinforcement_count, last_reinforced_at, decay_rate, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    memory.id,
    memory.repository_id,
    memory.topic,
    memory.memory_type,
    memory.content,
    memory.confidence,
    memory.reinforcement_count,
    memory.last_reinforced_at,
    memory.decay_rate,
    memory.metadata,
    memory.created_at,
    memory.updated_at,
  );

  return memory;
}

/**
 * Reinforce an existing memory — increase confidence and count.
 */
export function reinforce(db: DatabaseType, id: string): Memory {
  const memory = get(db, id);
  if (!memory) {
    throw new Error(`Memory not found: ${id}`);
  }

  const now = Date.now();
  // Reinforcement boosts confidence back toward 1.0
  const newConfidence = Math.min(1.0, memory.confidence + (1.0 - memory.confidence) * 0.5);

  db.prepare(
    `UPDATE memories SET confidence = ?, reinforcement_count = reinforcement_count + 1, last_reinforced_at = ?, updated_at = ? WHERE id = ?`,
  ).run(newConfidence, now, now, id);

  return get(db, id) as Memory;
}

/**
 * Get a memory by ID (applies decay on read).
 */
export function get(db: DatabaseType, id: string): Memory | null {
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Memory | null;
  if (!row) return null;
  return applyDecay(row);
}

/**
 * Recall memories by topic, with confidence decay applied.
 * Returns memories sorted by confidence (highest first).
 */
export function recall(db: DatabaseType, filters?: ListFilters): RecallResult {
  const conditions: string[] = [];
  const params: SQLParam[] = [];

  if (filters?.topic) {
    conditions.push('topic = ?');
    params.push(filters.topic);
  }

  if (filters?.memory_type) {
    conditions.push('memory_type = ?');
    params.push(filters.memory_type);
  }

  if (filters?.repository_id) {
    // Include both repo-specific and global memories
    conditions.push('(repository_id = ? OR repository_id IS NULL)');
    params.push(filters.repository_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit ?? 50;

  params.push(limit);
  const rows = db
    .prepare(`SELECT * FROM memories ${where} ORDER BY confidence DESC LIMIT ?`)
    .all(...params) as Memory[];

  // Apply decay to each memory
  const memories = rows.map(applyDecay);

  // Filter by minimum confidence after decay
  const minConfidence = filters?.min_confidence ?? PRUNE_THRESHOLD;
  const filtered = memories.filter((m) => m.confidence >= minConfidence);

  return {
    memories: filtered,
    total: filtered.length,
  };
}

/**
 * Prune memories that have decayed below the threshold.
 * Returns the number of pruned memories.
 */
export function prune(db: DatabaseType, threshold?: number): number {
  const minConfidence = threshold ?? PRUNE_THRESHOLD;

  // Process in batches to avoid loading all memories at once.
  // Decay is computed in JS (SQLite lacks exp()), so we fetch batches
  // ordered by confidence ASC (lowest first — most likely to prune).
  const BATCH_SIZE = 500;
  const stmt = db.prepare('SELECT * FROM memories ORDER BY confidence ASC LIMIT ? OFFSET ?');
  const delStmt = db.prepare('DELETE FROM memories WHERE id = ?');

  let pruned = 0;
  let offset = 0;

  while (true) {
    const batch = stmt.all(BATCH_SIZE, offset) as Memory[];
    if (batch.length === 0) break;

    for (const memory of batch) {
      const decayed = applyDecay(memory);
      if (decayed.confidence < minConfidence) {
        delStmt.run(memory.id);
        pruned++;
      }
    }

    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return pruned;
}

/**
 * Delete a specific memory.
 */
export function remove(db: DatabaseType, id: string): boolean {
  const result = db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Apply time-based confidence decay to a memory.
 * Uses exponential decay: confidence = original * e^(-decay_rate * days_since_reinforcement)
 */
function applyDecay(memory: Memory): Memory {
  const now = Date.now();
  const daysSinceReinforcement = (now - memory.last_reinforced_at) / (24 * 60 * 60 * 1000);

  if (daysSinceReinforcement <= 0) return memory;

  const decayedConfidence =
    memory.confidence * Math.exp(-memory.decay_rate * daysSinceReinforcement);

  return {
    ...memory,
    confidence: Math.max(0, Math.min(1, decayedConfidence)),
  };
}
