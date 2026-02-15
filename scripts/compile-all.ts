#!/usr/bin/env bun

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

console.log('\nAll targets built successfully.');
