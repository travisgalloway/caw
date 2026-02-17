import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { DatabaseType } from '@caw/core';
import { workflowService } from '@caw/core';
import { DEFAULT_PORT } from '@caw/mcp-server';
import {
  buildMcpConfigFile,
  buildPlannerSystemPrompt,
  type ClaudeMessage,
  cleanEnvForSpawn,
  cleanupMcpConfigFile,
  WorkflowSpawner,
} from '@caw/spawner';

export interface RunOptions {
  workflowId?: string;
  prompt?: string;
  maxAgents?: number;
  model?: string;
  permissionMode?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  watch?: boolean;
  detach?: boolean;
  port?: number;
  cwd?: string;
}

export async function runWorkflow(db: DatabaseType, options: RunOptions): Promise<void> {
  const workflowId = options.workflowId;
  const port = options.port ?? DEFAULT_PORT;
  const cwd = options.cwd ?? process.cwd();

  if (!workflowId && !options.prompt) {
    console.error('Error: Either a workflow ID or --prompt is required.');
    console.error('Usage: caw run <workflow_id> [options]');
    console.error('       caw run --prompt "..." [options]');
    process.exit(1);
  }

  let resolvedWorkflowId = workflowId;

  // Phase 1: If --prompt is provided, create and plan a workflow
  if (options.prompt && !resolvedWorkflowId) {
    console.log('Creating workflow from prompt...');
    const workflow = workflowService.create(db, {
      name: options.prompt.slice(0, 80),
      source_type: 'prompt',
      source_content: options.prompt,
    });
    resolvedWorkflowId = workflow.id;
    console.log(`Created workflow: ${workflow.id}`);

    // Spawn a planner agent to create the plan
    console.log('Spawning planner agent...');
    const plannerPrompt = buildPlannerSystemPrompt(workflow.id, options.prompt);
    const mcpServerUrl = `http://localhost:${port}/mcp`;
    const mcpConfigPath = buildMcpConfigFile(mcpServerUrl);

    const args = [
      '-p',
      `Plan this workflow. The workflow ID is ${workflow.id}. User request: ${options.prompt}`,
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
      const proc = spawn('claude', args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: cleanEnvForSpawn(),
      });
      const rl = createInterface({ input: proc.stdout });

      // Capture stderr for debugging
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
    const updated = workflowService.get(db, resolvedWorkflowId);
    if (!updated || (updated.status !== 'ready' && updated.status !== 'in_progress')) {
      console.error(
        `Workflow planning did not complete successfully. Status: ${updated?.status ?? 'not found'}`,
      );
      process.exit(1);
    }
  }

  if (!resolvedWorkflowId) {
    console.error('Error: No workflow ID available.');
    process.exit(1);
  }

  // Validate workflow exists
  const workflow = workflowService.get(db, resolvedWorkflowId);
  if (!workflow) {
    console.error(`Error: Workflow not found: ${resolvedWorkflowId}`);
    process.exit(1);
  }

  const maxAgents = options.maxAgents ?? workflow.max_parallel_tasks ?? 3;
  const permissionMode = (options.permissionMode ?? 'bypassPermissions') as
    | 'acceptEdits'
    | 'bypassPermissions';

  console.log(`Starting workflow: ${workflow.name} (${workflow.id})`);
  console.log(`  Max agents: ${maxAgents}`);
  console.log(`  Model: ${options.model ?? 'claude-sonnet-4-5'}`);
  console.log(`  Permission mode: ${permissionMode}`);

  const spawner = new WorkflowSpawner(db, {
    workflowId: resolvedWorkflowId,
    maxAgents,
    model: options.model ?? 'claude-sonnet-4-5',
    permissionMode,
    maxTurns: options.maxTurns ?? 50,
    maxBudgetUsd: options.maxBudgetUsd,
    mcpServerUrl: `http://localhost:${port}/mcp`,
    cwd,
  });

  // Set up event handlers
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

    spawner.on('workflow_stalled', (data) => {
      console.warn(`[workflow] Stalled: ${data.reason}`);
    });
  }

  // Start execution
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
}
