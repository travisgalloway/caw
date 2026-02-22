import {
  type CycleMode,
  loadConfig,
  lockService,
  messageService,
  prService,
  resolveCycleMode,
  workflowService,
  workspaceService,
} from '@caw/core';
import type { PermissionMode } from '@caw/spawner';
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
        if (!sessionInfo?.port) {
          store.setPromptError('No active server session — cannot resume');
          return;
        }
        try {
          const workflow = workflowService.get(db, wfId);
          if (!workflow) {
            store.setPromptError(`Workflow not found: ${wfId}`);
            return;
          }
          const resumableStatuses = ['paused', 'failed', 'ready', 'in_progress', 'awaiting_merge'];
          if (!resumableStatuses.includes(workflow.status)) {
            store.setPromptError(
              `Cannot resume: workflow status is '${workflow.status}' (must be paused, failed, ready, in_progress, or awaiting_merge)`,
            );
            return;
          }
          const port = sessionInfo.port;

          // For awaiting_merge, run the PR cycle directly instead of spawning agents
          if (workflow.status === 'awaiting_merge') {
            store.setPromptSuccess(`Running PR cycle for ${wfId}...`);
            Promise.resolve().then(async () => {
              try {
                const { runCycle } = await import('../commands/pr');
                await runCycle(db, {
                  subcommand: 'cycle',
                  workflowId: wfId,
                  repoPath: process.cwd(),
                  port,
                });
                store.triggerRefresh();
              } catch (err) {
                store.setPromptError(
                  `Cycle error: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            });
            return;
          }

          // Transition to in_progress if not already there
          if (workflow.status !== 'in_progress') {
            workflowService.updateStatus(db, wfId, 'in_progress');
          }
          // Start a WorkflowRunner for this workflow
          Promise.resolve().then(async () => {
            try {
              const { getSpawner, WorkflowRunner } = await import('@caw/spawner');
              if (getSpawner(wfId)) return; // Already running

              // Read persisted config from workflow
              let model = 'claude-sonnet-4-5';
              let permissionMode: PermissionMode = 'bypassPermissions';
              let maxTurns = 50;
              let maxBudgetUsd: number | undefined;
              let ephemeralWorktree = false;
              try {
                const cfg = workflow.config ? JSON.parse(workflow.config) : {};
                const saved = cfg.spawner_config;
                if (saved) {
                  model = saved.model ?? model;
                  permissionMode = (saved.permission_mode as PermissionMode) ?? permissionMode;
                  maxTurns = saved.max_turns ?? maxTurns;
                  maxBudgetUsd = saved.max_budget_usd ?? undefined;
                  ephemeralWorktree = saved.ephemeral_worktree ?? false;
                }
              } catch {
                // Use defaults
              }

              const { createPrCycleHook } = await import('../utils/create-pr-cycle-hook');
              const maxAgents = workflow.max_parallel_tasks ?? 3;
              const runner = new WorkflowRunner(db, {
                spawnerConfig: {
                  workflowId: wfId,
                  maxAgents,
                  model,
                  permissionMode,
                  maxTurns,
                  maxBudgetUsd,
                  ephemeralWorktree,
                  mcpServerUrl: `http://localhost:${port}/mcp`,
                  cwd: process.cwd(),
                },
                postCompletionHook: createPrCycleHook(db, {
                  repoPath: process.cwd(),
                  port,
                  model,
                }),
              });
              const result = await runner.run();
              if (result.outcome === 'failed') {
                console.error(`[resume] Workflow failed: ${result.error}`);
              }
              store.triggerRefresh();
            } catch (err) {
              console.error(
                `[resume] Spawner error: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          });
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
        const issues = parsed.args.split(/\s+/).filter(Boolean);
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

      if (command === 'cycle') {
        const wfId = getWorkflowId(store);
        if (!wfId) {
          store.setPromptError('Navigate to a workflow first');
          return;
        }
        const validModes: CycleMode[] = ['auto', 'hitl', 'off'];
        const args = parsed.args?.trim();

        if (!args) {
          // Show current resolved cycle mode
          try {
            const workflow = workflowService.get(db, wfId);
            const workspaces = workspaceService.list(db, wfId);
            const activeWs = workspaces.find((ws) => ws.status === 'active') ?? workspaces[0];
            const fileConfig = loadConfig().config;
            const resolved = resolveCycleMode(undefined, activeWs, workflow, fileConfig);

            // Determine which level it came from
            let source = 'default';
            const parseConfig = (cfg: string | null | undefined) => {
              if (!cfg) return undefined;
              try {
                return JSON.parse(cfg)?.pr?.cycle;
              } catch {
                return undefined;
              }
            };
            if (activeWs && parseConfig(activeWs.config)) {
              source = 'workspace';
            } else if (workflow && parseConfig(workflow.config)) {
              source = 'workflow';
            } else if (fileConfig?.pr?.cycle) {
              source = 'config';
            }

            store.setPromptSuccess(`Cycle mode: ${resolved} (${source})`);
          } catch (err) {
            store.setPromptError(
              `Failed to resolve cycle mode: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          return;
        }

        // Check for "workspace <mode>" variant
        const parts = args.split(/\s+/);
        if (parts[0] === 'workspace') {
          const mode = parts[1] as CycleMode;
          if (!mode || !validModes.includes(mode)) {
            store.setPromptError(`Usage: /cycle workspace auto|hitl|off`);
            return;
          }
          const wsId = store.selectedWorkspaceId;
          if (!wsId) {
            store.setPromptError('No workspace selected. Select one in the Workspaces tab first.');
            return;
          }
          try {
            workspaceService.update(db, wsId, {
              config: { pr: { cycle: mode } },
            });
            store.setPromptSuccess(`Workspace cycle mode set to: ${mode}`);
            store.triggerRefresh();
          } catch (err) {
            store.setPromptError(
              `Failed to set workspace cycle mode: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          return;
        }

        // Set workflow-level cycle mode
        const mode = parts[0] as CycleMode;
        if (!validModes.includes(mode)) {
          store.setPromptError(`Invalid cycle mode: ${mode}. Use auto, hitl, or off`);
          return;
        }
        try {
          workflowService.patchConfig(db, wfId, { pr: { cycle: mode } });
          store.setPromptSuccess(`Workflow cycle mode set to: ${mode}`);
          store.triggerRefresh();
        } catch (err) {
          store.setPromptError(
            `Failed to set cycle mode: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        return;
      }

      if (command === 'max-agents') {
        const n = Number(parsed.args);
        if (!parsed.args || Number.isNaN(n) || n < 1 || !Number.isInteger(n)) {
          store.setPromptError('Usage: /max-agents <number>');
          return;
        }
        const wfId = getWorkflowId(store);
        if (!wfId) {
          store.setPromptError('Navigate to a workflow first');
          return;
        }
        try {
          // Always persist to DB
          workflowService.setParallelism(db, wfId, n);
          // Also update live spawner pool if one is running
          import('@caw/spawner')
            .then(({ getSpawner }) => {
              const spawner = getSpawner(wfId);
              if (spawner) {
                spawner.setMaxAgents(n);
              }
            })
            .catch(() => {});
          store.setPromptSuccess(`Set max agents to ${n}`);
          store.triggerRefresh();
        } catch (err) {
          store.setPromptError(`Failed: ${err instanceof Error ? err.message : String(err)}`);
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
                baseBranch: workspace.base_branch ?? 'main',
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
              await prService.completeMerge(db, wsId, status.mergeCommit ?? '', workspace.path);
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
