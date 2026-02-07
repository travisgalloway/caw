export const sql = `
ALTER TABLE agents ADD COLUMN workflow_id TEXT REFERENCES workflows(id);
CREATE INDEX idx_agents_workflow_id ON agents(workflow_id);
`;
