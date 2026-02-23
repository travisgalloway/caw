<script lang="ts">
import SaveIcon from '@lucide/svelte/icons/save';
import { onMount } from 'svelte';
import { toast } from 'svelte-sonner';
import { api, type ConfigResponse } from '$lib/api/client';
import { Badge } from '$lib/components/ui/badge/index.js';
import { Button } from '$lib/components/ui/button/index.js';
import * as Card from '$lib/components/ui/card/index.js';
import { Input } from '$lib/components/ui/input/index.js';
import { Label } from '$lib/components/ui/label/index.js';
import { Separator } from '$lib/components/ui/separator/index.js';
import { Skeleton } from '$lib/components/ui/skeleton/index.js';

let config = $state<ConfigResponse | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);
let saving = $state(false);

// Editable fields
let transport = $state('stdio');
let port = $state('3100');
let dbMode = $state('global');
let agentRuntime = $state('claude-code');
let agentAutoSetup = $state(true);

onMount(async () => {
  try {
    const result = await api.getConfig();
    config = result.data;
    // Populate editable fields
    transport = String(config.config.transport ?? 'stdio');
    port = String(config.config.port ?? '3100');
    dbMode = String(config.config.dbMode ?? 'global');
    const agent = config.config.agent as { runtime?: string; autoSetup?: boolean } | undefined;
    agentRuntime = agent?.runtime ?? 'claude-code';
    agentAutoSetup = agent?.autoSetup ?? true;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to fetch configuration';
  } finally {
    loading = false;
  }
});

async function handleSave() {
  saving = true;
  try {
    await api.updateConfig({
      transport,
      port: Number(port),
      dbMode,
      agent: {
        runtime: agentRuntime,
        autoSetup: agentAutoSetup,
      },
    });
    toast.success('Configuration saved');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to save');
  } finally {
    saving = false;
  }
}
</script>

<div class="mx-auto max-w-2xl p-6 space-y-6">
  <div>
    <h2 class="text-2xl font-bold tracking-tight">Settings</h2>
    <p class="text-sm text-muted-foreground">Configure caw server and agent settings.</p>
  </div>

  {#if loading}
    <div class="space-y-4">
      {#each Array(3) as _}
        <Skeleton class="h-20 w-full" />
      {/each}
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="p-4 text-sm text-destructive">{error}</Card.Content>
    </Card.Root>
  {:else if config}
    <!-- Server Configuration -->
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

    <!-- Agent Configuration -->
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

    <!-- Diagnostics (read-only) -->
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
