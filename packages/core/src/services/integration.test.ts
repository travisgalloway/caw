import { beforeEach, describe, expect, it } from 'bun:test';
import type { DatabaseType } from '../db/connection';
import { createConnection } from '../db/connection';
import { runMigrations } from '../db/migrations';
import type { Task } from '../types/task';
import * as agentService from './agent.service';
import * as contextService from './context.service';
import * as lockService from './lock.service';
import * as messageService from './message.service';
import * as orchestrationService from './orchestration.service';
import * as sessionService from './session.service';
import * as taskService from './task.service';
import * as templateService from './template.service';
import * as workflowService from './workflow.service';

function getTasks(db: DatabaseType, workflowId: string): Task[] {
  return db
    .prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY sequence, name')
    .all(workflowId) as Task[];
}

describe('cross-service integration', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createConnection(':memory:');
    runMigrations(db);
  });

  // --- 1. Full Workflow Lifecycle ---

  describe('workflow lifecycle', () => {
    it('creates workflow -> sets plan -> starts -> claims tasks -> completes tasks -> completes workflow', () => {
      // Create workflow
      const wf = workflowService.create(db, {
        name: 'Lifecycle Test',
        source_type: 'issue',
        source_content: 'Build a feature end to end',
      });
      expect(wf.status).toBe('planning');

      // Set plan with 3 tasks: A, B depends on A, C depends on B
      const planResult = workflowService.setPlan(db, wf.id, {
        summary: 'Three sequential tasks',
        tasks: [
          { name: 'Task A', description: 'First task' },
          { name: 'Task B', description: 'Second task', depends_on: ['Task A'] },
          { name: 'Task C', description: 'Third task', depends_on: ['Task B'] },
        ],
      });
      expect(planResult.tasks_created).toBe(3);
      expect(planResult.status).toBe('ready');

      const tasks = getTasks(db, wf.id);
      expect(tasks).toHaveLength(3);
      const [taskA, taskB, taskC] = tasks;

      // Verify workflow transitioned to ready
      const wfReady = workflowService.get(db, wf.id);
      expect(wfReady?.status).toBe('ready');

      // Start workflow (ready -> in_progress)
      workflowService.updateStatus(db, wf.id, 'in_progress');

      // Register agent
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude-code',
        workflow_id: wf.id,
      });
      expect(agent.status).toBe('online');

      // Register a session and lock the workflow
      const session = sessionService.register(db, { pid: process.pid });
      const lockResult = lockService.lock(db, wf.id, session.id);
      expect(lockResult.success).toBe(true);

      // Use getNextTasks to find available task (should be A)
      let next = orchestrationService.getNextTasks(db, wf.id);
      expect(next.tasks).toHaveLength(1);
      expect(next.tasks[0].id).toBe(taskA.id);
      expect(next.all_complete).toBe(false);

      // Claim A
      const claimA = taskService.claim(db, taskA.id, agent.id);
      expect(claimA.success).toBe(true);

      // Transition task A: pending -> planning -> in_progress -> completed
      taskService.updateStatus(db, taskA.id, 'planning');
      taskService.updateStatus(db, taskA.id, 'in_progress');
      taskService.updateStatus(db, taskA.id, 'completed', { outcome: 'Task A done successfully' });

      // Use getNextTasks again (should return B now)
      next = orchestrationService.getNextTasks(db, wf.id);
      expect(next.tasks).toHaveLength(1);
      expect(next.tasks[0].id).toBe(taskB.id);

      // Claim B, complete B
      taskService.claim(db, taskB.id, agent.id);
      taskService.updateStatus(db, taskB.id, 'planning');
      taskService.updateStatus(db, taskB.id, 'in_progress');
      taskService.updateStatus(db, taskB.id, 'completed', { outcome: 'Task B done' });

      // getNextTasks returns C
      next = orchestrationService.getNextTasks(db, wf.id);
      expect(next.tasks).toHaveLength(1);
      expect(next.tasks[0].id).toBe(taskC.id);

      // Claim C, complete C
      taskService.claim(db, taskC.id, agent.id);
      taskService.updateStatus(db, taskC.id, 'planning');
      taskService.updateStatus(db, taskC.id, 'in_progress');
      taskService.updateStatus(db, taskC.id, 'completed', { outcome: 'Task C done' });

      // getNextTasks should now show all complete
      next = orchestrationService.getNextTasks(db, wf.id);
      expect(next.tasks).toHaveLength(0);
      expect(next.all_complete).toBe(true);

      // Unlock and complete workflow
      lockService.unlock(db, wf.id, session.id);
      workflowService.updateStatus(db, wf.id, 'completed');

      // Verify progress shows all completed
      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.total_tasks).toBe(3);
      expect(progress.by_status.completed).toBe(3);
      expect(progress.estimated_remaining).toBe(0);
      expect(progress.blocked_tasks).toHaveLength(0);

      const finalWf = workflowService.get(db, wf.id);
      expect(finalWf?.status).toBe('completed');
    });
  });

  // --- 2. Replan Mid-Workflow ---

  describe('replan mid-workflow', () => {
    it('replans mid-workflow preserving completed tasks', () => {
      // Create workflow with 4 tasks
      const wf = workflowService.create(db, {
        name: 'Replan Test',
        source_type: 'prompt',
      });

      workflowService.setPlan(db, wf.id, {
        summary: 'Original plan',
        tasks: [
          { name: 'Step 1' },
          { name: 'Step 2', depends_on: ['Step 1'] },
          { name: 'Step 3', depends_on: ['Step 2'] },
          { name: 'Step 4', depends_on: ['Step 3'] },
        ],
      });

      // Start workflow
      workflowService.updateStatus(db, wf.id, 'in_progress');

      // Register agent and complete first 2 tasks
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude-code',
        workflow_id: wf.id,
      });

      let tasks = getTasks(db, wf.id);
      const [step1, step2] = tasks;

      // Complete Step 1
      taskService.claim(db, step1.id, agent.id);
      taskService.updateStatus(db, step1.id, 'planning');
      taskService.updateStatus(db, step1.id, 'in_progress');
      taskService.updateStatus(db, step1.id, 'completed', { outcome: 'Step 1 done' });

      // Complete Step 2
      taskService.claim(db, step2.id, agent.id);
      taskService.updateStatus(db, step2.id, 'planning');
      taskService.updateStatus(db, step2.id, 'in_progress');
      taskService.updateStatus(db, step2.id, 'completed', { outcome: 'Step 2 done' });

      // Replan with new tasks that depend on completed ones
      const replanResult = workflowService.replan(db, wf.id, {
        summary: 'Revised plan after discovering new requirements',
        reason: 'New requirements found',
        tasks: [
          { name: 'New Step A', depends_on: ['Step 1'] },
          { name: 'New Step B', depends_on: ['Step 2', 'New Step A'] },
        ],
      });

      expect(replanResult.tasks_preserved).toBe(2); // Step 1 and Step 2
      expect(replanResult.tasks_removed).toBe(2); // Step 3 and Step 4
      expect(replanResult.tasks_added).toBe(2); // New Step A and New Step B

      // Verify completed tasks still exist and are still completed
      tasks = getTasks(db, wf.id);
      expect(tasks).toHaveLength(4); // 2 preserved + 2 new

      const preserved1 = tasks.find((t) => t.name === 'Step 1');
      const preserved2 = tasks.find((t) => t.name === 'Step 2');
      expect(preserved1?.status).toBe('completed');
      expect(preserved2?.status).toBe('completed');

      // Verify new tasks are pending
      const newA = tasks.find((t) => t.name === 'New Step A');
      const newB = tasks.find((t) => t.name === 'New Step B');
      expect(newA?.status).toBe('pending');
      expect(newB?.status).toBe('pending');

      // New Step A should be available (depends on completed Step 1)
      const next = orchestrationService.getNextTasks(db, wf.id);
      expect(next.tasks).toHaveLength(1);
      expect(next.tasks[0].name).toBe('New Step A');

      // Complete New Step A
      taskService.claim(db, newA?.id as string, agent.id);
      taskService.updateStatus(db, newA?.id as string, 'planning');
      taskService.updateStatus(db, newA?.id as string, 'in_progress');
      taskService.updateStatus(db, newA?.id as string, 'completed', {
        outcome: 'New Step A done',
      });

      // New Step B should now be available
      const next2 = orchestrationService.getNextTasks(db, wf.id);
      expect(next2.tasks).toHaveLength(1);
      expect(next2.tasks[0].name).toBe('New Step B');

      // Complete New Step B and finish workflow
      taskService.claim(db, newB?.id as string, agent.id);
      taskService.updateStatus(db, newB?.id as string, 'planning');
      taskService.updateStatus(db, newB?.id as string, 'in_progress');
      taskService.updateStatus(db, newB?.id as string, 'completed', {
        outcome: 'New Step B done',
      });

      workflowService.updateStatus(db, wf.id, 'completed');

      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.total_tasks).toBe(4);
      expect(progress.by_status.completed).toBe(4);
      expect(progress.estimated_remaining).toBe(0);
    });
  });

  // --- 3. Multi-Agent Coordination ---

  describe('multi-agent coordination', () => {
    it('multiple agents claim different tasks and coordinate via messages', () => {
      // Create workflow with parallel tasks
      const wf = workflowService.create(db, {
        name: 'Multi-Agent Test',
        source_type: 'issue',
        max_parallel_tasks: 2,
      });

      workflowService.setPlan(db, wf.id, {
        summary: 'Parallel work',
        tasks: [
          { name: 'Frontend', parallel_group: 'impl', description: 'Build UI' },
          { name: 'Backend', parallel_group: 'impl', description: 'Build API' },
          {
            name: 'Integration',
            depends_on: ['Frontend', 'Backend'],
            description: 'Wire together',
          },
        ],
      });

      workflowService.updateStatus(db, wf.id, 'in_progress');

      // Register 2 agents
      const agent1 = agentService.register(db, {
        name: 'agent-frontend',
        runtime: 'claude-code',
        workflow_id: wf.id,
      });
      const agent2 = agentService.register(db, {
        name: 'agent-backend',
        runtime: 'claude-code',
        workflow_id: wf.id,
      });

      const tasks = getTasks(db, wf.id);
      const frontendTask = tasks.find((t) => t.name === 'Frontend');
      const backendTask = tasks.find((t) => t.name === 'Backend');
      const _integrationTask = tasks.find((t) => t.name === 'Integration');

      // Both Frontend and Backend should be available (parallel)
      const next = orchestrationService.getNextTasks(db, wf.id);
      expect(next.tasks).toHaveLength(2);
      expect(next.recommended_count).toBe(2);

      // Agent 1 claims Frontend, Agent 2 claims Backend
      const claim1 = taskService.claim(db, frontendTask?.id as string, agent1.id);
      expect(claim1.success).toBe(true);

      const claim2 = taskService.claim(db, backendTask?.id as string, agent2.id);
      expect(claim2.success).toBe(true);

      // Agent 1 sends a message to Agent 2
      const sendResult = messageService.send(db, {
        sender_id: agent1.id,
        recipient_id: agent2.id,
        message_type: 'query',
        body: 'I need the /api/users endpoint to return {name, email}',
        subject: 'API contract for users',
        workflow_id: wf.id,
      });
      expect(sendResult.id).toMatch(/^msg_/);

      // Verify Agent 2 can see the unread message
      const unread = messageService.countUnread(db, agent2.id);
      expect(unread.count).toBe(1);

      const messages = messageService.list(db, agent2.id, { status: 'unread' });
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('I need the /api/users endpoint to return {name, email}');
      expect(messages[0].sender_id).toBe(agent1.id);

      // Agent 2 reads the message
      messageService.markRead(db, [messages[0].id]);
      const afterRead = messageService.countUnread(db, agent2.id);
      expect(afterRead.count).toBe(0);

      // Both agents complete their tasks
      taskService.updateStatus(db, frontendTask?.id as string, 'planning');
      taskService.updateStatus(db, frontendTask?.id as string, 'in_progress');
      taskService.updateStatus(db, frontendTask?.id as string, 'completed', {
        outcome: 'Frontend built',
      });

      taskService.updateStatus(db, backendTask?.id as string, 'planning');
      taskService.updateStatus(db, backendTask?.id as string, 'in_progress');
      taskService.updateStatus(db, backendTask?.id as string, 'completed', {
        outcome: 'Backend built',
      });

      // Integration task should now be available
      const next2 = orchestrationService.getNextTasks(db, wf.id);
      expect(next2.tasks).toHaveLength(1);
      expect(next2.tasks[0].name).toBe('Integration');

      // Verify dependencies_completed is populated
      expect(next2.tasks[0].dependencies_completed).toContain('Frontend');
      expect(next2.tasks[0].dependencies_completed).toContain('Backend');
    });
  });

  // --- 4. Locking ---

  describe('locking', () => {
    it('session A locks -> session B blocked -> session A unlocks -> session B locks', () => {
      const wf = workflowService.create(db, {
        name: 'Lock Test',
        source_type: 'prompt',
      });

      // Register two sessions
      const sessionA = sessionService.register(db, { pid: 1001 });
      const sessionB = sessionService.register(db, { pid: 1002 });

      // Session A locks
      const lockA = lockService.lock(db, wf.id, sessionA.id);
      expect(lockA.success).toBe(true);
      expect(lockA.locked_by).toBe(sessionA.id);

      // Verify lock info
      const lockInfo = lockService.getLockInfo(db, wf.id);
      expect(lockInfo.locked).toBe(true);
      expect(lockInfo.session_id).toBe(sessionA.id);

      // Session B tries to lock -> fails
      const lockB1 = lockService.lock(db, wf.id, sessionB.id);
      expect(lockB1.success).toBe(false);
      expect(lockB1.locked_by).toBe(sessionA.id);

      // Verify isLockedByOther from B's perspective
      const isLocked = lockService.isLockedByOther(db, wf.id, sessionB.id);
      expect(isLocked.locked).toBe(true);
      expect(isLocked.holder_session_id).toBe(sessionA.id);

      // Session A unlocks
      const unlockA = lockService.unlock(db, wf.id, sessionA.id);
      expect(unlockA).toBe(true);

      // Verify lock cleared
      const lockInfoAfter = lockService.getLockInfo(db, wf.id);
      expect(lockInfoAfter.locked).toBe(false);

      // Session B locks -> succeeds
      const lockB2 = lockService.lock(db, wf.id, sessionB.id);
      expect(lockB2.success).toBe(true);
      expect(lockB2.locked_by).toBe(sessionB.id);

      // Verify final lock state
      const finalLockInfo = lockService.getLockInfo(db, wf.id);
      expect(finalLockInfo.locked).toBe(true);
      expect(finalLockInfo.session_id).toBe(sessionB.id);
    });
  });

  // --- 5. Template Round-Trip ---

  describe('template round-trip', () => {
    it('creates template from workflow and applies it to create new workflow', () => {
      // Create source workflow with plan (3 tasks with deps)
      const srcWf = workflowService.create(db, {
        name: 'Source Workflow',
        source_type: 'issue',
      });

      workflowService.setPlan(db, srcWf.id, {
        summary: 'Standard deploy pipeline',
        tasks: [
          { name: 'Build', description: 'Compile the project', parallel_group: 'prep' },
          { name: 'Lint', description: 'Run linter', parallel_group: 'prep' },
          { name: 'Test', description: 'Run tests', depends_on: ['Build'] },
          { name: 'Deploy', description: 'Deploy to production', depends_on: ['Test', 'Lint'] },
        ],
      });

      // Create template from the workflow
      const tmpl = templateService.create(db, {
        name: 'Deploy Pipeline',
        description: 'Standard deploy pipeline template',
        fromWorkflowId: srcWf.id,
      });

      expect(tmpl.name).toBe('Deploy Pipeline');
      expect(tmpl.version).toBe(1);

      // Parse the template to verify structure
      const templateDef = JSON.parse(tmpl.template) as templateService.TemplateDefinition;
      expect(templateDef.tasks).toHaveLength(4);

      const tmplBuild = templateDef.tasks.find((t) => t.name === 'Build');
      const tmplLint = templateDef.tasks.find((t) => t.name === 'Lint');
      const tmplTest = templateDef.tasks.find((t) => t.name === 'Test');
      const tmplDeploy = templateDef.tasks.find((t) => t.name === 'Deploy');

      expect(tmplBuild?.parallel_group).toBe('prep');
      expect(tmplLint?.parallel_group).toBe('prep');
      expect(tmplTest?.depends_on).toEqual(['Build']);
      expect(tmplDeploy?.depends_on).toContain('Test');
      expect(tmplDeploy?.depends_on).toContain('Lint');

      // Apply template to create a new workflow
      const applyResult = templateService.apply(db, tmpl.id, {
        workflowName: 'Deploy v2.0',
        maxParallel: 2,
      });

      expect(applyResult.workflow_id).toMatch(/^wf_/);

      // Verify the new workflow has the same task structure
      const newWf = workflowService.get(db, applyResult.workflow_id, { includeTasks: true });
      expect(newWf?.name).toBe('Deploy v2.0');
      expect(newWf?.status).toBe('ready'); // setPlan transitions planning -> ready
      expect(newWf?.max_parallel_tasks).toBe(2);
      expect(newWf?.tasks).toHaveLength(4);

      const newTasks = newWf?.tasks ?? [];
      const newBuild = newTasks.find((t) => t.name === 'Build');
      const newLint = newTasks.find((t) => t.name === 'Lint');
      const newTest = newTasks.find((t) => t.name === 'Test');
      const newDeploy = newTasks.find((t) => t.name === 'Deploy');

      expect(newBuild).toBeDefined();
      expect(newLint).toBeDefined();
      expect(newTest).toBeDefined();
      expect(newDeploy).toBeDefined();

      // Verify parallel groups preserved
      expect(newBuild?.parallel_group).toBe('prep');
      expect(newLint?.parallel_group).toBe('prep');

      // Verify dependencies preserved by checking orchestration
      workflowService.updateStatus(db, applyResult.workflow_id, 'in_progress');
      const next = orchestrationService.getNextTasks(db, applyResult.workflow_id);

      // Build and Lint should be available (no unmet dependencies)
      const availableNames = next.tasks.map((t) => t.name).sort();
      expect(availableNames).toEqual(['Build', 'Lint']);

      // Test and Deploy should not be available (blocked)
      expect(next.tasks.find((t) => t.name === 'Test')).toBeUndefined();
      expect(next.tasks.find((t) => t.name === 'Deploy')).toBeUndefined();
    });
  });

  // --- 6. Orchestration (max_parallel_tasks) ---

  describe('orchestration', () => {
    it('respects max_parallel_tasks limit', () => {
      // Create workflow with max_parallel=2 and 4 parallel tasks
      const wf = workflowService.create(db, {
        name: 'Parallel Test',
        source_type: 'issue',
        max_parallel_tasks: 2,
      });

      workflowService.setPlan(db, wf.id, {
        summary: 'Four parallel tasks',
        tasks: [
          { name: 'Task 1', parallel_group: 'batch' },
          { name: 'Task 2', parallel_group: 'batch' },
          { name: 'Task 3', parallel_group: 'batch' },
          { name: 'Task 4', parallel_group: 'batch' },
        ],
      });

      workflowService.updateStatus(db, wf.id, 'in_progress');

      const next = orchestrationService.getNextTasks(db, wf.id);

      // All 4 tasks are available (no dependencies blocking them)
      expect(next.tasks).toHaveLength(4);

      // But recommended_count should be capped at max_parallel_tasks = 2
      expect(next.max_parallel).toBe(2);
      expect(next.recommended_count).toBe(2);

      // Verify all tasks are parallelizable
      for (const t of next.tasks) {
        expect(t.can_parallelize).toBe(true);
        expect(t.parallel_with).toHaveLength(3); // each has 3 siblings
      }

      // Verify progress shows all pending
      const progress = orchestrationService.getProgress(db, wf.id);
      expect(progress.total_tasks).toBe(4);
      expect(progress.by_status.pending).toBe(4);
      expect(progress.parallel_groups.batch.task_count).toBe(4);
      expect(progress.parallel_groups.batch.completed).toBe(0);
    });
  });

  // --- 7. Context Recovery ---

  describe('context recovery', () => {
    it('loadTaskContext includes prior task outcomes', () => {
      // Create workflow with sequential tasks
      const wf = workflowService.create(db, {
        name: 'Context Test',
        source_type: 'issue',
        source_content: 'Build a widget with three steps',
      });

      workflowService.setPlan(db, wf.id, {
        summary: 'Sequential widget build',
        tasks: [
          { name: 'Design', description: 'Design the widget' },
          { name: 'Implement', description: 'Write the code', depends_on: ['Design'] },
          { name: 'Test', description: 'Write tests', depends_on: ['Implement'] },
        ],
      });

      workflowService.updateStatus(db, wf.id, 'in_progress');

      const tasks = getTasks(db, wf.id);
      const [designTask, implementTask, testTask] = tasks;

      // Register agent and complete Design with an outcome
      const agent = agentService.register(db, {
        name: 'worker-1',
        runtime: 'claude-code',
        workflow_id: wf.id,
      });

      taskService.claim(db, designTask.id, agent.id);
      taskService.updateStatus(db, designTask.id, 'planning');
      taskService.updateStatus(db, designTask.id, 'in_progress');
      taskService.updateStatus(db, designTask.id, 'completed', {
        outcome: 'Designed a responsive widget with 3 components: Header, Body, Footer',
      });

      // Complete Implement with an outcome
      taskService.claim(db, implementTask.id, agent.id);
      taskService.updateStatus(db, implementTask.id, 'planning');
      taskService.updateStatus(db, implementTask.id, 'in_progress');
      taskService.updateStatus(db, implementTask.id, 'completed', {
        outcome:
          'Implemented Widget component in src/components/Widget.tsx with all 3 sub-components',
      });

      // Load context for the Test task (the later task)
      const context = contextService.loadTaskContext(db, testTask.id);

      // Verify workflow section
      expect(context.workflow).toBeDefined();
      expect(context.workflow?.name).toBe('Context Test');
      expect(context.workflow?.status).toBe('in_progress');

      // Verify current_task section
      expect(context.current_task).toBeDefined();
      expect(context.current_task?.name).toBe('Test');
      expect(context.current_task?.status).toBe('pending');

      // Verify prior_tasks section includes completed task outcomes
      expect(context.prior_tasks).toBeDefined();
      expect(context.prior_tasks).toHaveLength(2);

      const priorDesign = context.prior_tasks?.find((t) => t.name === 'Design');
      const priorImpl = context.prior_tasks?.find((t) => t.name === 'Implement');

      expect(priorDesign?.status).toBe('completed');
      expect(priorDesign?.outcome).toBe(
        'Designed a responsive widget with 3 components: Header, Body, Footer',
      );

      expect(priorImpl?.status).toBe('completed');
      expect(priorImpl?.outcome).toBe(
        'Implemented Widget component in src/components/Widget.tsx with all 3 sub-components',
      );

      // Verify dependency_outcomes section
      expect(context.dependency_outcomes).toBeDefined();
      expect(context.dependency_outcomes).toHaveLength(1);
      expect(context.dependency_outcomes?.[0].name).toBe('Implement');
      expect(context.dependency_outcomes?.[0].outcome).toBe(
        'Implemented Widget component in src/components/Widget.tsx with all 3 sub-components',
      );

      // Verify token estimate is a positive number
      expect(context.token_estimate).toBeGreaterThan(0);
    });
  });
});
