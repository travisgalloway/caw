<script lang="ts">
import FileTextIcon from '@lucide/svelte/icons/file-text';
import FolderGitIcon from '@lucide/svelte/icons/folder-git';
import PlusIcon from '@lucide/svelte/icons/plus';
import SaveIcon from '@lucide/svelte/icons/save';
import { onDestroy, onMount } from 'svelte';
import { toast } from 'svelte-sonner';
import { api, type ConfigResponse, type Repository, type WorkflowTemplate } from '$lib/api/client';
import ApplyTemplateDialog from '$lib/components/ApplyTemplateDialog.svelte';
import EmptyState from '$lib/components/EmptyState.svelte';
import RelativeTime from '$lib/components/RelativeTime.svelte';
import { Badge } from '$lib/components/ui/badge/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import * as Dialog from '$lib/components/ui/dialog/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';
import { Toaster } from '$lib/components/ui/sonner/index.js';
import * as Table from '$lib/components/ui/table/index.js';
import * as Tabs from '$lib/components/ui/tabs/index.js';
import { wsStore } from '$lib/stores/ws';
import { formatDate } from '$lib/utils';

type SettingsTab = 'general' | 'repositories' | 'templates' | 'setup' | 'help';
let activeTab = $state<SettingsTab>('general');

// === General tab state ===
let config = $state<ConfigResponse | null>(null);
let configLoading = $state(true);
let configError = $state<string | null>(null);
let saving = $state(false);
let transport = $state('stdio');
let port = $state('3100');
let dbMode = $state('global');
let agentRuntime = $state('claude-code');
let agentAutoSetup = $state(true);

// === Repositories tab state ===
let repositories = $state<Repository[]>([]);
let reposLoading = $state(true);
let reposError = $state<string | null>(null);
let showRegister = $state(false);
let regName = $state('');
let regPath = $state('');
let regError = $state<string | null>(null);
let regSubmitting = $state(false);

// === Templates tab state ===
let templates = $state<WorkflowTemplate[]>([]);
let templatesLoading = $state(true);
let templatesError = $state<string | null>(null);
let applyDialogOpen = $state(false);
let selectedTemplate = $state<WorkflowTemplate | null>(null);

// === Setup tab state ===
type DiagnosticCheck = { name: string; status: string; message: string };
let apiStatus = $state<'checking' | 'ok' | 'error'>('checking');
let wsStatus = $state<'checking' | 'ok' | 'error'>('checking');
let diagnostics = $state<DiagnosticCheck[]>([]);
let diagnosticsLoading = $state(true);

// Poll timers
let reposPoll: ReturnType<typeof setInterval>;
let templatesPoll: ReturnType<typeof setInterval>;

// === General tab ===
async function loadConfig() {
  try {
    const result = await api.getConfig();
    config = result.data;
    transport = String(config.config.transport ?? 'stdio');
    port = String(config.config.port ?? '3100');
    dbMode = String(config.config.dbMode ?? 'global');
    const agent = config.config.agent as { runtime?: string; autoSetup?: boolean } | undefined;
    agentRuntime = agent?.runtime ?? 'claude-code';
    agentAutoSetup = agent?.autoSetup ?? true;
  } catch (err) {
    configError = err instanceof Error ? err.message : 'Failed to fetch configuration';
  } finally {
    configLoading = false;
  }
}

async function handleSave() {
  saving = true;
  try {
    await api.updateConfig({
      transport,
      port: Number(port),
      dbMode,
      agent: { runtime: agentRuntime, autoSetup: agentAutoSetup },
    });
    toast.success('Configuration saved');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to save');
  } finally {
    saving = false;
  }
}

// === Repositories tab ===
async function loadRepos() {
  try {
    const result = await api.listRepositories();
    repositories = result.data;
    reposError = null;
  } catch (err) {
    reposError = err instanceof Error ? err.message : String(err);
  } finally {
    reposLoading = false;
  }
}

async function handleRegister() {
  if (!regName.trim() || !regPath.trim()) {
    regError = 'Name and path are required.';
    return;
  }
  regSubmitting = true;
  regError = null;
  try {
    await api.registerRepository({ name: regName.trim(), path: regPath.trim() });
    showRegister = false;
    regName = '';
    regPath = '';
    await loadRepos();
  } catch (err) {
    regError = err instanceof Error ? err.message : String(err);
  } finally {
    regSubmitting = false;
  }
}

// === Templates tab ===
async function loadTemplates() {
  try {
    const result = await api.listTemplates();
    templates = result.data;
    templatesError = null;
  } catch (err) {
    templatesError = err instanceof Error ? err.message : String(err);
  } finally {
    templatesLoading = false;
  }
}

function getTaskCount(template: WorkflowTemplate): number {
  try {
    const parsed = JSON.parse(template.template);
    return parsed?.tasks?.length ?? 0;
  } catch {
    return 0;
  }
}

