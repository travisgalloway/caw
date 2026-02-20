import {
  lockService,
  messageService,
  prService,
  workflowService,
  workspaceService,
} from '@caw/core';
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
        store.toggleShowAll();
        const next = !store.showAll;
        store.setPromptSuccess(next ? 'Showing all' : 'Showing active only');
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

      if (command === 'mark-read') {
        try {
          const unread = messageService.listAll(db, { status: 'unread' });
          const ids = unread.map((m) => m.id);
          if (ids.length === 0) {
            store.setPromptSuccess('No unread messages');
          } else {
            messageService.markRead(db, ids);
            store.setPromptSuccess(
              `Marked ${ids.length} message${ids.length === 1 ? '' : 's'} as read`,
            );
            store.triggerRefresh();
          }
        } catch (err) {
          store.setPromptError(
            `Mark read failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
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

      if (command === 'reply') {
        const screen = currentScreen(store);
        if (screen.screen !== 'message-detail') {
          store.setPromptError('Navigate to a message detail screen first. Usage: /reply <text>');
          return;
        }
        if (!parsed.args) {
          store.setPromptError('Usage: /reply <your response text>');
          return;
        }
        try {
          const message = messageService.get(db, screen.messageId);
          if (!message) {
            store.setPromptError(`Message not found: ${screen.messageId}`);
            return;
          }
          if (!message.sender_id) {
            store.setPromptError('Cannot reply: message has no sender');
            return;
          }
          messageService.send(db, {
            sender_id: null,
            recipient_id: message.sender_id,
            message_type: 'response',
            body: parsed.args,
            reply_to_id: message.id,
            workflow_id: message.workflow_id ?? undefined,
            task_id: message.task_id ?? undefined,
          });
          store.setPromptSuccess('Reply sent');
          store.triggerRefresh();
        } catch (err) {
          store.setPromptError(`Reply failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }

      if (command === 'add-task') {
        const wfId = getWorkflowId(store);
        if (!wfId) {
          store.setPromptError('No workflow selected. Navigate to a workflow first.');
          return;
        }
        if (!parsed.args) {
          store.setPromptError('Usage: /add-task <task name>');
          return;
        }
        try {
          const result = workflowService.addTask(db, wfId, { name: parsed.args });
          store.setPromptSuccess(`Added task ${result.task_id} (seq ${result.sequence})`);
          store.triggerRefresh();
        } catch (err) {
          store.setPromptError(
            `Add task failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        return;
      }

      if (command === 'work') {
        if (!parsed.args) {
          store.setPromptError('Usage: /work <issue_number...>');
          return;
        }
        if (!sessionInfo?.port) {
          store.setPromptError('No active server session — cannot run work');
          return;
        }
        const issues = parsed.args.split(/\s+/);
        store.setPromptSuccess('Starting work on issue(s)...');
        Promise.resolve().then(async () => {
          try {
            const { runWork } = await import('../commands/work');
            await runWork(db, { issues, port: sessionInfo.port });
            store.setPromptSuccess('Work started');
            store.triggerRefresh();
          } catch (err) {
            store.setPromptError(
              `Work failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        });
        return;
      }

      if (command === 'remove-task') {
        const wfId = getWorkflowId(store);
        if (!wfId) {
          store.setPromptError('No workflow selected. Navigate to a workflow first.');
          return;
        }
        if (!parsed.args) {
          store.setPromptError('Usage: /remove-task <task_id>');
          return;
        }
        try {
          const result = workflowService.removeTask(db, wfId, parsed.args);
          store.setPromptSuccess(
            `Removed task ${result.removed_task_id} (${result.dependencies_rewired} deps rewired)`,
          );
          store.triggerRefresh();
        } catch (err) {
          store.setPromptError(
            `Remove task failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        return;
      }

      if (command === 'rebase') {
        const wsId = parsed.args ?? store.selectedWorkspaceId;
        if (!wsId) {
          store.setPromptError(
            'No workspace selected. Select one in the Workspaces tab or use: /rebase <workspace_id>',
          );
          return;
        }
        try {
          const workspace = workspaceService.get(db, wsId);
          if (!workspace) {
            store.setPromptError(`Workspace not found: ${wsId}`);
            return;
          }
          if (workspace.status !== 'active') {
            store.setPromptError(
              `Cannot rebase: workspace status is '${workspace.status}' (must be active)`,
            );
            return;
          }
          if (!workspace.pr_url) {
            store.setPromptError('Cannot rebase: workspace has no PR URL');
            return;
          }
          store.setPromptSuccess('Checking PR conflict status...');
          const prUrl = workspace.pr_url;
          const worktreePath = workspace.path;
          const branch = workspace.branch;
          const wsIdCopy = wsId;
          Promise.resolve().then(async () => {
            try {
              const status = prService.checkPrStatus(prUrl);
              if (status.merged) {
                store.setPromptError('PR is already merged');
                return;
              }
              if (status.mergeable !== 'CONFLICTING') {
                store.setPromptSuccess(`PR has no conflicts (${status.mergeable})`);
                return;
              }
              store.setPromptSuccess('Rebasing — spawning agent...');
              const { spawnRebaseAgent } = await import('../commands/pr');
              await spawnRebaseAgent({
                workspaceId: wsIdCopy,
                worktreePath,
                branch,
                baseBranch: 'main',
                prUrl,
                port: sessionInfo?.port,
                onProgress: (event, message) => {
                  if (event === 'start') store.setPromptSuccess('Rebasing — agent started...');
                  if (event === 'tick') store.setPromptSuccess('Rebasing — agent working...');
                  if (event === 'error') store.setPromptError(`Rebase failed: ${message}`);
                  if (event === 'done') {
                    store.setPromptSuccess('Rebase completed');
                    store.triggerRefresh();
                  }
                },
              });
            } catch (err) {
              store.setPromptError(
                `Rebase failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          });
        } catch (err) {
          store.setPromptError(
            `Rebase failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        return;
      }

      if (command === 'merge') {
        const wsId = parsed.args ?? store.selectedWorkspaceId;
        if (!wsId) {
          store.setPromptError(
            'No workspace selected. Select one in the Workspaces tab or use: /merge <workspace_id>',
          );
          return;
        }
        try {
          const workspace = workspaceService.get(db, wsId);
          if (!workspace) {
            store.setPromptError(`Workspace not found: ${wsId}`);
            return;
          }
          if (workspace.status !== 'active') {
            store.setPromptError(
              `Cannot merge: workspace status is '${workspace.status}' (must be active)`,
            );
            return;
          }
          if (!workspace.pr_url) {
            store.setPromptError('Cannot merge: workspace has no PR URL');
            return;
          }
          store.setPromptSuccess('Checking PR status...');
          const prUrl = workspace.pr_url;
          const wfId = workspace.workflow_id;
          Promise.resolve().then(async () => {
            try {
              const status = prService.checkPrStatus(prUrl);
              if (!status.merged) {
                store.setPromptError(`PR is not merged (state: ${status.state})`);
                return;
              }
              await prService.completeMerge(db, wsId, status.mergeCommit ?? '');
              // Check if all workspaces for this workflow are now merged
              const remaining = workspaceService.list(db, wfId, 'active');
              if (remaining.length === 0) {
                workflowService.updateStatus(db, wfId, 'completed');
                store.setPromptSuccess('Workspace merged — workflow completed');
              } else {
                store.setPromptSuccess(`Workspace merged (${remaining.length} still active)`);
              }
              store.triggerRefresh();
            } catch (err) {
              store.setPromptError(
                `Merge failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          });
        } catch (err) {
          store.setPromptError(`Merge failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }
    },
    [exit, db, sessionInfo],
  );
}
