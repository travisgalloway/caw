export const sql = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  repository_id TEXT,
  topic TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'learning',
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  reinforcement_count INTEGER NOT NULL DEFAULT 1,
  last_reinforced_at INTEGER NOT NULL,
  decay_rate REAL NOT NULL DEFAULT 0.05,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_topic ON memories(topic);
CREATE INDEX IF NOT EXISTS idx_memories_repository_id ON memories(repository_id);
CREATE INDEX IF NOT EXISTS idx_memories_memory_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_confidence ON memories(confidence DESC);
`;
