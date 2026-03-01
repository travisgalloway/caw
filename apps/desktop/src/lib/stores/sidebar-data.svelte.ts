import { type Agent, api, type WorkflowSummary } from '$lib/api/client';

const ACTIVE_STATUSES = 'planning,ready,in_progress,paused,awaiting_merge';
const POLL_MS = 5000;

export class SidebarData {
  activeWorkflows = $state<WorkflowSummary[]>([]);
  agentsByWorkflow = $state<Map<string, Agent[]>>(new Map());
  unreadCount = $state(0);
  #interval: ReturnType<typeof setInterval> | null = null;

  async refresh() {
    try {
      const [wfRes, agentsRes, unreadRes] = await Promise.all([
        api.listWorkflows({ status: ACTIVE_STATUSES }),
        api.listAgents(),
        api.getUnreadCount(),
      ]);
      this.activeWorkflows = wfRes.data;
      const grouped = new Map<string, Agent[]>();
      for (const agent of agentsRes.data) {
        if (agent.workflow_id) {
          const existing = grouped.get(agent.workflow_id);
          if (existing) {
            existing.push(agent);
          } else {
            grouped.set(agent.workflow_id, [agent]);
          }
        }
      }
      this.agentsByWorkflow = grouped;
      this.unreadCount = unreadRes.data.count;
    } catch {
      // Silently fail — sidebar will show stale data
    }
  }

  startPolling() {
    this.refresh();
    this.#interval = setInterval(() => this.refresh(), POLL_MS);
  }

  stopPolling() {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
  }

  handleWsEvent(event: { type: string } | null) {
    if (!event) return;
    if (
      event.type.startsWith('workflow:') ||
      event.type.startsWith('agent:') ||
      event.type === 'message:new'
    ) {
      this.refresh();
    }
  }
}
