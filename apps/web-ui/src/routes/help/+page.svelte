<div class="mx-auto max-w-2xl p-6">
  <h2 class="mb-6 text-2xl font-bold">Help</h2>

  <div class="space-y-6 text-sm text-gray-600 dark:text-gray-300">
    <section>
      <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">About caw</h3>
      <p>
        caw is a durable execution system for coding agent workflows. It persists tasks, plans,
        and outcomes across context clearing via an MCP server backed by SQLite.
      </p>
    </section>

    <section>
      <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Web UI</h3>
      <p>
        The web UI provides browser-based access to the same data available in the terminal TUI.
        Start the server with <code class="rounded bg-gray-100 px-1 dark:bg-gray-800">caw --web-ui</code>.
      </p>
    </section>

    <section>
      <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Pages</h3>
      <ul class="list-inside list-disc space-y-1">
        <li><strong>Workflows</strong> — List and monitor all workflows</li>
        <li><strong>Workflow Detail</strong> — Tasks, agents, messages, and workspaces for a workflow</li>
        <li><strong>Task Detail</strong> — Plan, outcome, checkpoints, and dependencies</li>
        <li><strong>Agent Detail</strong> — Agent status, capabilities, and message inbox</li>
        <li><strong>Messages</strong> — Global message inbox with filtering</li>
        <li><strong>Setup</strong> — Connection status and quick start guide</li>
      </ul>
    </section>

    <section>
      <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Real-time Updates</h3>
      <p>
        The web UI connects via WebSocket for real-time updates. The connection status is shown in
        the sidebar. Events from workflow and task status changes, agent heartbeats, and new
        messages are pushed automatically.
      </p>
    </section>

    <section>
      <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">CLI Commands</h3>
      <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
        <pre class="text-xs">caw                              # Launch TUI
caw --web-ui                     # Launch web UI server
caw --server                     # Headless MCP server
caw init                         # Initialize caw
caw setup claude-code            # Configure Claude Code
caw run &lt;workflow_id&gt;            # Execute a workflow
caw run --prompt "..."           # Create + run from prompt</pre>
      </div>
    </section>
  </div>
</div>
