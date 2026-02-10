#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { createConnection, getDbPath, runMigrations, templateService } from '@caw/core';

function printUsage(): void {
  console.log(`Usage: caw [options] [description]
       caw init [--yes] [--global]
       caw setup claude-code [--print] [--mcp-only] [--claude-md-only]
       caw run <workflow_id> [options]
       caw run --prompt "..." [options]

Options:
  --server              Run as headless MCP server (no TUI)
  --transport <type>    MCP transport: stdio | http (default: stdio)
  --port <number>       HTTP port (default: 3100)
  --db <path>           Database file path
  --workflow <id>       Focus on a specific workflow
  --template <name>     Create workflow from named template (requires description)
  --list-templates      List available workflow templates
  -h, --help            Show this help message

Commands:
  init                  Initialize caw in the current repository
    --yes, -y           Skip prompts, use defaults
    --global            Initialize global config (~/.caw/) instead of per-repo

  setup claude-code     Configure Claude Code to use caw
    --print             Print what would be added without modifying files
    --mcp-only          Only configure MCP server, skip CLAUDE.md
    --claude-md-only    Only update CLAUDE.md, skip MCP config

  run                   Execute a workflow by spawning Claude Code agents
    --prompt <text>     Create workflow from prompt, plan it, then run
    --max-agents <n>    Override max_parallel_tasks
    --model <name>      Claude model (default: claude-sonnet-4-5)
    --detach            Start and run in background
`);
}

// --- Subcommand detection ---

const subcommand = process.argv[2];

