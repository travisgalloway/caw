import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '../db/connection';
import { runMigrations } from '../db/migrations';
import * as memoryService from './memory.service';

let db: DatabaseType;

beforeEach(() => {
  db = new Database(':memory:');
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe('memoryService', () => {
  describe('create', () => {
    it('creates a new memory', () => {
      const memory = memoryService.create(db, {
        topic: 'testing',
        content: 'Always run bun install after checkout',
        memory_type: 'learning',
      });

      expect(memory.id).toMatch(/^mem_/);
      expect(memory.topic).toBe('testing');
      expect(memory.content).toBe('Always run bun install after checkout');
      expect(memory.memory_type).toBe('learning');
      expect(memory.confidence).toBe(1.0);
      expect(memory.reinforcement_count).toBe(1);
    });

    it('deduplicates by reinforcing existing memory', () => {
      const first = memoryService.create(db, {
        topic: 'testing',
        content: 'Same content',
      });

      const second = memoryService.create(db, {
        topic: 'testing',
        content: 'Same content',
      });

      // Should be the same memory, reinforced
      expect(second.id).toBe(first.id);
      expect(second.reinforcement_count).toBe(2);
    });

    it('sets default memory_type to learning', () => {
      const memory = memoryService.create(db, {
        topic: 'test',
        content: 'content',
      });
      expect(memory.memory_type).toBe('learning');
    });

    it('stores metadata as JSON', () => {
      const memory = memoryService.create(db, {
        topic: 'test',
        content: 'content',
        metadata: { source: 'workflow_123' },
      });

      const stored = memoryService.get(db, memory.id);
      expect(stored?.metadata).toBeDefined();
      const parsed = JSON.parse(stored?.metadata ?? '{}');
      expect(parsed.source).toBe('workflow_123');
    });
  });

  describe('reinforce', () => {
    it('increases confidence and count', () => {
      const memory = memoryService.create(db, {
        topic: 'test',
        content: 'content',
        confidence: 0.5,
      });

      const reinforced = memoryService.reinforce(db, memory.id);
      expect(reinforced.reinforcement_count).toBe(2);
      expect(reinforced.confidence).toBeGreaterThan(0.5);
    });

    it('caps confidence at 1.0', () => {
      const memory = memoryService.create(db, {
        topic: 'test',
        content: 'content',
        confidence: 0.99,
      });

      const reinforced = memoryService.reinforce(db, memory.id);
      expect(reinforced.confidence).toBeLessThanOrEqual(1.0);
    });

    it('throws for non-existent memory', () => {
      expect(() => memoryService.reinforce(db, 'mem_nonexistent')).toThrow('Memory not found');
    });
  });

  describe('get', () => {
    it('returns null for non-existent memory', () => {
      expect(memoryService.get(db, 'mem_nonexistent')).toBeNull();
    });

    it('returns memory with decay applied', () => {
      const memory = memoryService.create(db, {
        topic: 'test',
        content: 'content',
      });

      const retrieved = memoryService.get(db, memory.id);
      expect(retrieved).not.toBeNull();
      // Just created, so confidence should be very close to 1.0
      expect(retrieved?.confidence).toBeGreaterThan(0.99);
    });
  });

  describe('recall', () => {
    it('returns memories by topic', () => {
      memoryService.create(db, { topic: 'testing', content: 'memory 1' });
      memoryService.create(db, { topic: 'testing', content: 'memory 2' });
      memoryService.create(db, { topic: 'deployment', content: 'memory 3' });

      const result = memoryService.recall(db, { topic: 'testing' });
      expect(result.memories).toHaveLength(2);
    });

    it('filters by memory_type', () => {
      memoryService.create(db, { topic: 'test', content: 'a', memory_type: 'pattern' });
      memoryService.create(db, { topic: 'test', content: 'b', memory_type: 'pitfall' });

      const result = memoryService.recall(db, { memory_type: 'pattern' });
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].memory_type).toBe('pattern');
    });

    it('includes global memories when filtering by repository', () => {
      memoryService.create(db, { topic: 'test', content: 'global' });
      memoryService.create(db, {
        topic: 'test',
        content: 'repo-specific',
        repository_id: 'rp_123',
      });
      memoryService.create(db, { topic: 'test', content: 'other-repo', repository_id: 'rp_456' });

      const result = memoryService.recall(db, { repository_id: 'rp_123' });
      expect(result.memories).toHaveLength(2); // global + repo-specific
    });

    it('sorts by confidence descending', () => {
      memoryService.create(db, { topic: 'test', content: 'low', confidence: 0.3 });
      memoryService.create(db, { topic: 'test', content: 'high', confidence: 0.9 });
      memoryService.create(db, { topic: 'test', content: 'mid', confidence: 0.6 });

      const result = memoryService.recall(db, { topic: 'test' });
      expect(result.memories[0].content).toBe('high');
    });

    it('respects limit', () => {
      for (let i = 0; i < 10; i++) {
        memoryService.create(db, { topic: 'test', content: `memory ${i}` });
      }

      const result = memoryService.recall(db, { topic: 'test', limit: 3 });
      expect(result.memories).toHaveLength(3);
    });
  });

  describe('remove', () => {
    it('deletes a memory', () => {
      const memory = memoryService.create(db, { topic: 'test', content: 'to delete' });
      const removed = memoryService.remove(db, memory.id);
      expect(removed).toBe(true);
      expect(memoryService.get(db, memory.id)).toBeNull();
    });

    it('returns false for non-existent memory', () => {
      expect(memoryService.remove(db, 'mem_nonexistent')).toBe(false);
    });
  });

  describe('prune', () => {
    it('removes memories below threshold', () => {
      // Create a memory with very low confidence
      memoryService.create(db, { topic: 'test', content: 'low', confidence: 0.05 });
      memoryService.create(db, { topic: 'test', content: 'high', confidence: 0.9 });

      const pruned = memoryService.prune(db, 0.1);
      expect(pruned).toBe(1);

      const remaining = memoryService.recall(db, { topic: 'test', min_confidence: 0 });
      expect(remaining.memories).toHaveLength(1);
      expect(remaining.memories[0].content).toBe('high');
    });
  });
});
