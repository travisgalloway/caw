#!/usr/bin/env bun
/**
 * Seed script for spawner manual testing.
 *
 * Creates 3 test workflows with tasks directly in the DB:
 *   A) Simple Sequential — 2 sequential tasks, max_parallel_tasks=1
 *   B) Parallel Fan-Out  — 1 setup → 2 parallel → 1 final, max_parallel_tasks=2
 *   C) Single Task       — 1 task only (smoke test)
 *
 * Usage:
 *   bun run examples/spawner-test/seed.ts [--db <path>]
 */
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { createConnection, getDbPath, runMigrations, workflowService } from '../../packages/core/src';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    db: { type: 'string' },
  },
  strict: true,
  allowPositionals: false,
});

const exampleProjectPath = resolve(import.meta.dir, 'example-project');
const dbPath = values.db ?? getDbPath('per-repo', exampleProjectPath);
const db = createConnection(dbPath);
runMigrations(db);

console.log(`Database: ${dbPath}`);
console.log(`Workspace: ${exampleProjectPath}\n`);

// --- Workflow A: Simple Sequential ---
const wfA = workflowService.create(db, {
  name: 'Simple Sequential',
  source_type: 'manual-test',
  max_parallel_tasks: 1,
  repository_paths: [exampleProjectPath],
});

workflowService.setPlan(db, wfA.id, {
  summary: 'Two sequential tasks: add a multiply function, then use it in index.ts',
  tasks: [
    {
      name: 'Add multiply function',
      description:
        'Add a multiply(a: number, b: number): number function to src/utils.ts and export it.',
      estimated_complexity: 'low',
      files_likely_affected: ['src/utils.ts'],
    },
    {
      name: 'Use multiply in index',
      description:
        'Import multiply from ./utils in src/index.ts and add a console.log showing 3 * 4.',
      estimated_complexity: 'low',
      files_likely_affected: ['src/index.ts'],
      depends_on: ['Add multiply function'],
    },
  ],
});

console.log(`Workflow A (Sequential): ${wfA.id}`);

// --- Workflow B: Parallel Fan-Out ---
const wfB = workflowService.create(db, {
  name: 'Parallel Fan-Out',
  source_type: 'manual-test',
  max_parallel_tasks: 2,
  repository_paths: [exampleProjectPath],
});

workflowService.setPlan(db, wfB.id, {
  summary:
    'Setup → 2 parallel tasks → final merge. Tests parallel agent spawning.',
  tasks: [
    {
      name: 'Create types file',
      description:
        'Create src/types.ts with a Person interface: { name: string; age: number }.',
      parallel_group: 'setup',
      estimated_complexity: 'low',
      files_likely_affected: ['src/types.ts'],
    },
    {
      name: 'Add formatPerson function',
      description:
        'Add a formatPerson(p: Person): string function to src/utils.ts that returns "name (age)".',
      parallel_group: 'parallel',
      estimated_complexity: 'low',
      files_likely_affected: ['src/utils.ts'],
      depends_on: ['Create types file'],
    },
    {
      name: 'Add validatePerson function',
      description:
        'Add a validatePerson(p: Person): boolean function to src/utils.ts that returns true if name is non-empty and age > 0.',
      parallel_group: 'parallel',
      estimated_complexity: 'low',
      files_likely_affected: ['src/utils.ts'],
      depends_on: ['Create types file'],
    },
    {
      name: 'Update index with Person example',
      description:
        'Import Person, formatPerson, and validatePerson in src/index.ts. Create a Person and log the formatted string.',
      parallel_group: 'finalize',
      estimated_complexity: 'low',
      files_likely_affected: ['src/index.ts'],
      depends_on: ['Add formatPerson function', 'Add validatePerson function'],
    },
  ],
});

console.log(`Workflow B (Parallel):   ${wfB.id}`);

// --- Workflow C: Single Task ---
const wfC = workflowService.create(db, {
  name: 'Single Task',
  source_type: 'manual-test',
  max_parallel_tasks: 1,
  repository_paths: [exampleProjectPath],
});

workflowService.setPlan(db, wfC.id, {
  summary: 'Single task: add a subtract function to utils.ts',
  tasks: [
    {
      name: 'Add subtract function',
      description:
        'Add a subtract(a: number, b: number): number function to src/utils.ts and export it.',
      estimated_complexity: 'low',
      files_likely_affected: ['src/utils.ts'],
    },
  ],
});

console.log(`Workflow C (Single):     ${wfC.id}`);

console.log('\nAll workflows seeded in "ready" status.');
console.log('Run with: bunx @caw/tui run <workflow_id> --max-agents 1');

db.close();
