import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { DatabaseType } from '@caw/core';
import { prService, workflowService, workspaceService } from '@caw/core';
import {
  buildMcpConfigFile,
  buildRebaseAgentPrompt,
  cleanEnvForSpawn,
  cleanupMcpConfigFile,
} from '@caw/spawner';

export interface PrOptions {
  subcommand: string;
  workflowId?: string;
  repoPath: string;
  prUrl?: string;
  mergeCommit?: string;
  model?: string;
  port?: number;
}

export interface SpawnRebaseOptions {
  workspaceId: string;
  worktreePath: string;
  branch: string;
  baseBranch: string;
  prUrl: string;
  port?: number;
  model?: string;
  onProgress?: (event: 'start' | 'tick' | 'error' | 'done', message?: string) => void;
}

export async function runPr(db: DatabaseType, options: PrOptions): Promise<void> {
  const { subcommand, workflowId, repoPath } = options;

  if (subcommand === 'list') {
    const { workflows } = workflowService.list(db, { status: 'awaiting_merge' });
    if (workflows.length === 0) {
      console.log('No workflows awaiting merge.');
      return;
    }
    for (const wf of workflows) {
      console.log(`${wf.id}  ${wf.name}  (${wf.status})`);
      const workspaces = prService.listAwaitingMerge(db, wf.id);
      for (const ws of workspaces) {
        console.log(`  ${ws.id}  ${ws.branch}  PR: ${ws.pr_url ?? 'none'}`);
      }
    }
    return;
  }

  if (subcommand === 'check') {
    const wfId = workflowId;
    const allWorkflows = wfId
      ? workflowService.list(db, {}).workflows.filter((w) => w.id === wfId)
      : workflowService.list(db, { status: 'awaiting_merge' }).workflows;

    let totalMerged = 0;
    let totalOpen = 0;

    for (const wf of allWorkflows) {
      const workspaces = prService.listAwaitingMerge(db, wf.id);
      for (const ws of workspaces) {
        if (!ws.pr_url) continue;
        try {
          const status = prService.checkPrStatus(ws.pr_url);
          if (status.merged && status.mergeCommit) {
            await prService.completeMerge(db, ws.id, status.mergeCommit, repoPath);
            console.log(`  Merged: ${ws.branch} (${ws.pr_url})`);
            totalMerged++;
          } else {
            console.log(`  Open: ${ws.branch} (${status.state}, ${status.mergeable})`);
            totalOpen++;
          }
        } catch (err) {
          console.error(`  Error checking ${ws.pr_url}: ${err}`);
          totalOpen++;
        }
      }

      // If all PRs merged, complete the workflow
      if (totalMerged > 0 && totalOpen === 0) {
        try {
          workflowService.updateStatus(db, wf.id, 'completed');
          console.log(`Workflow ${wf.id} completed.`);
        } catch {
          // May already be completed
        }
      }
    }

    console.log(
      `\nChecked: ${totalMerged + totalOpen}, Merged: ${totalMerged}, Open: ${totalOpen}`,
    );
    return;
  }

  if (subcommand === 'merge') {
    if (!workflowId) {
      console.error('Usage: caw pr merge <workspace_id|workflow_id>');
      return;
    }

    // Try as workspace first, then workflow
    const workspace = workspaceService.get(db, workflowId);
    if (workspace) {
      const prUrl = options.prUrl ?? workspace.pr_url;
      if (!prUrl) {
        console.error('No PR URL. Provide --pr-url or set it on the workspace first.');
        return;
      }

      // Update pr_url if provided
      if (options.prUrl && options.prUrl !== workspace.pr_url) {
        workspaceService.update(db, workspace.id, { prUrl: options.prUrl });
      }

      let mergeCommit = options.mergeCommit;
      if (!mergeCommit) {
        const status = prService.checkPrStatus(prUrl);
        if (!status.merged) {
          console.error(`PR is not merged (state: ${status.state})`);
          return;
        }
        mergeCommit = status.mergeCommit;
      }

      if (!mergeCommit) {
        console.error('Could not determine merge commit SHA. Provide --merge-commit.');
        return;
      }

      await prService.completeMerge(db, workspace.id, mergeCommit, repoPath);
      console.log(`Workspace ${workspace.id} marked as merged.`);

      // Check if all workspaces merged
      const remaining = workspaceService.list(db, workspace.workflow_id, 'active');
      if (remaining.length === 0) {
        try {
          workflowService.updateStatus(db, workspace.workflow_id, 'completed');
          console.log(`Workflow ${workspace.workflow_id} completed.`);
        } catch {
          // May already be completed
        }
      }
    } else {
      // Treat as workflow ID — merge all
      const workspaces = prService.listAwaitingMerge(db, workflowId);
      if (workspaces.length === 0) {
        console.error('No active workspaces with PR URLs found.');
        return;
      }
      for (const ws of workspaces) {
        if (!ws.pr_url) continue;
        try {
          const status = prService.checkPrStatus(ws.pr_url);
          if (status.merged && status.mergeCommit) {
            await prService.completeMerge(db, ws.id, status.mergeCommit, repoPath);
            console.log(`  Merged: ${ws.branch}`);
          }
        } catch (err) {
          console.error(`  Error: ${ws.branch}: ${err}`);
        }
      }
    }
    return;
  }

  if (subcommand === 'rebase') {
    if (!workflowId) {
      console.error('Usage: caw pr rebase <workspace_id|workflow_id>');
      return;
    }

    const workspace = workspaceService.get(db, workflowId);
    const workspaces: Array<{
      id: string;
      workflow_id: string;
      branch: string;
      path: string;
      pr_url: string | null;
    }> = [];

    if (workspace) {
      workspaces.push(workspace);
    } else {
      const all = workspaceService.list(db, workflowId, 'active');
      workspaces.push(...all);
    }

    for (const ws of workspaces) {
      if (!ws.pr_url) continue;
      try {
        const status = prService.checkPrStatus(ws.pr_url);
        if (status.merged) {
          console.log(`  Skipping ${ws.branch} — already merged`);
          continue;
        }
        if (status.mergeable !== 'CONFLICTING') {
          console.log(`  Skipping ${ws.branch} — no conflicts (${status.mergeable})`);
          continue;
        }
        console.log(`  Rebasing ${ws.branch}...`);
        await spawnRebaseAgent({
          workspaceId: ws.id,
          worktreePath: ws.path,
          branch: ws.branch,
          baseBranch: 'main',
          prUrl: ws.pr_url,
          port: options.port,
          model: options.model,
          onProgress: (event, message) => {
            if (event === 'done') console.log(`  Rebase complete: ${ws.branch}`);
            if (event === 'error') console.error(`  Rebase failed: ${message}`);
          },
        });
      } catch (err) {
        console.error(`  Error rebasing ${ws.branch}: ${err}`);
      }
    }
    return;
  }

  console.error(`Unknown pr subcommand: ${subcommand}`);
}

