import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CawConfig } from './schema';

export function writeConfig(filePath: string, config: CawConfig): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

export function ensureGitignore(repoPath: string, entry: string): boolean {
  const gitignorePath = `${repoPath}/.gitignore`;

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n');
    if (lines.some((line) => line.trim() === entry)) {
      return false; // already present
    }
    const suffix = content.endsWith('\n') ? '' : '\n';
    writeFileSync(gitignorePath, `${content}${suffix}${entry}\n`);
    return true;
  }

  writeFileSync(gitignorePath, `${entry}\n`);
  return true;
}