if (subcommand === 'init') {
  const { values: initValues } = parseArgs({
    args: process.argv.slice(3),
    options: {
      yes: { type: 'boolean', short: 'y', default: false },
      global: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (initValues.help) {
    printUsage();
    process.exit(0);
  }

  const { runInit } = await import('../commands/init');
  await runInit({
    yes: initValues.yes,
    global: initValues.global,
    repoPath: process.cwd(),
  });
  process.exit(0);
}

if (subcommand === 'setup') {
  const target = process.argv[3];
  const { values: setupValues } = parseArgs({
    args: process.argv.slice(4),
    options: {
      print: { type: 'boolean', default: false },
      'mcp-only': { type: 'boolean', default: false },
      'claude-md-only': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (setupValues.help || !target) {
    printUsage();
    process.exit(target ? 0 : 1);
  }

  const { runSetup } = await import('../commands/setup');
  runSetup({
    target,
    repoPath: process.cwd(),
    print: setupValues.print,
    mcpOnly: setupValues['mcp-only'],
    claudeMdOnly: setupValues['claude-md-only'],
  });
  process.exit(0);
}

if (subcommand === 'run') {
  const { values: runValues, positionals: runPositionals } = parseArgs({
    args: process.argv.slice(3),
    options: {
      prompt: { type: 'string' },
      'max-agents': { type: 'string' },
      model: { type: 'string' },
      'permission-mode': { type: 'string' },
      'max-turns': { type: 'string' },
      'max-budget': { type: 'string' },
      watch: { type: 'boolean', default: true },
      detach: { type: 'boolean', default: false },
      port: { type: 'string' },
      db: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: true,
  });

  if (runValues.help) {
    console.log(`Usage: caw run <workflow_id> [options]
       caw run --prompt "..." [options]

Options:
  --prompt <text>           Create workflow from prompt, plan it, then run
  --max-agents <n>          Override max_parallel_tasks
  --model <name>            Claude model (default: claude-sonnet-4-5)
  --permission-mode <mode>  acceptEdits | bypassPermissions (default: bypassPermissions)
  --max-turns <n>           Max turns per task (default: 50)
  --max-budget <usd>        Max budget per task in USD
  --watch                   Show progress (default: true)
  --detach                  Start and run in background
  --port <number>           Daemon port (default: 3100)
  --db <path>               Database file path
  -h, --help                Show this help message
`);
    process.exit(0);
  }

  const runDbPath = runValues.db ?? getDbPath('per-repo', process.cwd());
  const runDb = createConnection(runDbPath);
  runMigrations(runDb);

  // Ensure daemon is running
  const { initDaemon } = await import('../daemon');
  const daemon = await initDaemon(
    runDb,
    runDbPath,
    runValues.port ? Number(runValues.port) : undefined,
  );

  const shutdownRun = () => {
    daemon.cleanup();
    runDb.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdownRun);
  process.on('SIGTERM', shutdownRun);

  const { runWorkflow } = await import('../commands/run');
  await runWorkflow(runDb, {
    workflowId: runPositionals[0],
    prompt: runValues.prompt,
    maxAgents: runValues['max-agents'] ? Number(runValues['max-agents']) : undefined,
    model: runValues.model,
    permissionMode: runValues['permission-mode'],
    maxTurns: runValues['max-turns'] ? Number(runValues['max-turns']) : undefined,
    maxBudgetUsd: runValues['max-budget'] ? Number(runValues['max-budget']) : undefined,
    watch: runValues.watch,
    detach: runValues.detach,
    port: daemon.port,
    cwd: process.cwd(),
  });

  daemon.cleanup();
  runDb.close();
  process.exit(0);
}

// --- Main CLI argument parsing ---

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    server: { type: 'boolean', default: false },
    transport: { type: 'string' },
    port: { type: 'string' },
    db: { type: 'string' },
    workflow: { type: 'string' },
    template: { type: 'string' },
    'list-templates': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
  allowPositionals: true,
});

if (values.help) {
  printUsage();
  process.exit(0);
}

const dbPath = values.db ?? getDbPath('per-repo', process.cwd());
const db = createConnection(dbPath);
runMigrations(db);

// --- Run-and-exit commands ---

if (values['list-templates']) {
  const templates = templateService.list(db);
  if (templates.length === 0) {
    console.log('No templates found.');
  } else {
    console.log('Available templates:\n');
    console.log(`${'Name'.padEnd(24)} ${'Description'.padEnd(32)} ${'Version'.padEnd(10)} ID`);
    console.log(`${'─'.repeat(24)} ${'─'.repeat(32)} ${'─'.repeat(10)} ${'─'.repeat(16)}`);
    for (const t of templates) {
      const desc = t.description ?? '—';
      console.log(
        `${t.name.padEnd(24)} ${desc.padEnd(32)} ${String(t.version).padEnd(10)} ${t.id}`,
      );
    }
  }
  db.close();
  process.exit(0);
}

if (values.template) {
  const description = positionals[0];
  if (!description) {
    console.error('Error: --template requires a description as a positional argument.');
    console.error('Usage: caw --template <name> "workflow description"');
    db.close();
    process.exit(1);
  }

  const tmpl = templateService.getByName(db, values.template);
  if (!tmpl) {
    const available = templateService.list(db);
    console.error(`Error: Template not found: ${values.template}`);
    if (available.length > 0) {
      console.error('\nAvailable templates:');
      for (const t of available) {
        console.error(`  - ${t.name}`);
      }
    }
    db.close();
    process.exit(1);
  }

  const result = templateService.apply(db, tmpl.id, { workflowName: description });
  console.log(result.workflow_id);
  db.close();
  process.exit(0);
}

// --- Server or TUI ---

if (values.server) {
  const { runServer } = await import('../server');
  await runServer(db, {
    transport: values.transport,
    port: values.port,
  });
} else {
  const { initDaemon } = await import('../daemon');
  const daemon = await initDaemon(db, dbPath, values.port ? Number(values.port) : undefined);

  const shutdown = () => {
    daemon.cleanup();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (err) => {
    daemon.cleanup();
    db.close();
    console.error(err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    daemon.cleanup();
    db.close();
    console.error(reason);
    process.exit(1);
  });

  const { runTui } = await import('../app');
  await runTui(db, {
    workflow: values.workflow,
    sessionId: daemon.sessionId,
    isDaemon: daemon.isDaemon,
    port: daemon.port,
    dbPath,
  });

  daemon.cleanup();
  db.close();
  process.exit(0);
}
