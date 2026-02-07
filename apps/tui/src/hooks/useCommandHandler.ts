import { lockService } from '@caw/core';
import { useApp } from 'ink';
import { useCallback } from 'react';
import { useDb } from '../context/db';
import { useSessionInfo } from '../context/session';
import type { Panel } from '../store';
import { useAppStore } from '../store';
import { isValidSlashCommand, parseCommand } from '../utils/parseCommand';

const panelCommands: Record<string, Panel> = {
  workflows: 'workflows',
  tasks: 'tasks',
  agents: 'agents',
  messages: 'messages',
};

export function useCommandHandler(): (input: string) => void {
  const { exit } = useApp();
  const db = useDb();
  const sessionInfo = useSessionInfo();

  return useCallback(
    (input: string) => {
      const parsed = parseCommand(input);
      const store = useAppStore.getState();

      if (parsed.type === 'text') {
        store.setPromptError('Workflow creation from prompt is not yet available');
        return;
      }

      const { command } = parsed;

      if (!command || !isValidSlashCommand(command)) {
        store.setPromptError(`Unknown command: /${command ?? ''}`);
        return;
      }

      if (command === 'quit') {
        exit();
        return;
      }

      if (command === 'help') {
        store.setView('help');
        return;
      }

      if (panelCommands[command]) {
        store.setView('dashboard');
        store.setActivePanel(panelCommands[command]);
        return;
      }

      if (command === 'refresh') {
        store.triggerRefresh();
        store.setPromptSuccess('Data refreshed');
        return;
      }

      if (command === 'unread') {
        const current = store.messageStatusFilter;
        const next = current === 'unread' ? 'all' : 'unread';
        store.setMessageStatusFilter(next);
        store.setPromptSuccess(`Message filter: ${next}`);
        return;
      }

      if (command === 'lock') {
        if (!sessionInfo) {
          store.setPromptError('No active session — cannot lock');
          return;
        }
        const wfId = parsed.args ?? store.selectedWorkflowId;
        if (!wfId) {
          store.setPromptError('No workflow selected. Usage: /lock <workflow_id>');
          return;
        }
        try {
          const result = lockService.lock(db, wfId, sessionInfo.sessionId);
          if (result.success) {
            store.setPromptSuccess(`Locked workflow ${wfId}`);
            store.triggerRefresh();
          } else {
            store.setPromptError(
              `Workflow already locked by session ${result.locked_by ?? 'unknown'}`,
            );
          }
        } catch (err) {
          store.setPromptError(`Lock failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }

      if (command === 'unlock') {
        if (!sessionInfo) {
          store.setPromptError('No active session — cannot unlock');
          return;
        }
        const wfId = parsed.args ?? store.selectedWorkflowId;
        if (!wfId) {
          store.setPromptError('No workflow selected. Usage: /unlock <workflow_id>');
          return;
        }
        try {
          const unlocked = lockService.unlock(db, wfId, sessionInfo.sessionId);
          if (unlocked) {
            store.setPromptSuccess(`Unlocked workflow ${wfId}`);
            store.triggerRefresh();
          } else {
            store.setPromptError('Unlock failed — you may not hold the lock');
          }
        } catch (err) {
          store.setPromptError(
            `Unlock failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        return;
      }

      if (command === 'dag' || command === 'tree') {
        store.setPromptError(`/${command} is not yet implemented`);
        return;
      }
    },
    [exit, db, sessionInfo],
  );
}
