/**
 * Returns a copy of process.env with Claude Code nesting detection
 * variables removed, so spawned `claude -p` processes don't refuse to start.
 */
export function cleanEnvForSpawn(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}
