import type { Component } from 'svelte';

export class RightPanelState {
  visible = $state(false);
  component = $state<Component<Record<string, unknown>> | null>(null);
  props = $state<Record<string, unknown>>({});

  show(comp: Component<Record<string, unknown>>, compProps: Record<string, unknown> = {}) {
    this.component = comp;
    this.props = compProps;
    this.visible = true;
  }

  hide() {
    this.visible = false;
    this.component = null;
    this.props = {};
  }
}
