/**
 * Seed script that creates a Q&A scenario:
 * - A workflow with a paused task
 * - A worker agent that asked a question
 * - A human pseudo-agent as the receiver
 * - An unread "query" message from worker → human
 *
 * Usage: bun scripts/seed-qa.ts
 */

import {
  agentService,
  checkpointService,
  createConnection,
  getDbPath,
  messageService,
  runMigrations,
  taskService,
  workflowService,
} from '../packages/core/src/index';

const dbPath = getDbPath('per-repo', process.cwd());
console.log(`Seeding Q&A scenario into: ${dbPath}`);

const db = createConnection(dbPath);
runMigrations(db);

// ─── 1. Workflow ───

const wf = workflowService.create(db, {
  name: 'Implement caching layer',
  source_type: 'prompt',
  source_content: 'Add Redis-based caching to the API endpoints for improved performance.',
  repository_paths: [process.cwd()],
  max_parallel_tasks: 2,
});

workflowService.setPlan(db, wf.id, {
  summary: 'Add caching: config, cache service, middleware, integration tests.',
  tasks: [
    {
      name: 'Setup Redis config',
      description: 'Add Redis connection configuration and environment variables.',
      estimated_complexity: 'low',
      files_likely_affected: ['src/config/redis.ts', '.env.example'],
    },
    {
      name: 'Build cache service',
      description: 'Create a cache service with get/set/invalidate methods wrapping Redis.',
      estimated_complexity: 'medium',
      files_likely_affected: ['src/services/cache.ts'],
      depends_on: ['Setup Redis config'],
    },
    {
      name: 'Add cache middleware',
      description: 'Express middleware that checks cache before hitting the handler.',
      estimated_complexity: 'medium',
      files_likely_affected: ['src/middleware/cache.ts'],
      depends_on: ['Build cache service'],
    },
  ],
});

// Transition to in_progress
workflowService.updateStatus(db, wf.id, 'in_progress');

// Get tasks
const tasks = db
  .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence')
  .all(wf.id) as Array<{ id: string; name: string }>;

const taskMap = new Map(tasks.map((t) => [t.name, t.id]));
const configTaskId = taskMap.get('Setup Redis config') ?? '';
const cacheTaskId = taskMap.get('Build cache service') ?? '';

// Complete first task
taskService.updateStatus(db, configTaskId, 'planning');
taskService.updateStatus(db, configTaskId, 'in_progress');
taskService.updateStatus(db, configTaskId, 'completed', {
  outcome: 'Added Redis config with REDIS_URL env var and connection helper.',
});

// ─── 2. Agents ───

// Worker agent assigned to cache service task
const worker = agentService.register(db, {
  name: 'spawner-Build cache service',
  runtime: 'claude_code',
  role: 'worker',
  workflow_id: wf.id,
  workspace_path: process.cwd(),
  metadata: { spawned: true, task_id: cacheTaskId },
});

// Human pseudo-agent (what WorkflowSpawner.start() creates)
const human = agentService.register(db, {
  name: 'human',
  runtime: 'human',
  role: 'coordinator',
  workflow_id: wf.id,
  workspace_path: process.cwd(),
  metadata: { pseudo: true },
});

// ─── 3. Task state: claimed + paused ───

// Transition through valid path: pending → planning → in_progress → paused
taskService.updateStatus(db, cacheTaskId, 'planning');
taskService.updateStatus(db, cacheTaskId, 'in_progress');
taskService.claim(db, cacheTaskId, worker.id);

// Add a progress checkpoint before pausing
checkpointService.add(db, cacheTaskId, {
  type: 'progress',
  summary: 'Scaffolded cache service with get/set stubs. Need clarification on TTL strategy.',
  filesChanged: ['src/services/cache.ts'],
});

taskService.updateStatus(db, cacheTaskId, 'paused');

// ─── 4. Query message: worker → human ───

const queryMsg = messageService.send(db, {
  sender_id: worker.id,
  recipient_id: human.id,
  message_type: 'query',
  subject: 'Cache TTL strategy?',
  body: 'Should I use a global TTL for all cache keys (e.g. 5 minutes) or per-endpoint TTLs configured in the route definitions? Per-endpoint is more flexible but adds complexity to the middleware.',
  priority: 'normal',
  workflow_id: wf.id,
  task_id: cacheTaskId,
});

console.log('');
console.log('=== Q&A Scenario Seeded ===');
console.log(`Workflow:      ${wf.id} — "Implement caching layer" (in_progress)`);
console.log(`Worker agent:  ${worker.id} — "spawner-Build cache service"`);
console.log(`Human agent:   ${human.id} — "human"`);
console.log(`Paused task:   ${cacheTaskId} — "Build cache service"`);
console.log(`Query message: ${queryMsg.id} — "Cache TTL strategy?" (unread)`);
console.log('');
console.log('The worker is asking: Should cache TTLs be global or per-endpoint?');
console.log('');
console.log('To reply, launch the TUI and use /reply on the message detail screen,');
console.log('or send a response message via MCP tools.');

db.close();
