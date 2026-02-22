import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { CycleMode, DatabaseType, MergeMethod } from '@caw/core';
import {
  loadConfig,
  prService,
  resolveCycleMode,
  workflowService,
  workspaceService,
} from '@caw/core';
import {
  buildMcpConfigFile,
  buildRebaseAgentPrompt,
  buildReviewAgentPrompt,
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
  cycle?: CycleMode;
  noReview?: boolean;
  dryRun?: boolean;
  mergeMethod?: MergeMethod;
  ciTimeout?: number;
  ciPoll?: number;
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
  const { subcommand, workflowId } = options;

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
      let wfMerged = 0;
      let wfOpen = 0;
      const workspaces = prService.listAwaitingMerge(db, wf.id);
      for (const ws of workspaces) {
        if (!ws.pr_url) continue;
        try {
          const status = prService.checkPrStatus(ws.pr_url);
          if (status.merged && status.mergeCommit) {
            await prService.completeMerge(db, ws.id, status.mergeCommit, ws.path);
            console.log(`  Merged: ${ws.branch} (${ws.pr_url})`);
            wfMerged++;
          } else {
            console.log(`  Open: ${ws.branch} (${status.state}, ${status.mergeable})`);
            wfOpen++;
          }
        } catch (err) {
          console.error(`  Error checking ${ws.pr_url}: ${err}`);
          wfOpen++;
        }
      }

      totalMerged += wfMerged;
      totalOpen += wfOpen;

      // If all PRs merged for this workflow, complete it
      if (wfMerged > 0 && wfOpen === 0) {
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

      await prService.completeMerge(db, workspace.id, mergeCommit, workspace.path);
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
            await prService.completeMerge(db, ws.id, status.mergeCommit, ws.path);
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
      base_branch: string | null;
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
          baseBranch: ws.base_branch ?? 'main',
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

  if (subcommand === 'cycle') {
    await runCycle(db, options);
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

interface ReviewVerdict {
  action: 'approve' | 'request_changes';
  reason?: string;
}

export async function spawnReviewAgent(options: {
  worktreePath: string;
  branch: string;
  baseBranch: string;
  prUrl: string;
  model?: string;
}): Promise<ReviewVerdict> {
  const { worktreePath, branch, baseBranch, prUrl, model } = options;
  const prompt = buildReviewAgentPrompt({ worktreePath, branch, baseBranch, prUrl });

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

  return new Promise<ReviewVerdict>((resolve, reject) => {
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
    let resultContent = '';

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'result' && msg.result) {
          resultContent = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result);
        }
      } catch {
        // Skip non-JSON lines
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Review agent exited with code ${code}`));
        return;
      }

      // Try to extract JSON verdict from the result content
      const jsonMatch = resultContent.match(/\{[^{}]*"action"\s*:\s*"[^"]+?"[^{}]*\}/);
      if (jsonMatch) {
        try {
          const verdict = JSON.parse(jsonMatch[0]) as ReviewVerdict;
          resolve(verdict);
          return;
        } catch {
          // Fall through
        }
      }

      // Default to request_changes if we couldn't parse a verdict — fail safe
      resolve({ action: 'request_changes', reason: 'Failed to parse review verdict' });
    });

    proc.on('error', (err) => reject(err));
  });
}

export async function waitForCi(
  prUrl: string,
  timeoutSecs: number,
  pollIntervalSecs: number,
): Promise<{ passed: boolean; summary?: string }> {
  const deadline = Date.now() + timeoutSecs * 1000;

  while (Date.now() < deadline) {
    try {
      const raw = execFileSync('gh', ['pr', 'checks', prUrl, '--json', 'name,state,bucket'], {
        encoding: 'utf-8',
        timeout: 30_000,
      }).trim();

      const checks: Array<{ name: string; state: string; bucket: string }> = JSON.parse(raw);

      if (checks.length === 0) {
        return { passed: true, summary: 'No CI checks configured' };
      }

      const allComplete = checks.every((c) => c.state !== 'PENDING');
      if (allComplete) {
        const allPassed = checks.every((c) => c.bucket === 'pass');
        if (allPassed) {
          return { passed: true, summary: `${checks.length} check(s) passed` };
        }
        const failed = checks.filter((c) => c.bucket !== 'pass');
        return {
          passed: false,
          summary: `Failed: ${failed.map((c) => `${c.name} (${c.state})`).join(', ')}`,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "no checks" or "no commit" are expected early on — wait and retry
      if (/no checks|no commit|could not find/i.test(msg)) {
        // Expected: checks not reported yet
      } else {
        return { passed: false, summary: `CI check error: ${msg}` };
      }
    }

    await new Promise((r) => setTimeout(r, pollIntervalSecs * 1000));
  }

  return { passed: false, summary: 'CI timeout' };
}

export function ghMerge(
  prUrl: string,
  method: MergeMethod = 'squash',
): { success: boolean; sha?: string; error?: string } {
  const methodFlag = `--${method}`;
  try {
    execFileSync('gh', ['pr', 'merge', prUrl, methodFlag], {
      encoding: 'utf-8',
      timeout: 60_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Check if the merge actually went through despite the error
    try {
      const raw = execFileSync('gh', ['pr', 'view', prUrl, '--json', 'state,mergeCommit'], {
        encoding: 'utf-8',
        timeout: 15_000,
      }).trim();
      const data = JSON.parse(raw);
      if (data.state === 'MERGED') {
        return { success: true, sha: data.mergeCommit?.oid };
      }
    } catch {
      // Fall through to return original error
    }
    return { success: false, error: msg };
  }

  // Get merge commit SHA
  try {
    const raw = execFileSync('gh', ['pr', 'view', prUrl, '--json', 'mergeCommit'], {
      encoding: 'utf-8',
      timeout: 15_000,
    }).trim();
    const data = JSON.parse(raw);
    return { success: true, sha: data.mergeCommit?.oid };
  } catch {
    return { success: true };
  }
}

interface CycleSummaryEntry {
  branch: string;
  prUrl: string;
  result: 'merged' | 'skipped';
  reason?: string;
}

function promptUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

export async function runCycle(db: DatabaseType, options: PrOptions): Promise<void> {
  // Resolve cycle mode: CLI flag > workspace > workflow > config > default 'off'
  const config = loadConfig(options.repoPath);
  const targetWorkflow = options.workflowId ? workflowService.get(db, options.workflowId) : null;
  const workspaces = options.workflowId
    ? workspaceService.list(db, options.workflowId, 'active')
    : [];
  const activeWorkspace = workspaces[0] ?? null;
  const mode = resolveCycleMode(options.cycle, activeWorkspace, targetWorkflow, config.config);

  if (mode === 'off') {
    console.log('Cycle mode is off. Use --cycle auto|hitl to enable.');
    return;
  }

  const mergeMethod = options.mergeMethod ?? config.config?.pr?.mergeMethod ?? 'squash';
  const ciTimeout = options.ciTimeout ?? config.config?.pr?.ciTimeout ?? 600;
  const ciPoll = options.ciPoll ?? 30;
  const noReview = options.noReview ?? config.config?.pr?.noReview ?? false;
  const dryRun = options.dryRun ?? false;

  // Check if HITL is possible
  const isTty = process.stdin.isTTY;
  if (mode === 'hitl' && !isTty) {
    console.warn('Warning: stdin is not a TTY. Falling back to auto mode.');
  }
  const effectiveMode = mode === 'hitl' && !isTty ? 'auto' : mode;

  // Find workflows awaiting merge
  const targetWfId = options.workflowId;
  const allWorkflows = targetWfId
    ? (() => {
        const wf = workflowService.get(db, targetWfId);
        return wf ? [wf] : [];
      })()
    : workflowService.list(db, { status: 'awaiting_merge' }).workflows;

  if (allWorkflows.length === 0) {
    console.log('No workflows awaiting merge.');
    return;
  }

  const summary: CycleSummaryEntry[] = [];
  let aborted = false;

  for (const wf of allWorkflows) {
    if (aborted) break;

    console.log(`\nWorkflow: ${wf.name} (${wf.id})`);
    const workspaces = prService.listAwaitingMerge(db, wf.id);

    if (workspaces.length === 0) {
      console.log('  No open PRs.');
      continue;
    }

    for (const ws of workspaces) {
      if (aborted) break;
      if (!ws.pr_url) continue;

      const entry: CycleSummaryEntry = {
        branch: ws.branch,
        prUrl: ws.pr_url,
        result: 'skipped',
      };

      console.log(`\n  PR: ${ws.branch} (${ws.pr_url})`);

      // 1. Check if already merged
      let status: ReturnType<typeof prService.checkPrStatus>;
      try {
        status = prService.checkPrStatus(ws.pr_url);
        if (status.merged) {
          console.log('    Already merged.');
          if (!dryRun && status.mergeCommit) {
            await prService.completeMerge(db, ws.id, status.mergeCommit, ws.path);
          }
          entry.result = 'merged';
          summary.push(entry);
          continue;
        }
      } catch (err) {
        entry.reason = `Status check failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`    ${entry.reason}`);
        summary.push(entry);
        continue;
      }
      if (status.mergeable === 'CONFLICTING') {
        console.log('    Conflicts detected — rebasing...');
        if (dryRun) {
          console.log('    [dry-run] Would spawn rebase agent');
        } else {
          try {
            await spawnRebaseAgent({
              workspaceId: ws.id,
              worktreePath: ws.path,
              branch: ws.branch,
              baseBranch: ws.base_branch ?? 'main',
              prUrl: ws.pr_url,
              port: options.port,
              model: options.model,
              onProgress: (event, message) => {
                if (event === 'done') console.log('    Rebase complete.');
                if (event === 'error') console.error(`    Rebase failed: ${message}`);
              },
            });
          } catch (err) {
            entry.reason = `Rebase failed: ${err instanceof Error ? err.message : String(err)}`;
            console.error(`    ${entry.reason}`);
            summary.push(entry);
            continue;
          }
        }
      }

      // 2. Review (unless --no-review)
      if (!noReview) {
        console.log('    Reviewing...');
        if (dryRun) {
          console.log('    [dry-run] Would spawn review agent');
        } else {
          try {
            const verdict = await spawnReviewAgent({
              worktreePath: ws.path,
              branch: ws.branch,
              baseBranch: ws.base_branch ?? 'main',
              prUrl: ws.pr_url,
              model: options.model,
            });

            if (verdict.action === 'request_changes') {
              entry.reason = `Review: ${verdict.reason ?? 'changes requested'}`;
              console.log(`    ${entry.reason}`);
              summary.push(entry);
              continue;
            }
            console.log('    Review: approved');
          } catch (err) {
            entry.reason = `Review failed: ${err instanceof Error ? err.message : String(err)}`;
            console.error(`    ${entry.reason}`);
            summary.push(entry);
            continue;
          }
        }
      }

      // 3. Wait for CI
      console.log(`    Waiting for CI (timeout: ${ciTimeout}s)...`);
      if (dryRun) {
        console.log('    [dry-run] Would wait for CI');
      } else {
        const ci = await waitForCi(ws.pr_url, ciTimeout, ciPoll);
        if (!ci.passed) {
          entry.reason = `CI: ${ci.summary ?? 'failed'}`;
          console.log(`    ${entry.reason}`);
          summary.push(entry);
          continue;
        }
        console.log(`    CI: ${ci.summary}`);
      }

      // 4. HITL prompt
      if (effectiveMode === 'hitl') {
        const answer = await promptUser(`    Merge PR on ${ws.branch}? [y/n/skip/abort] `);
        if (answer === 'abort') {
          console.log('    Aborting cycle.');
          aborted = true;
          entry.reason = 'User aborted';
          summary.push(entry);
          break;
        }
        if (answer !== 'y' && answer !== 'yes') {
          entry.reason = 'User skipped';
          console.log('    Skipped.');
          summary.push(entry);
          continue;
        }
      }

      // 5. Merge
      console.log(`    Merging (${mergeMethod})...`);
      if (dryRun) {
        console.log('    [dry-run] Would merge PR');
        entry.result = 'merged';
        entry.reason = 'dry-run';
        summary.push(entry);
        continue;
      }

      const mergeResult = ghMerge(ws.pr_url, mergeMethod);
      if (!mergeResult.success) {
        entry.reason = `Merge failed: ${mergeResult.error}`;
        console.error(`    ${entry.reason}`);
        summary.push(entry);
        continue;
      }

      console.log(`    Merged${mergeResult.sha ? ` (${mergeResult.sha.slice(0, 8)})` : ''}`);

      // 6. Complete merge (cleanup workspace + worktree)
      if (mergeResult.sha) {
        await prService.completeMerge(db, ws.id, mergeResult.sha, ws.path);
      } else {
        console.warn('    Warning: merge commit SHA unavailable — skipping workspace cleanup');
      }
      entry.result = 'merged';
      summary.push(entry);

      // 7. Rebase remaining PRs that may now conflict
      const remaining = prService.listAwaitingMerge(db, wf.id);
      for (const rws of remaining) {
        if (!rws.pr_url) continue;
        try {
          const rstatus = prService.checkPrStatus(rws.pr_url);
          if (rstatus.mergeable === 'CONFLICTING') {
            console.log(`    Rebasing ${rws.branch} (conflicts detected)...`);
            await spawnRebaseAgent({
              workspaceId: rws.id,
              worktreePath: rws.path,
              branch: rws.branch,
              baseBranch: rws.base_branch ?? 'main',
              prUrl: rws.pr_url,
              port: options.port,
              model: options.model,
              onProgress: (event, message) => {
                if (event === 'done') console.log(`    Rebase complete: ${rws.branch}`);
                if (event === 'error') console.error(`    Rebase failed: ${message}`);
              },
            });
          }
        } catch {
          // Non-fatal: rebase errors don't stop the cycle
        }
      }
    }

    // Check if all PRs merged
    const stillOpen = prService.listAwaitingMerge(db, wf.id);
    if (stillOpen.length === 0) {
      try {
        workflowService.updateStatus(db, wf.id, 'completed');
        console.log(`  Workflow ${wf.id} completed.`);
      } catch {
        // May already be completed
      }
    }
  }

  // Print summary
  const merged = summary.filter((s) => s.result === 'merged');
  const skipped = summary.filter((s) => s.result === 'skipped');

  console.log(`\n--- Cycle Summary ---`);
  console.log(`Merged: ${merged.length}, Skipped: ${skipped.length}`);
  for (const s of skipped) {
    console.log(`  Skipped: ${s.branch} — ${s.reason}`);
  }
}