// === Setup tab ===
async function loadDiagnostics() {
  try {
    const res = await fetch('/health');
    apiStatus = res.ok ? 'ok' : 'error';
  } catch {
    apiStatus = 'error';
  }
  try {
    const result = await api.getDiagnostics();
    diagnostics = result.data.checks;
  } catch {
    // ignore
  } finally {
    diagnosticsLoading = false;
  }
}

const statusIcon: Record<string, string> = {
  checking: '...',
  ok: '\u2713',
  error: '\u2717',
  pass: '\u2713',
  fail: '\u2717',
};
const statusColor: Record<string, string> = {
  checking: 'text-gray-400',
  ok: 'text-green-600',
  error: 'text-red-600',
  pass: 'text-green-600',
  fail: 'text-red-600',
};
const actionableHints: Record<string, string> = {
  Database: 'Run `caw init` to create the database',
  'MCP Server': 'Run `caw setup claude-code` to configure MCP integration',
  'CLAUDE.md': 'Add a CLAUDE.md file with caw integration section',
  'Config file': 'Run `caw init` to create the config file',
  Gitignore: 'Add `.caw/` to your .gitignore file',
};

onMount(() => {
  wsStore.connect();
  loadConfig();
  loadRepos();
  loadTemplates();
  loadDiagnostics();
  reposPoll = setInterval(loadRepos, 10000);
  templatesPoll = setInterval(loadTemplates, 10000);
});

onDestroy(() => {
  wsStore.disconnect();
  clearInterval(reposPoll);
  clearInterval(templatesPoll);
});

$effect(() => {
  wsStatus = $wsStore.connected ? 'ok' : 'error';
});
</script>

