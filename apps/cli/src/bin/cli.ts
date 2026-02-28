#!/usr/bin/env bun
process.title = 'caw';

import { parseArgs } from 'node:util';
import { createConnection, getDbPath, runMigrations, templateService } from '@caw/core';

function printUsage(): void {
  console.log(`Usage: caw [options] [description]
       caw init [--yes] [--global]
       caw setup claude-code [--print] [--mcp-only] [--claude-md-only]
       caw run <workflow_id> [options]
       caw run --prompt "..." [options]
       caw work <issues...> [options]
       caw pr list|check|merge|rebase|cycle [workflow_id|workspace_id]

Options:
  --server              Run as headless server
  --transport <type>    MCP transport: stdio | http (default: stdio)
                        HTTP mode also serves REST API + WebSocket
  --port <number>       HTTP port (default: 3100)
  --db <path>           Database file path
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
    --ephemeral-worktree  Use Claude Code native worktree isolation per task
    --detach            Start and run in background

  work                  Work on GitHub issue(s): fetch, plan, execute, create PR
    <issues...>         Issue refs: #123, 123, or GitHub URL
    --branch <name>     Git branch name (default: caw/issue-<n>)
    --max-agents <n>    Override max parallel agents
    --model <name>      Claude model (default: claude-sonnet-4-5)
    --detach            Start and run in background
    --port <number>     Daemon port (default: 3100)
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
      'ephemeral-worktree': { type: 'boolean', default: false },
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
  --ephemeral-worktree      Use Claude Code's native --worktree isolation per task
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
    ephemeralWorktree: runValues['ephemeral-worktree'],
    watch: runValues.watch,
    detach: runValues.detach,
    port: daemon.port,
    cwd: process.cwd(),
  });

  daemon.cleanup();
  runDb.close();
  process.exit(0);
}

if (subcommand === 'pr') {
  const prSubcommand = process.argv[3];
  const { values: prValues, positionals: prPositionals } = parseArgs({
    args: process.argv.slice(4),
    options: {
      'pr-url': { type: 'string' },
      'merge-commit': { type: 'string' },
      model: { type: 'string' },
      port: { type: 'string' },
      db: { type: 'string' },
      cycle: { type: 'string' },
      'no-review': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'merge-method': { type: 'string' },
      'ci-timeout': { type: 'string' },
      'ci-poll': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: true,
  });

  if (prValues.help || !prSubcommand) {
    console.log(`Usage: caw pr list [workflow_id]
       caw pr check [workflow_id]
       caw pr merge <workspace_id|workflow_id> --pr-url <url> [--merge-commit <sha>]
       caw pr rebase <workspace_id|workflow_id> [--model <name>]
       caw pr cycle [workflow_id] [--cycle auto|hitl] [options]

Commands:
  list              List workflows awaiting PR merge
  check             Check PR merge status, clean up merged worktrees
  merge             Manually mark a workspace as merged
  rebase            Rebase conflicting PRs onto updated main branch
  cycle             Review, wait for CI, merge, rebase loop

Options:
  --pr-url <url>          PR URL (required for merge if not already set on workspace)
  --merge-commit <sha>    Merge commit SHA (fetched from GitHub if omitted)
  --model <name>          Claude model for agents (default: claude-sonnet-4-5)
  --port <number>         Daemon port (default: 3100)
  --db <path>             Database file path
  --cycle <mode>          Cycle mode: auto | hitl (default from config or auto for cycle cmd)
  --no-review             Skip code review step
  --dry-run               Show what would happen without making changes
  --merge-method <type>   squash | merge | rebase (default: squash)
  --ci-timeout <secs>     CI wait timeout in seconds (default: 600)
  --ci-poll <secs>        CI poll interval in seconds (default: 30)
  -h, --help              Show this help message
`);
    process.exit(prValues.help ? 0 : 1);
  }

  const prDbPath = prValues.db ?? getDbPath('per-repo', process.cwd());
  const prDb = createConnection(prDbPath);
  runMigrations(prDb);

  // Start daemon for cycle subcommand (rebase agents need MCP)
  let prDaemon: { port: number; cleanup: () => void } | undefined;
  if (prSubcommand === 'cycle' || prSubcommand === 'rebase') {
    const { initDaemon } = await import('../daemon');
    prDaemon = await initDaemon(prDb, prDbPath, prValues.port ? Number(prValues.port) : undefined);
  }

  const cycleMode =
    (prValues.cycle as 'auto' | 'hitl' | 'off' | undefined) ??
    (prSubcommand === 'cycle' ? 'auto' : undefined);

  const { runPr } = await import('../commands/pr');
  await runPr(prDb, {
    subcommand: prSubcommand,
    workflowId: prPositionals[0],
    repoPath: process.cwd(),
    prUrl: prValues['pr-url'],
    mergeCommit: prValues['merge-commit'],
    model: prValues.model,
    port: prDaemon?.port ?? (prValues.port ? Number(prValues.port) : undefined),
    cycle: cycleMode,
    noReview: prValues['no-review'],
    dryRun: prValues['dry-run'],
    mergeMethod: prValues['merge-method'] as 'squash' | 'merge' | 'rebase' | undefined,
    ciTimeout: prValues['ci-timeout'] ? Number(prValues['ci-timeout']) : undefined,
    ciPoll: prValues['ci-poll'] ? Number(prValues['ci-poll']) : undefined,
  });

  prDaemon?.cleanup();
  prDb.close();
  process.exit(0);
}

if (subcommand === 'work') {
  const { values: workValues, positionals: workPositionals } = parseArgs({
    args: process.argv.slice(3),
    options: {
      branch: { type: 'string' },
      'max-agents': { type: 'string' },
      model: { type: 'string' },
      'permission-mode': { type: 'string' },
      'max-turns': { type: 'string' },
      'max-budget': { type: 'string' },
      watch: { type: 'boolean', default: true },
      detach: { type: 'boolean', default: false },
      port: { type: 'string' },
      db: { type: 'string' },
      cycle: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: true,
  });

  if (workValues.help || workPositionals.length === 0) {
    console.log(`Usage: caw work <issues...> [options]

Arguments:
  <issues...>               Issue refs: #123, 123, or full GitHub URL

Options:
  --branch <name>           Git branch name (default: caw/issue-<n>)
  --max-agents <n>          Override max parallel agents
  --model <name>            Claude model (default: claude-sonnet-4-5)
  --permission-mode <mode>  acceptEdits | bypassPermissions (default: bypassPermissions)
  --max-turns <n>           Max turns per task (default: 50)
  --max-budget <usd>        Max budget per task in USD
  --watch                   Show progress (default: true)
  --detach                  Start and run in background
  --port <number>           Daemon port (default: 3100)
  --db <path>               Database file path
  --cycle <mode>            After completion: auto | hitl | off (default from config or off)
  -h, --help                Show this help message
`);
    process.exit(workValues.help ? 0 : 1);
  }

  const workDbPath = workValues.db ?? getDbPath('per-repo', process.cwd());
  const workDb = createConnection(workDbPath);
  runMigrations(workDb);

  const { initDaemon } = await import('../daemon');
  const daemon = await initDaemon(
    workDb,
    workDbPath,
    workValues.port ? Number(workValues.port) : undefined,
  );

  const shutdownWork = () => {
    daemon.cleanup();
    workDb.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdownWork);
  process.on('SIGTERM', shutdownWork);

  const { runWork } = await import('../commands/work');
  await runWork(workDb, {
    issues: workPositionals,
    branch: workValues.branch,
    maxAgents: workValues['max-agents'] ? Number(workValues['max-agents']) : undefined,
    model: workValues.model,
    permissionMode: workValues['permission-mode'],
    maxTurns: workValues['max-turns'] ? Number(workValues['max-turns']) : undefined,
    maxBudgetUsd: workValues['max-budget'] ? Number(workValues['max-budget']) : undefined,
    watch: workValues.watch,
    detach: workValues.detach,
    port: daemon.port,
    cwd: process.cwd(),
    cycle: workValues.cycle as 'auto' | 'hitl' | 'off' | undefined,
  });

  daemon.cleanup();
  workDb.close();
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

const repoRoot = (() => {
  try {
    const result = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel']);
    const output = result.stdout.toString().trim();
    return output || process.cwd();
  } catch {
    return process.cwd();
  }
})();
const dbPath = values.db ?? getDbPath('per-repo', repoRoot);
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

// --- Server mode ---

if (values.server) {
  const transport = values.transport ?? 'stdio';

  if (transport === 'http') {
    // HTTP transport: combined MCP + REST API + WebSocket server
    const { runApiServer } = await import('../api-server');
    const port = values.port ? Number(values.port) : 3100;
    await runApiServer(db, { port });
  } else {
    // Stdio transport: MCP-only server
    const { runServer } = await import('../server');
    await runServer(db, {
      transport,
      port: values.port,
    });
  }
} else {
  // No server mode — print usage and exit
  printUsage();
  db.close();
  process.exit(0);
}
