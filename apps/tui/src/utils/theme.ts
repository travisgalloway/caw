export const THEME = {
  brand: 'cyan',
  accent: 'cyan',
  success: 'green',
  error: 'red',
  warning: 'yellow',
  muted: 'gray',
  info: 'blue',
} as const;

export const VERSION = '0.1.0';

export const LOGO_LINES = ['█▀▀ █▀█ █ █', '█   █▀█ █▄█', '▀▀▀ ▀ ▀ ▀ ▀'];

export function horizontalRule(width: number): string {
  return '─'.repeat(width);
}
