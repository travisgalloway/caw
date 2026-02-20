<script lang="ts">
import type { Core, ElementDefinition } from 'cytoscape';
import cytoscape from 'cytoscape';
import { onMount } from 'svelte';
import type { Task, TaskDependency } from '$lib/api/client';

interface Props {
  tasks: Task[];
  dependencies: TaskDependency[];
  workflowId: string;
}

const { tasks, dependencies, workflowId }: Props = $props();

let container: HTMLDivElement;
let cy: Core | null = null;

// Status color mapping based on requirements
const statusColors: Record<string, string> = {
  pending: '#9ca3af', // gray
  blocked: '#fbbf24', // yellow
  planning: '#60a5fa', // light blue
  in_progress: '#3b82f6', // blue
  completed: '#22c55e', // green
  failed: '#ef4444', // red
  paused: '#f97316', // orange
  skipped: '#6b7280', // dark gray
};

function getStatusColor(status: string): string {
  return statusColors[status] ?? '#9ca3af';
}

// Build cytoscape elements from tasks and dependencies
const elements = $derived.by((): ElementDefinition[] => {
  const nodes: ElementDefinition[] = tasks.map((task) => ({
    data: {
      id: task.id,
      label: `${task.sequence}. ${task.name}`,
      status: task.status,
      color: getStatusColor(task.status),
      task: task,
    },
  }));

  const edges: ElementDefinition[] = dependencies.map((dep, index) => ({
    data: {
      id: `edge-${index}`,
      source: dep.depends_on_id,
      target: dep.task_id,
    },
  }));

  return [...nodes, ...edges];
});

// Initialize or update the cytoscape graph
function updateGraph() {
  if (!container || !cy) return;

  // Clear existing elements
  cy.elements().remove();

  // Add new elements
  cy.add(elements);

  // Apply hierarchical layout for DAG
  cy.layout({
    name: 'breadthfirst',
    directed: true,
    padding: 50,
    spacingFactor: 1.5,
    animate: false,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
  }).run();

  // Fit the graph to the viewport
  cy.fit(undefined, 50);
}

onMount(() => {
  // Initialize cytoscape
  cy = cytoscape({
    container: container,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          label: 'data(label)',
          color: '#ffffff',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '12px',
          'font-weight': 'bold',
          width: 'label',
          height: 'label',
          padding: '12px',
          shape: 'round-rectangle',
          'text-wrap': 'wrap',
          'text-max-width': '200px',
          'border-width': 2,
          'border-color': '#ffffff',
          'border-opacity': 0.3,
        },
      },
      {
        selector: 'node:hover',
        style: {
          'border-color': '#ffffff',
          'border-opacity': 0.8,
          // @ts-expect-error - cursor is not in types but is valid CSS property
          cursor: 'pointer',
        },
      },
      {
        selector: 'edge',
        style: {
          width: 2,
          'line-color': '#cbd5e1',
          'target-arrow-color': '#cbd5e1',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 1.5,
        },
      },
    ],
    wheelSensitivity: 0.2,
    minZoom: 0.3,
    maxZoom: 3,
  });

  // Add click handler for navigation
  cy.on('tap', 'node', (event) => {
    const taskId = event.target.data('id');
    if (taskId) {
      window.location.href = `/workflows/${workflowId}/tasks/${taskId}`;
    }
  });

  // Initial graph render
  updateGraph();

  // Cleanup on component unmount
  return () => {
    if (cy) {
      cy.destroy();
      cy = null;
    }
  };
});

// Update graph when data changes
$effect(() => {
  // Trigger update when elements change
  if (elements.length > 0 && cy) {
    updateGraph();
  }
});
</script>

<div class="flex h-full w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
  {#if tasks.length === 0}
    <div class="flex h-full items-center justify-center px-4 py-8 text-sm text-gray-500">
      No tasks to display
    </div>
  {:else}
    <div class="flex h-full w-full flex-col">
      <!-- Controls hint -->
      <div class="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900">
        Drag to pan • Scroll to zoom • Click node to view details
      </div>

      <!-- Cytoscape container -->
      <div bind:this={container} class="cytoscape-container h-full w-full"></div>
    </div>
  {/if}
</div>

<style>
  /* Ensure the cytoscape container has a defined size */
  .cytoscape-container {
    min-height: 500px;
  }
</style>
