/**
 * Seed script for populating .caw/workflows.db with realistic dummy data.
 *
 * Usage: bun scripts/seed.ts
 *
 * Creates:
 * - 2 repositories (caw, acme-api)
 * - 3 workflows (in_progress, completed, planning)
 * - 10 tasks across 2 workflows with DAG dependencies
 * - 3 agents (coordinator + 2 workers)
 * - 6 messages (including unread)
 * - 5 checkpoints
 * - 2 workspaces
 */

import path from 'node:path';

import {
  agentService,
  checkpointService,
  createConnection,
  getDbPath,
  messageService,
  repositoryService,
  runMigrations,
  taskService,
  workflowService,
  workspaceService,
} from '../packages/core/src/index';

const dbPath = getDbPath('per-repo', process.cwd());
console.log(`Seeding database at: ${dbPath}`);

const db = createConnection(dbPath);
runMigrations(db);

// Clear existing data — disable FK checks to handle circular refs (tasks ↔ agents)
db.prepare('PRAGMA foreign_keys = OFF').run();
db.prepare('DELETE FROM messages').run();
db.prepare('DELETE FROM checkpoints').run();
db.prepare('DELETE FROM agents').run();
db.prepare('DELETE FROM workspaces').run();
db.prepare('DELETE FROM task_dependencies').run();
db.prepare('DELETE FROM tasks').run();
db.prepare('DELETE FROM workflow_repositories').run();
db.prepare('DELETE FROM workflows').run();
db.prepare('DELETE FROM repositories').run();
db.prepare('PRAGMA foreign_keys = ON').run();

console.log('Cleared existing data.');

// ─── 1. Repositories ───

const cawRepo = repositoryService.register(db, {
  path: process.cwd(),
  name: 'caw',
});

const acmeRepo = repositoryService.register(db, {
  path: path.join(process.cwd(), '..', 'acme-api'),
  name: 'acme-api',
});

console.log(`Created repos: ${cawRepo.id} (caw), ${acmeRepo.id} (acme-api)`);

// ─── 2. Workflows ───

// Workflow 1: "Add user authentication" — in_progress with DAG
const wf1 = workflowService.create(db, {
  name: 'Add user authentication',
  source_type: 'prompt',
  source_content: 'Implement JWT-based auth with login, register, and middleware protection.',
  repository_paths: [process.cwd()],
  max_parallel_tasks: 2,
});

// Set plan (creates tasks, transitions to 'ready')
const wf1Plan = workflowService.setPlan(db, wf1.id, {
  summary: 'Implement JWT auth: models, utils, endpoints, middleware, and integration tests.',
  tasks: [
    {
      name: 'Setup auth models',
      description: 'Create User and Session database models with proper indexes.',
      estimated_complexity: 'low',
      files_likely_affected: ['src/models/user.ts', 'src/models/session.ts'],
    },
    {
      name: 'Create JWT utils',
      description: 'Implement token generation, verification, and refresh utilities.',
      estimated_complexity: 'medium',
      files_likely_affected: ['src/utils/jwt.ts', 'src/utils/crypto.ts'],
      depends_on: ['Setup auth models'],
    },
    {
      name: 'Build login endpoint',
      description: 'POST /api/auth/login — validate credentials, return JWT pair.',
      estimated_complexity: 'medium',
      parallel_group: 'endpoints',
      files_likely_affected: ['src/routes/auth.ts', 'src/handlers/login.ts'],
      depends_on: ['Create JWT utils'],
    },
    {
      name: 'Build register endpoint',
      description: 'POST /api/auth/register — create user, hash password, return JWT pair.',
      estimated_complexity: 'medium',
      parallel_group: 'endpoints',
      files_likely_affected: ['src/routes/auth.ts', 'src/handlers/register.ts'],
      depends_on: ['Create JWT utils'],
    },
    {
      name: 'Add auth middleware',
      description: 'Express middleware to validate JWT on protected routes.',
      estimated_complexity: 'medium',
      files_likely_affected: ['src/middleware/auth.ts'],
      depends_on: ['Build login endpoint', 'Build register endpoint'],
    },
    {
      name: 'Write integration tests',
      description: 'End-to-end tests for auth flow: register, login, protected route access.',
      estimated_complexity: 'high',
      files_likely_affected: ['tests/auth.integration.test.ts'],
      depends_on: ['Add auth middleware'],
    },
  ],
});

