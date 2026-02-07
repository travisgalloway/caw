#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { createConnection, getDbPath, runMigrations, templateService } from '@caw/core';

function printUsage(): void {
  console.log(`Usage: caw [options] [description]

Options:
  --server              Run as headless MCP server (no TUI)
  --transport <type>    MCP transport: stdio | http (default: stdio)
  --port <number>       HTTP port (default: 3100)
  --db <path>           Database file path
  --workflow <id>       Focus on a specific workflow
  --template <name>     Create workflow from named template (requires description)
  --list-templates      List available workflow templates
  -h, --help            Show this help message
`);
}

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

const dbPath = values.db ?? getDbPath('repository', process.cwd());
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

  const { runTui } = await import('../app');
  await runTui(db, {
    workflow: values.workflow,
    sessionId: daemon.sessionId,
    isDaemon: daemon.isDaemon,
    port: daemon.port,
    dbPath,
  });

  daemon.cleanup();
}
