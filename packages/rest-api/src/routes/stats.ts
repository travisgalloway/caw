import type { DatabaseType } from '@caw/core';
import { agentService, messageService, workflowService } from '@caw/core';
import { ok } from '../response';
import type { Router } from '../router';

export interface StatsSummary {
  active_workflows: number;
  online_agents: number;
  unread_messages: number;
  completed_today: number;
}

export function registerStatsRoutes(router: Router, db: DatabaseType) {
  // Get summary statistics
  router.get('/api/stats/summary', () => {
    // Active workflows (in_progress status)
    const activeWorkflowsResult = workflowService.list(db, { status: 'in_progress', limit: 0 });
    const activeWorkflows = activeWorkflowsResult.total;

    // Online agents (status = 'online' or 'busy')
    const onlineAgents = agentService.list(db, { status: ['online', 'busy'] }).length;

    // Unread messages (total across all agents)
    const unreadMessages = messageService.countAllUnread(db);

    // Workflows completed today (since midnight local time)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const completedWorkflows = db
      .prepare(
        "SELECT COUNT(*) as count FROM workflows WHERE status = 'completed' AND updated_at >= ?",
      )
      .get(startOfToday) as { count: number };
    const completedToday = completedWorkflows.count;

    const summary: StatsSummary = {
      active_workflows: activeWorkflows,
      online_agents: onlineAgents,
      unread_messages: unreadMessages,
      completed_today: completedToday,
    };

    return ok(summary);
  });
}
