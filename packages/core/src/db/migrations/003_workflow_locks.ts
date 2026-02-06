export const sql = `
ALTER TABLE workflows ADD COLUMN locked_by_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE workflows ADD COLUMN locked_at INTEGER;
CREATE INDEX idx_workflows_locked_by ON workflows(locked_by_session_id);
`;
