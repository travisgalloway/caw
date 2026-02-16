#!/usr/bin/env bun

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const rootDir = resolve(dirname(import.meta.filename), '..');

const targets = [
  { target: 'bun-darwin-arm64', outfile: 'dist/caw-darwin-arm64' },
  { target: 'bun-darwin-x64', outfile: 'dist/caw-darwin-x64' },
  { target: 'bun-linux-x64', outfile: 'dist/caw-linux-x64' },
  { target: 'bun-linux-arm64', outfile: 'dist/caw-linux-arm64' },
];

const entrypoint = 'apps/tui/src/bin/cli.ts';

for (const { target, outfile } of targets) {
  console.log(`\nBuilding ${outfile} (${target})...`);

  const proc = Bun.spawn(['bun', 'build', entrypoint, '--compile', `--target=${target}`, `--outfile=${outfile}`], {
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error(`Failed to build ${target} (exit code ${exitCode})`);
    process.exit(1);
  }

  console.log(`Built ${outfile}`);
}

// Copy web UI build output next to binaries
const webUiBuild = resolve(rootDir, 'apps/web-ui/build');
const webUiDest = resolve(rootDir, 'dist/web-ui');

if (existsSync(webUiBuild)) {
  console.log(`\nCopying web UI build → dist/web-ui/...`);
  const cp = Bun.spawn(['cp', '-r', webUiBuild, webUiDest], {
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const cpExit = await cp.exited;
  if (cpExit !== 0) {
    console.error('Failed to copy web UI build output');
    process.exit(1);
  }
  console.log('Copied web UI static files.');
} else {
  console.warn(`\nWarning: web UI build not found at ${webUiBuild}`);
  console.warn("Run 'bun run --filter @caw/web-ui build:web' first for web UI support.");
}

console.log('\nAll targets built successfully.');
