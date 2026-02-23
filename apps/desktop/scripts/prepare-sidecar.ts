#!/usr/bin/env bun

/**
 * Compile the caw CLI binary as a Tauri sidecar.
 *
 * Detects the target triple and compiles to the expected sidecar path:
 *   apps/desktop/src-tauri/binaries/caw-<target-triple>
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const rootDir = resolve(dirname(import.meta.filename), '../../..');
const entrypoint = resolve(rootDir, 'apps/cli/src/bin/cli.ts');

// Detect target triple
function getTargetTriple(): string {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const platform = process.platform;

  if (platform === 'darwin') return `${arch}-apple-darwin`;
  if (platform === 'linux') return `${arch}-unknown-linux-gnu`;
  if (platform === 'win32') return `${arch}-pc-windows-msvc`;

  throw new Error(`Unsupported platform: ${platform}`);
}

const triple = getTargetTriple();
const outfile = resolve(rootDir, `apps/desktop/src-tauri/binaries/caw-${triple}`);

// Ensure output directory exists
mkdirSync(dirname(outfile), { recursive: true });

console.log(`Compiling caw sidecar for ${triple}...`);
console.log(`  Entry: ${entrypoint}`);
console.log(`  Output: ${outfile}`);

const proc = Bun.spawn(['bun', 'build', entrypoint, '--compile', `--outfile=${outfile}`], {
  cwd: rootDir,
  stdout: 'inherit',
  stderr: 'inherit',
});

const exitCode = await proc.exited;
if (exitCode !== 0) {
  console.error(`Failed to compile sidecar (exit code ${exitCode})`);
  process.exit(1);
}

console.log(`Sidecar compiled: ${outfile}`);
