import { lockService, workflowService } from '@caw/core';
import { useApp } from 'ink';
import { useCallback } from 'react';
import { useDb } from '../context/db';
import { useSessionInfo } from '../context/session';
import { currentScreen, getWorkflowId, useAppStore } from '../store';
import { isValidSlashCommand, parseCommand } from '../utils/parseCommand';

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
        store.push({ screen: 'help' });
        return;
      }

      if (command === 'setup') {
        store.push({ screen: 'setup' });
        return;
      }

      if (command === 'workflows') {
        store.resetTo({ screen: 'workflow-list' });
        return;
      }

      if (command === 'back') {
        store.pop();
        return;
      }

      if (command === 'tasks') {
        const screen = currentScreen(store);
        if (screen.screen === 'workflow-detail') {
          store.setWorkflowTab('tasks');
          return;
        }
        store.setPromptError('Navigate to a workflow first to view tasks');
        return;
      }

      if (command === 'agents') {
        const screen = currentScreen(store);
        if (screen.screen === 'workflow-detail') {
          store.setWorkflowTab('agents');
          return;
        }
        if (screen.screen === 'workflow-list') {
          store.setMainTab('agents');
          return;
        }
        store.setPromptError('Navigate to a workflow first to view agents');
        return;
      }

      if (command === 'messages') {
        const screen = currentScreen(store);
        if (screen.screen === 'workflow-detail') {
          store.setWorkflowTab('messages');
          return;
        }
        if (screen.screen === 'workflow-list') {
          store.setMainTab('messages');
          return;
        }
        store.setPromptError('Navigate to a workflow first to view messages');
        return;
      }

      if (command === 'all') {
        store.toggleShowAllWorkflows();
        const screen = currentScreen(store);
        if (screen.screen !== 'workflow-list') {
          store.resetTo({ screen: 'workflow-list' });
        }
        const next = !store.showAllWorkflows;
        store.setPromptSuccess(next ? 'Showing all workflows' : 'Showing active workflows only');
        return;
      }

      if (command === 'resume') {
        const wfId = parsed.args ?? getWorkflowId(store);
        if (!wfId) {
          store.setPromptError('No workflow selected. Usage: /resume <workflow_id>');
          return;
        }
        try {
          const workflow = workflowService.get(db, wfId);
          if (!workflow) {
            store.setPromptError(`Workflow not found: ${wfId}`);
            return;
          }
          if (workflow.status !== 'paused' && workflow.status !== 'failed') {
            store.setPromptError(
              `Cannot resume: workflow status is '${workflow.status}' (must be paused or failed)`,
            );
            return;
          }
          workflowService.updateStatus(db, wfId, 'in_progress');
          store.setPromptSuccess(`Resumed workflow ${wfId}`);
          store.triggerRefresh();
        } catch (err) {
          store.setPromptError(
            `Resume failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
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
        const wfId = parsed.args ?? getWorkflowId(store);
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
        const wfId = parsed.args ?? getWorkflowId(store);
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

      if (command === 'dag') {
        store.setTaskViewMode('dag');
        store.setPromptSuccess('Task view: DAG');
        return;
      }

      if (command === 'tree') {
        store.setTaskViewMode('tree');
        store.setPromptSuccess('Task view: tree');
        return;
      }

      if (command === 'table') {
        store.setTaskViewMode('table');
        store.setPromptSuccess('Task view: table');
        return;
      }
    },
    [exit, db, sessionInfo],
  );
}
