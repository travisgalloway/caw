import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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
