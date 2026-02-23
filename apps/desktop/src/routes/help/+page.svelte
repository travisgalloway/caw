<script lang="ts">
import { Badge } from '$lib/components/ui/badge/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';
</script>

<div class="mx-auto max-w-2xl p-6 space-y-6">
  <div>
    <h2 class="text-2xl font-bold tracking-tight">Help</h2>
    <p class="text-sm text-muted-foreground">Reference for the caw web dashboard.</p>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>About caw</Card.Title>
    </Card.Header>
    <Card.Content class="text-sm text-muted-foreground">
      <p>
        caw is a durable execution system for coding agent workflows. It persists tasks, plans,
        and outcomes across context clearing via an MCP server backed by SQLite.
      </p>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Keyboard Shortcuts</Card.Title>
    </Card.Header>
    <Card.Content>
      <div class="space-y-3 text-sm">
        {#each [
          { keys: '⌘K', desc: 'Open command palette' },
          { keys: '?', desc: 'Show shortcuts dialog' },
          { keys: 'g w', desc: 'Go to Workflows' },
          { keys: 'g a', desc: 'Go to Agents' },
          { keys: 'g m', desc: 'Go to Messages' },
          { keys: 'g t', desc: 'Go to Templates' },
          { keys: 'g r', desc: 'Go to Repositories' },
          { keys: 'g s', desc: 'Go to Settings' },
        ] as shortcut}
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">{shortcut.desc}</span>
            <div class="flex items-center gap-1">
              {#each shortcut.keys.split(' ') as key}
                <kbd
                  class="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground"
                >
                  {key}
                </kbd>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Pages</Card.Title>
    </Card.Header>
    <Card.Content class="space-y-2 text-sm">
      {#each [
        ['Workflows', 'List and monitor all workflows, create new ones'],
        ['Workflow Detail', 'Tasks, agents, messages, workspaces, execution control'],
        ['Task Detail', 'Plan, outcome, checkpoints, dependencies, agent assignment'],
        ['Agents', 'All agents across workflows with filters'],
        ['Agent Detail', 'Status, capabilities, messages, heartbeat, unregister'],
        ['Messages', 'Global inbox with priority and unread filters, compose'],
        ['Templates', 'Browse and apply workflow templates'],
        ['Repositories', 'Register and manage repositories for global mode'],
        ['Settings', 'Configure server and agent settings'],
        ['Setup', 'Connection diagnostics and quick start guide'],
      ] as [name, desc]}
        <div class="flex items-baseline gap-2">
          <span class="font-medium">{name}</span>
          <span class="text-muted-foreground">— {desc}</span>
        </div>
      {/each}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Real-time Updates</Card.Title>
    </Card.Header>
    <Card.Content class="text-sm text-muted-foreground">
      <p>
        The dashboard connects via WebSocket for live updates. Events from workflow status changes,
        task updates, agent heartbeats, and new messages are pushed automatically. Toast
        notifications appear for important events.
      </p>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>CLI Commands</Card.Title>
    </Card.Header>
    <Card.Content>
      <pre class="rounded-lg bg-muted p-4 text-xs">caw                              # Launch TUI
caw --web-ui                     # Launch web UI server
caw --server                     # Headless MCP server
caw init                         # Initialize caw
caw setup claude-code            # Configure Claude Code
caw run &lt;workflow_id&gt;            # Execute a workflow
caw run --prompt "..."           # Create + run from prompt
caw work &lt;issues...&gt;            # Work on GitHub issues</pre>
    </Card.Content>
  </Card.Root>
</div>
