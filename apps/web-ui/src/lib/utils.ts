import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export const statusColors: Record<string, string> = {
  planning: 'bg-status-planning text-white',
  ready: 'bg-status-ready text-white',
  in_progress: 'bg-status-in-progress text-black',
  completed: 'bg-status-completed text-white',
  failed: 'bg-status-failed text-white',
  paused: 'bg-status-paused text-white',
  abandoned: 'bg-status-abandoned text-white',
  pending: 'bg-status-pending text-black',
  blocked: 'bg-status-blocked text-white',
  skipped: 'bg-status-skipped text-black',
  online: 'bg-status-completed text-white',
  busy: 'bg-status-in-progress text-black',
  offline: 'bg-status-abandoned text-white',
};
