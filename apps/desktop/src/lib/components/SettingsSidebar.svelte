<script lang="ts">
import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import FolderGitIcon from '@lucide/svelte/icons/folder-git';
import HelpCircleIcon from '@lucide/svelte/icons/help-circle';
import SettingsIcon from '@lucide/svelte/icons/settings';
import WrenchIcon from '@lucide/svelte/icons/wrench';
import type { Component } from 'svelte';
import * as Sidebar from '$lib/components/ui/sidebar/index.js';
import { type SettingsSection, settingsSection } from '$lib/stores/settings-section';

interface Props {
  isTauri: boolean;
}

const { isTauri }: Props = $props();

const sections: Array<{ id: SettingsSection; label: string; icon: Component }> = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'repositories', label: 'Repositories', icon: FolderGitIcon },
  { id: 'templates', label: 'Templates', icon: FileTextIcon },
  { id: 'setup', label: 'Setup', icon: WrenchIcon },
  { id: 'help', label: 'Help', icon: HelpCircleIcon },
];
</script>

<Sidebar.Root collapsible="none" variant="sidebar" class="w-56">
  <Sidebar.Header class={isTauri ? 'pt-[38px]' : 'pt-2'}>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton class="text-muted-foreground">
          {#snippet child({ props })}
            <a href="/" {...props}>
              <ArrowLeftIcon class="size-4" />
              <span>Back</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Settings</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#each sections as section}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={$settingsSection === section.id}
                onclick={() => settingsSection.set(section.id)}
              >
                <section.icon class="size-4" />
                <span>{section.label}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>
</Sidebar.Root>