// Transition workflow to in_progress
workflowService.updateStatus(db, wf1.id, 'in_progress');

// Get tasks by workflow to find their IDs
const wf1Tasks = (
  db.prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence').all(wf1.id) as Array<{
    id: string;
    name: string;
  }>
);
const wf1TaskMap = new Map(wf1Tasks.map((t) => [t.name, t.id]));

const t1_setup = wf1TaskMap.get('Setup auth models') ?? '';
const t2_jwt = wf1TaskMap.get('Create JWT utils') ?? '';
const t3_login = wf1TaskMap.get('Build login endpoint') ?? '';
const t4_register = wf1TaskMap.get('Build register endpoint') ?? '';
const _t5_middleware = wf1TaskMap.get('Add auth middleware') ?? '';
const _t6_tests = wf1TaskMap.get('Write integration tests') ?? '';

// Transition task statuses through valid state machine paths:
// Task 1: pending → planning → in_progress → completed
taskService.updateStatus(db, t1_setup, 'planning');
taskService.updateStatus(db, t1_setup, 'in_progress');
taskService.updateStatus(db, t1_setup, 'completed', {
  outcome: 'Created User and Session models with bcrypt hashing and proper indexes.',
});

// Task 2: pending → planning → in_progress → completed
taskService.updateStatus(db, t2_jwt, 'planning');
taskService.updateStatus(db, t2_jwt, 'in_progress');
taskService.updateStatus(db, t2_jwt, 'completed', {
  outcome: 'JWT sign/verify/refresh utilities with RS256 and configurable expiry.',
});

// Task 3: pending → planning → in_progress (currently being worked)
taskService.updateStatus(db, t3_login, 'planning');
taskService.updateStatus(db, t3_login, 'in_progress');

// Task 4: pending → planning → in_progress (currently being worked)
taskService.updateStatus(db, t4_register, 'planning');
taskService.updateStatus(db, t4_register, 'in_progress');

// Tasks 5 and 6 stay as 'pending' — they are blocked by incomplete dependencies.
// The orchestration service detects this dynamically from the dependency graph.

console.log(`Workflow 1: ${wf1.id} — "Add user authentication" (in_progress, ${wf1Plan.tasks_created} tasks)`);

// Workflow 2: "Refactor database layer" — completed
const wf2 = workflowService.create(db, {
  name: 'Refactor database layer',
  source_type: 'issue',
  source_ref: 'https://github.com/example/acme-api/issues/42',
  source_content: 'Replace raw SQL queries with a query builder for better maintainability.',
  repository_paths: [path.join(process.cwd(), '..', 'acme-api')],
});

const wf2Plan = workflowService.setPlan(db, wf2.id, {
  summary: 'Audit queries, add pooling, migrate to query builder, update services.',
  tasks: [
    {
      name: 'Audit current queries',
      description: 'Catalog all raw SQL queries and assess migration difficulty.',
      estimated_complexity: 'low',
    },
    {
      name: 'Add connection pooling',
      description: 'Configure pg-pool with health checks and connection limits.',
      estimated_complexity: 'medium',
      depends_on: ['Audit current queries'],
    },
    {
      name: 'Migrate to query builder',
      description: 'Replace raw SQL with Kysely query builder in all repositories.',
      estimated_complexity: 'high',
      parallel_group: 'refactor',
      depends_on: ['Audit current queries'],
    },
    {
      name: 'Update service layer',
      description: 'Update all service methods to use new repository interfaces.',
      estimated_complexity: 'medium',
      depends_on: ['Add connection pooling', 'Migrate to query builder'],
    },
  ],
});

// Transition workflow through: ready → in_progress → completed
workflowService.updateStatus(db, wf2.id, 'in_progress');

const wf2Tasks = (
  db.prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence').all(wf2.id) as Array<{
    id: string;
    name: string;
  }>
);
const wf2TaskMap = new Map(wf2Tasks.map((t) => [t.name, t.id]));

