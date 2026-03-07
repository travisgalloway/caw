import type { Component } from 'svelte';

// biome-ignore lint/suspicious/noExplicitAny: Panel components have varying prop shapes.
type AnyComponent = Component<any>;

export class RightPanelState {
  visible = $state(false);
  component = $state<AnyComponent | null>(null);
  props = $state<Record<string, unknown>>({});
  title = $state('');

  show(comp: AnyComponent, compProps: Record<string, unknown> = {}, panelTitle = 'Panel') {
    this.component = comp;
    this.props = compProps;
    this.title = panelTitle;
    this.visible = true;
  }

  hide() {
    this.visible = false;
    this.component = null;
    this.props = {};
    this.title = '';
  }
}
