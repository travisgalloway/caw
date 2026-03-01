import { writable } from 'svelte/store';

export type SettingsSection = 'general' | 'repositories' | 'templates' | 'setup' | 'help';

export const settingsSection = writable<SettingsSection>('general');