export async function spawnRebaseAgent(options: SpawnRebaseOptions): Promise<void> {
  const { workspaceId, worktreePath, branch, baseBranch, prUrl, port, model, onProgress } = options;

  const prompt = buildRebaseAgentPrompt({ workspaceId, worktreePath, branch, baseBranch, prUrl });

  let mcpConfigPath: string | undefined;
  if (port) {
    mcpConfigPath = buildMcpConfigFile(`http://localhost:${port}/mcp`);
  }

  const args = [
    '-p',
    prompt,
    '--model',
    model ?? 'claude-sonnet-4-5',
    '--output-format',
    'stream-json',
    '--verbose',
    '--no-session-persistence',
    '--dangerously-skip-permissions',
  ];

  if (mcpConfigPath) {
    args.push('--mcp-config', mcpConfigPath);
  }

  onProgress?.('start');

  return new Promise<void>((resolve, reject) => {
    const proc = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: cleanEnvForSpawn(),
      cwd: worktreePath,
    });

    if (!proc.stdout) {
      reject(new Error('Failed to get stdout from claude process'));
      return;
    }
    const rl = createInterface({ input: proc.stdout });

    rl.on('line', () => {
      onProgress?.('tick');
    });

    proc.on('close', (code) => {
      if (mcpConfigPath) cleanupMcpConfigFile(mcpConfigPath);
      if (code === 0) {
        onProgress?.('done');
        resolve();
      } else {
        const msg = `claude process exited with code ${code}`;
        onProgress?.('error', msg);
        reject(new Error(msg));
      }
    });

    proc.on('error', (err) => {
      if (mcpConfigPath) cleanupMcpConfigFile(mcpConfigPath);
      onProgress?.('error', err.message);
      reject(err);
    });
  });
}
