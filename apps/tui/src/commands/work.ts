import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { DatabaseType } from '@caw/core';
import { createWorktree, removeWorktree, workflowService, workspaceService } from '@caw/core';
import { DEFAULT_PORT } from '@caw/mcp-server';
import {
  buildMcpConfigFile,
  buildWorkPlannerPrompt,
  type ClaudeMessage,
  cleanEnvForSpawn,
  cleanupMcpConfigFile,
  WorkflowSpawner,
} from '@caw/spawner';

export interface WorkOptions {
  issues: string[];
  maxAgents?: number;
  model?: string;
  permissionMode?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  watch?: boolean;
  detach?: boolean;
  port?: number;
  cwd?: string;
  branch?: string;
}

interface GhIssue {
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string }>;
}

function normalizeIssueNumber(input: string): number {
  // Handle "#123" or "123"
  const stripped = input.replace(/^#/, '');
  const asNumber = Number(stripped);
  if (!Number.isNaN(asNumber) && asNumber > 0) {
    return asNumber;
  }

  // Handle full GitHub URL: https://github.com/owner/repo/issues/123
  const urlMatch = input.match(/\/issues\/(\d+)/);
  if (urlMatch) {
    return Number(urlMatch[1]);
  }

  throw new Error(`Invalid issue reference: ${input}`);
}

function getRepoFullName(): string {
  const result = execFileSync(
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
    {
      encoding: 'utf-8',
      timeout: 10_000,
    },
  );
  return result.trim();
}

function fetchIssue(issueNumber: number): GhIssue {
  const result = execFileSync(
    'gh',
    ['issue', 'view', String(issueNumber), '--json', 'number,title,body,labels'],
    { encoding: 'utf-8', timeout: 15_000 },
  );
  return JSON.parse(result);
}

interface WorktreeRecord {
  issueNumber: number;
  branch: string;
  path: string;
  workspaceId: string;
}

export async function runWork(db: DatabaseType, options: WorkOptions): Promise<void> {
  const port = options.port ?? DEFAULT_PORT;
  const cwd = options.cwd ?? process.cwd();

  if (options.issues.length === 0) {
    console.error('Error: At least one issue is required.');
    console.error('Usage: caw work <issues...> [options]');
    process.exit(1);
  }

  // 1. Parse and normalize issue numbers
  const issueNumbers = options.issues.map(normalizeIssueNumber);
  console.log(`Fetching ${issueNumbers.length} issue(s)...`);

  // 2. Resolve repo name
  const repoFullName = getRepoFullName();
  console.log(`Repository: ${repoFullName}`);

  // 3. Fetch issue details
  const issues: GhIssue[] = [];
  for (const num of issueNumbers) {
    try {
      const issue = fetchIssue(num);
      issues.push(issue);
      console.log(`  #${issue.number}: ${issue.title}`);
    } catch (err) {
      console.error(
        `Error fetching issue #${num}: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  }

  // 4. Create per-issue worktrees
  const baseBranch = execFileSync('git', ['branch', '--show-current'], {
    encoding: 'utf-8',
  }).trim();
  // 5. Create workflow (before worktrees, so we have the workflow ID for workspaces)
  const issueContext = issues
    .map((i) => {
      const labels = i.labels.map((l) => l.name);
      const labelStr = labels.length > 0 ? ` [${labels.join(', ')}]` : '';
      return `### Issue #${i.number}: ${i.title}${labelStr}\n${i.body ?? 'No description.'}`;
    })
    .join('\n\n');

  const workflowName =
    issues.length === 1
      ? `Work on #${issues[0].number}: ${issues[0].title}`.slice(0, 80)
      : `Work on ${issues.map((i) => `#${i.number}`).join(', ')}`.slice(0, 80);

  const workflow = workflowService.create(db, {
    name: workflowName,
    source_type: 'github_issue',
    source_content: JSON.stringify(issues),
  });
  console.log(`Created workflow: ${workflow.id}`);

  // 5b. Create worktrees and workspace records
  const worktreeRecords: WorktreeRecord[] = [];
  for (const issue of issues) {
    const branch = options.branch
      ? `${options.branch}-${issue.number}`
      : `caw/issue-${issue.number}`;
    try {
      const worktreePath = await createWorktree(cwd, branch, baseBranch);
      const workspace = workspaceService.create(db, {
        workflowId: workflow.id,
        path: worktreePath,
        branch,
        baseBranch,
        repositoryPath: cwd,
      });
      worktreeRecords.push({
        issueNumber: issue.number,
        branch,
        path: worktreePath,
        workspaceId: workspace.id,
      });
      console.log(`  Worktree for #${issue.number}: ${worktreePath} (branch: ${branch})`);
    } catch (err) {
      console.error(
        `Error creating worktree for #${issue.number}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Clean up already-created worktrees
      for (const record of worktreeRecords) {
        try {
          await removeWorktree(record.path, cwd);
        } catch {
          /* best effort */
        }
      }
      process.exit(1);
    }
  }

  // 6. Spawn planner agent
  console.log('Spawning planner agent...');
  const defaultBranch = worktreeRecords[0]?.branch ?? baseBranch;
  const plannerPrompt = buildWorkPlannerPrompt({
    workflowId: workflow.id,
    issues: issues.map((i) => {
      const record = worktreeRecords.find((r) => r.issueNumber === i.number);
      return {
        number: i.number,
        title: i.title,
        body: i.body ?? '',
        labels: i.labels.map((l) => l.name),
        workspaceId: record?.workspaceId,
        branch: record?.branch,
      };
    }),
    branch: defaultBranch,
    repoFullName,
  });

  const mcpServerUrl = `http://localhost:${port}/mcp`;
  const mcpConfigPath = buildMcpConfigFile(mcpServerUrl);

  const plannerArgs = [
    '-p',
    `Plan the implementation for this workflow. The workflow ID is ${workflow.id}. Analyze the GitHub issue(s) and create a structured plan with tasks.`,
    '--append-system-prompt',
    plannerPrompt,
    '--mcp-config',
    mcpConfigPath,
    '--output-format',
    'stream-json',
    '--verbose',
    '--no-session-persistence',
    '--model',
    options.model ?? 'claude-sonnet-4-5',
    '--max-turns',
    '30',
    '--dangerously-skip-permissions',
  ];

  try {
    const proc = spawn('claude', plannerArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: cleanEnvForSpawn(),
    });
    const rl = createInterface({ input: proc.stdout });

    const stderrChunks: string[] = [];
    const stderrRl = createInterface({ input: proc.stderr });
    stderrRl.on('line', (line) => stderrChunks.push(line));

    for await (const line of rl) {
      try {
        const msg: ClaudeMessage = JSON.parse(line);
        if (msg.type === 'assistant') {
          process.stdout.write('.');
        }
        if (msg.type === 'result') {
          console.log();
          if (msg.subtype === 'success') {
            console.log('Planning complete.');
          } else {
            const errors = msg.errors as string[] | undefined;
            console.error(
              `Planning failed: ${errors ? errors.join('; ') : (msg.subtype ?? 'unknown')}`,
            );
            if (stderrChunks.length > 0) {
              console.error('Planner stderr:', stderrChunks.join('\n'));
            }
            process.exit(1);
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('close', (code) => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
      console.error(`Planner exited with code ${exitCode}`);
      if (stderrChunks.length > 0) {
        console.error('Planner stderr:', stderrChunks.join('\n'));
      }
      process.exit(1);
    }
  } finally {
    cleanupMcpConfigFile(mcpConfigPath);
  }

  // Verify the workflow is ready
  const updated = workflowService.get(db, workflow.id);
  if (!updated || (updated.status !== 'ready' && updated.status !== 'in_progress')) {
    console.error(
      `Workflow planning did not complete successfully. Status: ${updated?.status ?? 'not found'}`,
    );
    process.exit(1);
  }

  // 7. Spawn workers via WorkflowSpawner
  const maxAgents = options.maxAgents ?? updated.max_parallel_tasks ?? 3;
  const permissionMode = (options.permissionMode ?? 'bypassPermissions') as
    | 'acceptEdits'
    | 'bypassPermissions';

  console.log(`Starting execution: ${workflowName}`);
  console.log(`  Max agents: ${maxAgents}`);
  console.log(`  Model: ${options.model ?? 'claude-sonnet-4-5'}`);
  console.log(`  Worktrees: ${worktreeRecords.length}`);

  const spawner = new WorkflowSpawner(db, {
    workflowId: workflow.id,
    maxAgents,
    model: options.model ?? 'claude-sonnet-4-5',
    permissionMode,
    maxTurns: options.maxTurns ?? 50,
    maxBudgetUsd: options.maxBudgetUsd,
    mcpServerUrl,
    cwd,
    branch: defaultBranch,
    issueContext,
  });

  if (options.watch !== false) {
    spawner.on('agent_started', (data) => {
      console.log(`[agent] Started: ${data.agentId} → task ${data.taskId}`);
    });

    spawner.on('agent_completed', (data) => {
      console.log(`[agent] Completed: ${data.agentId} → task ${data.taskId}`);
      const status = spawner.getStatus();
      console.log(
        `  Progress: ${status.progress.completed}/${status.progress.totalTasks} tasks complete`,
      );
    });

    spawner.on('agent_failed', (data) => {
      console.error(`[agent] Failed: ${data.agentId} → task ${data.taskId}: ${data.error}`);
    });

    spawner.on('agent_retrying', (data) => {
      console.log(
        `[agent] Retrying: ${data.agentId} → task ${data.taskId} (attempt ${data.attempt})`,
      );
    });

    spawner.on('agent_query', (data) => {
      console.log(`[agent] Question from ${data.agentId}: ${data.message}`);
      console.log('  Reply via TUI: /reply <your answer> on the message detail screen');
    });

    spawner.on('workflow_stalled', (data) => {
      console.warn(`[workflow] Stalled: ${data.reason}`);
    });
  }

  const result = await spawner.start();
  if (!result.success) {
    console.error(`Failed to start workflow: ${result.error}`);
    process.exit(1);
  }

  console.log(`Spawned ${result.agentHandles.length} agent(s)`);

  if (options.detach) {
    console.log('Running in background. Use workflow_execution_status to check progress.');
    return;
  }

  // Wait for completion
  await new Promise<void>((resolve) => {
    spawner.on('workflow_all_complete', () => {
      console.log('Workflow completed successfully.');
      resolve();
    });

    spawner.on('workflow_failed', (data) => {
      console.error(`Workflow failed: ${data.error}`);
      resolve();
    });

    spawner.on('workflow_stalled', () => {
      console.warn('Workflow stalled. Shutting down...');
      spawner.shutdown().then(resolve);
    });
  });

  await spawner.shutdown();

  // Clean up worktrees (best effort — PRs already pushed)
  for (const record of worktreeRecords) {
    try {
      await removeWorktree(record.path, cwd);
      workspaceService.update(db, record.workspaceId, { status: 'merged' });
      console.log(`  Cleaned up worktree: ${record.path}`);
    } catch {
      // Worktree may have already been removed or has uncommitted changes
    }
  }
}
