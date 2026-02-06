export const sql = `
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  pid INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  last_heartbeat INTEGER NOT NULL,
  is_daemon INTEGER NOT NULL DEFAULT 0,
  metadata TEXT
);

CREATE INDEX idx_sessions_heartbeat ON sessions(last_heartbeat);
`;