const t2_1 = wf2TaskMap.get('Audit current queries') ?? '';
const t2_2 = wf2TaskMap.get('Add connection pooling') ?? '';
const t2_3 = wf2TaskMap.get('Migrate to query builder') ?? '';
const t2_4 = wf2TaskMap.get('Update service layer') ?? '';

// Complete all wf2 tasks
for (const [name, id] of [
  ['Audit current queries', t2_1],
  ['Add connection pooling', t2_2],
  ['Migrate to query builder', t2_3],
  ['Update service layer', t2_4],
]) {
  taskService.updateStatus(db, id, 'planning');
  taskService.updateStatus(db, id, 'in_progress');
  taskService.updateStatus(db, id, 'completed', {
    outcome: `Completed: ${name}`,
  });
}

workflowService.updateStatus(db, wf2.id, 'completed');

console.log(`Workflow 2: ${wf2.id} — "Refactor database layer" (completed, ${wf2Plan.tasks_created} tasks)`);

// Workflow 3: "Setup CI pipeline" — planning, no tasks yet
const wf3 = workflowService.create(db, {
  name: 'Setup CI pipeline',
  source_type: 'prompt',
  source_content: 'Configure GitHub Actions for lint, test, build, and deploy stages.',
  repository_paths: [process.cwd()],
});

console.log(`Workflow 3: ${wf3.id} — "Setup CI pipeline" (planning, 0 tasks)`);

// ─── 3. Agents ───

const coordinator = agentService.register(db, {
  name: 'claude-main',
  runtime: 'claude_code',
  role: 'coordinator',
  workflow_id: wf1.id,
  capabilities: ['planning', 'code_review', 'orchestration'],
  workspace_path: process.cwd(),
  metadata: { version: '4.5', session: 'seed-demo' },
});

const worker1 = agentService.register(db, {
  name: 'claude-worker-1',
  runtime: 'claude_code',
  role: 'worker',
  workflow_id: wf1.id,
  capabilities: ['coding', 'testing'],
  workspace_path: `${process.cwd()}/worktrees/auth-login`,
  metadata: { version: '4.5', session: 'seed-demo' },
});

const worker2 = agentService.register(db, {
  name: 'claude-worker-2',
  runtime: 'claude_code',
  role: 'worker',
  workflow_id: wf1.id,
  capabilities: ['coding', 'testing'],
  workspace_path: `${process.cwd()}/worktrees/auth-register`,
  metadata: { version: '4.5', session: 'seed-demo' },
});

// Claim tasks for workers (sets agent status to 'busy')
taskService.claim(db, t3_login, worker1.id);
taskService.claim(db, t4_register, worker2.id);

console.log(`Created agents: ${coordinator.id} (coordinator), ${worker1.id} (worker-1), ${worker2.id} (worker-2)`);

// ─── 4. Workspaces ───

const ws1 = workspaceService.create(db, {
  workflowId: wf1.id,
  path: `${process.cwd()}/worktrees/auth-models`,
  branch: 'feature/auth-models',
  baseBranch: 'main',
  taskIds: [t1_setup, t2_jwt],
  repositoryPath: process.cwd(),
});

const ws2 = workspaceService.create(db, {
  workflowId: wf1.id,
  path: `${process.cwd()}/worktrees/auth-endpoints`,
  branch: 'feature/auth-endpoints',
  baseBranch: 'main',
  taskIds: [t3_login, t4_register],
  repositoryPath: process.cwd(),
});

console.log(`Created workspaces: ${ws1.id} (auth-models), ${ws2.id} (auth-endpoints)`);

// ─── 5. Checkpoints ───

// Task 1: plan + progress + complete
checkpointService.add(db, t1_setup, {
  type: 'plan',
  summary: 'Plan: Create User model with email/password fields and Session model for refresh tokens.',
  detail: {
    approach: 'Define Drizzle ORM schemas, generate migrations, add indexes on email.',
    files: ['src/models/user.ts', 'src/models/session.ts', 'src/db/migrations/002_auth.ts'],
  },
});

checkpointService.add(db, t1_setup, {
  type: 'progress',
  summary: 'Created User model with bcrypt password hashing and email unique index.',
  filesChanged: ['src/models/user.ts', 'src/db/migrations/002_auth.ts'],
});