<div class="mx-auto max-w-2xl p-6 space-y-6">
  <h2 class="text-xl font-semibold tracking-tight">Settings</h2>

  <Tabs.Root bind:value={activeTab}>
    <Tabs.List class="w-full">
      <Tabs.Trigger value="general">General</Tabs.Trigger>
      <Tabs.Trigger value="repositories">Repositories</Tabs.Trigger>
      <Tabs.Trigger value="templates">Templates</Tabs.Trigger>
      <Tabs.Trigger value="setup">Setup</Tabs.Trigger>
      <Tabs.Trigger value="help">Help</Tabs.Trigger>
    </Tabs.List>

    <!-- ===== General ===== -->
    <Tabs.Content value="general">
      <div class="space-y-6 pt-4">
        {#if configLoading}
          <div class="space-y-4">
            {#each Array(3) as _}
              <Skeleton class="h-20 w-full" />
            {/each}
          </div>
        {:else if configError}
          <Card.Root class="border-destructive">
            <Card.Content class="p-4 text-sm text-destructive">{configError}</Card.Content>
          </Card.Root>
        {:else if config}
          <Card.Root>
            <Card.Header>
              <Card.Title>Server</Card.Title>
              <Card.Description>MCP server transport and connection settings.</Card.Description>
            </Card.Header>
            <Card.Content class="space-y-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label for="transport">Transport</Label>
                  <select
                    id="transport"
                    bind:value={transport}
                    class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="stdio">stdio</option>
                    <option value="http">http</option>
                  </select>
                </div>
                <div class="space-y-2">
                  <Label for="port">Port</Label>
                  <Input id="port" type="number" bind:value={port} />
                </div>
              </div>
              <div class="space-y-2">
                <Label for="dbMode">Database Mode</Label>
                <select
                  id="dbMode"
                  bind:value={dbMode}
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="global">global</option>
                  <option value="per-repo">per-repo</option>
                </select>
              </div>
            </Card.Content>
          </Card.Root>

          <Card.Root>
            <Card.Header>
              <Card.Title>Agent</Card.Title>
              <Card.Description>Default agent runtime and behavior.</Card.Description>
            </Card.Header>
            <Card.Content class="space-y-4">
              <div class="space-y-2">
                <Label for="agentRuntime">Runtime</Label>
                <select
                  id="agentRuntime"
                  bind:value={agentRuntime}
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="claude-code">claude-code</option>
                  <option value="codex">codex</option>
                  <option value="opencode">opencode</option>
                </select>
              </div>
              <div class="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoSetup"
                  bind:checked={agentAutoSetup}
                  class="size-4 rounded border-input"
                />
                <Label for="autoSetup">Auto Setup MCP integration</Label>
              </div>
            </Card.Content>
          </Card.Root>

          <Button onclick={handleSave} disabled={saving}>
            <SaveIcon class="mr-1 size-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>

          <Separator />

          <Card.Root>
            <Card.Header>
              <Card.Title>Diagnostics</Card.Title>
              <Card.Description>Configuration file paths and warnings.</Card.Description>
            </Card.Header>
            <Card.Content class="space-y-3 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Database</span>
                <code class="rounded bg-muted px-1.5 py-0.5 text-xs">{config.diagnostics.dbPath}</code>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Global config</span>
                <code class="rounded bg-muted px-1.5 py-0.5 text-xs">{config.diagnostics.globalConfigPath}</code>
              </div>
              {#if config.diagnostics.repoConfigPath}
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Repo config</span>
                  <code class="rounded bg-muted px-1.5 py-0.5 text-xs">{config.diagnostics.repoConfigPath}</code>
                </div>
              {/if}
              {#if config.diagnostics.warnings.length > 0}
                <Separator />
                {#each config.diagnostics.warnings as warning}
                  <div class="flex items-center gap-2">
                    <Badge variant="outline" class="text-amber-600">Warning</Badge>
                    <span class="text-sm">{warning}</span>
                  </div>
                {/each}
              {/if}
            </Card.Content>
          </Card.Root>
        {/if}
      </div>
    </Tabs.Content>

    <!-- ===== Repositories ===== -->
    <Tabs.Content value="repositories">
      <div class="space-y-6 pt-4">
        <div class="flex items-center justify-between">
          <p class="text-sm text-muted-foreground">Registered repositories for global mode</p>
          <Button size="sm" onclick={() => { showRegister = true; }}>
            <PlusIcon class="mr-1 size-4" />
            Register
          </Button>
        </div>

        {#if reposLoading}
          <Card.Root>
            <Card.Content class="p-0">
              {#each Array(3) as _}
                <div class="flex gap-4 border-b border-border px-4 py-3 last:border-0">
                  <Skeleton class="h-4 w-32" />
                  <Skeleton class="h-4 w-48" />
                  <Skeleton class="h-4 w-24" />
                </div>
              {/each}
            </Card.Content>
          </Card.Root>
        {:else if reposError}
          <Card.Root class="border-destructive">
            <Card.Content class="p-4 text-sm text-destructive">{reposError}</Card.Content>
          </Card.Root>
        {:else if repositories.length === 0}
          <EmptyState
            icon={FolderGitIcon}
            title="No repositories"
            description="Register repositories to use global mode across multiple projects."
          />
        {:else}
          <Card.Root>
            <Card.Content class="p-0">
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Name</Table.Head>
                    <Table.Head>Path</Table.Head>
                    <Table.Head>Added</Table.Head>
                    <Table.Head class="text-right">ID</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each repositories as repo}
                    <Table.Row>
                      <Table.Cell class="font-medium">{repo.name}</Table.Cell>
                      <Table.Cell class="font-mono text-xs text-muted-foreground">{repo.path}</Table.Cell>
                      <Table.Cell class="text-muted-foreground">{formatDate(repo.added_at)}</Table.Cell>
                      <Table.Cell class="text-right font-mono text-xs text-muted-foreground">{repo.id}</Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </Card.Content>
          </Card.Root>
        {/if}
      </div>
    </Tabs.Content>

    <!-- ===== Templates ===== -->
    <Tabs.Content value="templates">
      <div class="space-y-6 pt-4">
        <p class="text-sm text-muted-foreground">
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </p>

        {#if templatesLoading}
          <div class="grid gap-4 sm:grid-cols-2">
            {#each Array(2) as _}
              <Card.Root><Card.Content class="p-4"><Skeleton class="h-32 w-full" /></Card.Content></Card.Root>
            {/each}
          </div>
        {:else if templatesError}
          <Card.Root class="border-destructive">
            <Card.Content class="p-4 text-sm text-destructive">{templatesError}</Card.Content>
          </Card.Root>
        {:else if templates.length === 0}
          <EmptyState
            icon={FileTextIcon}
            title="No templates"
            description="Create a template via MCP tools or the CLI to get started."
          />
        {:else}
          <div class="grid gap-4 sm:grid-cols-2">
            {#each templates as template}
              <Card.Root class="transition-shadow hover:shadow-md">
                <Card.Header>
                  <Card.Title class="text-base">{template.name}</Card.Title>
                  {#if template.description}
                    <Card.Description>{template.description}</Card.Description>
                  {/if}
                </Card.Header>
                <Card.Content>
                  <div class="flex items-center gap-3 text-sm text-muted-foreground">
                    <Badge variant="secondary">
                      {getTaskCount(template)} task{getTaskCount(template) !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline">v{template.version}</Badge>
                    <span class="text-xs">
                      <RelativeTime timestamp={template.updated_at} />
                    </span>
                  </div>
                </Card.Content>
                <Card.Footer>
                  <Button class="w-full" onclick={() => { selectedTemplate = template; applyDialogOpen = true; }}>
                    Apply Template
                  </Button>
                </Card.Footer>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </div>
    </Tabs.Content>

    <!-- ===== Setup ===== -->
    <Tabs.Content value="setup">
      <div class="space-y-6 pt-4">
        <div>
          <h3 class="mb-3 text-lg font-semibold">Server Configuration</h3>
          <div class="space-y-3">
            {#if diagnosticsLoading}
              <div class="rounded-lg border border-border p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="font-medium">Loading diagnostics...</h4>
                    <p class="text-sm text-muted-foreground">Checking server configuration</p>
                  </div>
                  <span class="font-mono text-sm font-bold {statusColor['checking']}">{statusIcon['checking']}</span>
                </div>
              </div>
            {:else}
              {#each diagnostics as check}
                <div class="rounded-lg border border-border p-4">
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <h4 class="font-medium">{check.name}</h4>
                      <p class="text-sm text-muted-foreground">{check.message}</p>
                      {#if check.status === 'fail' && actionableHints[check.name]}
                        <p class="mt-1 text-sm text-amber-600 dark:text-amber-400">
                          {actionableHints[check.name]}
                        </p>
                      {/if}
                    </div>
                    <span class="ml-4 font-mono text-sm font-bold {statusColor[check.status]}">{statusIcon[check.status]}</span>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <div>
          <h3 class="mb-3 text-lg font-semibold">Connection Status</h3>
          <div class="space-y-3">
            <div class="rounded-lg border border-border p-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-medium">API Server</h4>
                  <p class="text-sm text-muted-foreground">REST API at /api/*</p>
                </div>
                <span class="font-mono text-sm font-bold {statusColor[apiStatus]}">{statusIcon[apiStatus]}</span>
              </div>
            </div>
            <div class="rounded-lg border border-border p-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-medium">WebSocket</h4>
                  <p class="text-sm text-muted-foreground">Real-time updates at /ws</p>
                </div>
                <span class="font-mono text-sm font-bold {statusColor[wsStatus]}">{statusIcon[wsStatus]}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-border p-4">
          <h3 class="mb-2 font-medium">Quick Start</h3>
          <ol class="space-y-2 text-sm text-muted-foreground">
            <li>1. Initialize caw: <code class="rounded bg-muted px-1">caw init</code></li>
            <li>2. Start the server: <code class="rounded bg-muted px-1">caw --server --transport http</code></li>
            <li>3. Create a workflow via MCP or CLI</li>
            <li>4. View workflow progress in the dashboard</li>
          </ol>
        </div>
      </div>
    </Tabs.Content>

    <!-- ===== Help ===== -->
    <Tabs.Content value="help">
      <div class="space-y-6 pt-4">
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
                { keys: '\u2318K', desc: 'Open command palette' },
                { keys: '\u2318,', desc: 'Open settings' },
                { keys: '?', desc: 'Show shortcuts dialog' },
                { keys: 'g w', desc: 'Go to Workflows' },
                { keys: 'g a', desc: 'Go to Agents' },
                { keys: 'g m', desc: 'Go to Messages' },
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
            <Card.Title>CLI Commands</Card.Title>
          </Card.Header>
          <Card.Content>
            <pre class="rounded-lg bg-muted p-4 text-xs">caw --server                     # Headless MCP server
caw --server --transport http    # Combined server (MCP + REST + WS)
caw init                         # Initialize caw
caw setup claude-code            # Configure Claude Code
caw run &lt;workflow_id&gt;            # Execute a workflow
caw run --prompt "..."           # Create + run from prompt
caw work &lt;issues...&gt;            # Work on GitHub issues</pre>
          </Card.Content>
        </Card.Root>
      </div>
    </Tabs.Content>
  </Tabs.Root>
</div>

<!-- Register Repository Dialog -->
<Dialog.Root bind:open={showRegister}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Register Repository</Dialog.Title>
      <Dialog.Description>Add a repository to the global registry.</Dialog.Description>
    </Dialog.Header>
    {#if regError}
      <div class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        {regError}
      </div>
    {/if}
    <form onsubmit={(e) => { e.preventDefault(); handleRegister(); }} class="space-y-4">
      <div class="space-y-2">
        <Label for="repo-name">Name</Label>
        <Input id="repo-name" bind:value={regName} placeholder="my-repo" required />
      </div>
      <div class="space-y-2">
        <Label for="repo-path">Path</Label>
        <Input id="repo-path" bind:value={regPath} placeholder="/path/to/repo" required />
      </div>
      <Dialog.Footer>
        <Button variant="outline" type="button" onclick={() => { showRegister = false; }}>Cancel</Button>
        <Button type="submit" disabled={regSubmitting}>
          {regSubmitting ? 'Registering...' : 'Register'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<!-- Apply Template Dialog -->
<ApplyTemplateDialog
  template={selectedTemplate}
  open={applyDialogOpen}
  onClose={() => { applyDialogOpen = false; selectedTemplate = null; }}
/>

<Toaster richColors closeButton />
