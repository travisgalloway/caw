import type { Checkpoint } from '../types/checkpoint';
import { estimateTokens } from './tokens';

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) {
    return text;
  }

  const maxChars = maxTokens * 4;
  return `${text.slice(0, maxChars)}\n... [truncated]`;
}

export function compressFileList(filesJson: string | null, maxFiles = 10): string | null {
  if (!filesJson) {
    return null;
  }

  const files: string[] = JSON.parse(filesJson);
  if (files.length <= maxFiles) {
    return filesJson;
  }

  const kept = files.slice(0, maxFiles);
  const remaining = files.length - maxFiles;
  return JSON.stringify([...kept, `and ${remaining} more`]);
}

export function compressCheckpoints(checkpoints: Checkpoint[], recentCount: number): Checkpoint[] {
  if (checkpoints.length <= recentCount) {
    return checkpoints;
  }

  const olderCount = checkpoints.length - recentCount;
  const older = checkpoints.slice(0, olderCount).map((cp) => ({
    ...cp,
    detail: null,
    files_changed: null,
  }));
  const recent = checkpoints.slice(olderCount);

  return [...older, ...recent];
}

export function compressText(text: string | null, maxTokens: number): string | null {
  if (!text) {
    return null;
  }
  return truncateToTokenBudget(text, maxTokens);
}