checkpointService.add(db, t1_setup, {
  type: 'complete',
  summary: 'Auth models complete: User and Session tables with proper constraints and indexes.',
  detail: {
    tables_created: ['users', 'sessions'],
    indexes: ['idx_users_email', 'idx_sessions_user_id', 'idx_sessions_token'],
  },
  filesChanged: ['src/models/user.ts', 'src/models/session.ts', 'src/db/migrations/002_auth.ts'],
});

// Task 2: progress checkpoint
checkpointService.add(db, t2_jwt, {
  type: 'progress',
  summary: 'Implemented JWT sign and verify with RS256. Refresh token logic in progress.',
  filesChanged: ['src/utils/jwt.ts'],
});

// Task 3: progress checkpoint (in-flight)
checkpointService.add(db, t3_login, {
  type: 'progress',
  summary: 'Login route scaffolded. Credential validation logic added, testing token generation.',
  filesChanged: ['src/routes/auth.ts', 'src/handlers/login.ts'],
});

console.log('Created 5 checkpoints.');

// ─── 6. Messages ───

// System → coordinator: task assignment
const msg1 = messageService.send(db, {
  sender_id: null,
  recipient_id: coordinator.id,
  message_type: 'task_assignment',
  subject: 'New workflow assigned: Add user authentication',
  body: JSON.stringify({
    workflow_id: wf1.id,
    total_tasks: 6,
    parallel_groups: ['endpoints'],
  }),
  priority: 'high',
  workflow_id: wf1.id,
});

// Coordinator → worker-1: status update
const msg2 = messageService.send(db, {
  sender_id: coordinator.id,
  recipient_id: worker1.id,
  message_type: 'status_update',
  subject: 'Task claimed: Build login endpoint',
  body: 'You have been assigned the login endpoint task. JWT utils are complete — use the signToken() and verifyToken() helpers from src/utils/jwt.ts.',
  priority: 'normal',
  workflow_id: wf1.id,
  task_id: t3_login,
});

// Worker-1 → coordinator: query
const msg3 = messageService.send(db, {
  sender_id: worker1.id,
  recipient_id: coordinator.id,
  message_type: 'query',
  subject: 'Question: refresh token rotation strategy?',
  body: 'Should we rotate refresh tokens on every use (more secure) or use a fixed expiry (simpler)? The JWT utils support both patterns.',
  priority: 'normal',
  workflow_id: wf1.id,
  task_id: t3_login,
});

// Coordinator → worker-1: response (reply in thread)
messageService.send(db, {
  sender_id: coordinator.id,
  recipient_id: worker1.id,
  message_type: 'response',
  subject: 'Re: refresh token rotation strategy?',
  body: 'Use rotation on every refresh. Invalidate the old token and issue a new pair. This prevents token reuse attacks.',
  priority: 'normal',
  workflow_id: wf1.id,
  task_id: t3_login,
  reply_to_id: msg3.id,
});

// System → worker-2: urgent unread message
messageService.send(db, {
  sender_id: null,
  recipient_id: worker2.id,
  message_type: 'status_update',
  subject: 'Dependency completed: Create JWT utils',
  body: 'The JWT utils task has been completed. You can now use signToken() and verifyToken() in your register endpoint.',
  priority: 'urgent',
  workflow_id: wf1.id,
  task_id: t4_register,
});

// Coordinator → worker-2: normal unread
messageService.send(db, {
  sender_id: coordinator.id,
  recipient_id: worker2.id,
  message_type: 'status_update',
  subject: 'Heads up: password requirements',
  body: 'Use bcrypt with cost factor 12 for password hashing. The User model already has the hash field — see src/models/user.ts.',
  priority: 'normal',
  workflow_id: wf1.id,
  task_id: t4_register,
});

// Mark msg1 and msg2 as read so we have a mix
messageService.markRead(db, [msg1.id, msg2.id]);

console.log('Created 6 messages (4 unread, 2 read).');

// ─── Done ───

db.close();

console.log('\nSeed complete! Start the server to verify:');
console.log('  bun apps/cli/src/bin/cli.ts --server --transport http');
