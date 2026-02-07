import type { TaskStatus } from '@caw/core';

// --- Public types ---

export interface DagNode {
  id: string;
  name: string;
  status: TaskStatus;
}

export interface DagEdge {
  from: string; // depends_on_id (source, upstream)
  to: string; // task_id (target, downstream)
  isBlocked: boolean;
}

export interface DagLayoutInput {
  nodes: DagNode[];
  edges: DagEdge[];
  width: number;
}

export interface GridCell {
  char: string;
  color: string | null;
  dim: boolean;
}

// --- Constants ---

const NODE_HEIGHT = 3; // top border + content + bottom border
const EDGE_SPACE = 2; // vertical space between layers for edge routing
const MIN_NODE_WIDTH = 14;
const NODE_PADDING = 4; // 2 chars padding each side inside box

// --- Status → color mapping ---

const statusColors: Record<string, string> = {
  completed: 'green',
  in_progress: 'green',
  planning: 'yellow',
  pending: 'gray',
  blocked: 'red',
  failed: 'red',
  skipped: 'gray',
  paused: 'yellow',
};

function statusColor(status: string): string {
  return statusColors[status] ?? 'gray';
}

// --- Layer assignment (topological BFS) ---

export function assignLayers(nodes: DagNode[], edges: DagEdge[]): Map<string, number> {
  const layers = new Map<string, number>();
  const incomingMap = new Map<string, Set<string>>();
  const outgoingMap = new Map<string, string[]>();

  for (const n of nodes) {
    incomingMap.set(n.id, new Set());
    outgoingMap.set(n.id, []);
  }

  for (const e of edges) {
    incomingMap.get(e.to)?.add(e.from);
    outgoingMap.get(e.from)?.push(e.to);
  }

  // BFS from roots (no incoming edges)
  const queue: string[] = [];
  for (const n of nodes) {
    const inc = incomingMap.get(n.id);
    if (!inc || inc.size === 0) {
      layers.set(n.id, 0);
      queue.push(n.id);
    }
  }

  // Handle disconnected / all-cyclic nodes
  if (queue.length === 0 && nodes.length > 0) {
    layers.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentLayer = layers.get(current) ?? 0;
    const children = outgoingMap.get(current) ?? [];

    for (const child of children) {
      const existing = layers.get(child);
      const newLayer = currentLayer + 1;
      if (existing === undefined || newLayer > existing) {
        layers.set(child, newLayer);
      }
      // Only add to queue if all predecessors have been assigned
      const preds = incomingMap.get(child);
      if (preds) {
        let allAssigned = true;
        for (const p of preds) {
          if (!layers.has(p)) {
            allAssigned = false;
            break;
          }
        }
        if (allAssigned && !queue.includes(child)) {
          queue.push(child);
        }
      }
    }
  }

  // Assign remaining unvisited nodes to layer 0
  for (const n of nodes) {
    if (!layers.has(n.id)) {
      layers.set(n.id, 0);
    }
  }

  return layers;
}

// --- Node ordering within layers (barycenter heuristic) ---

export function orderLayers(
  layers: Map<string, number>,
  edges: DagEdge[],
  nodes: DagNode[],
): string[][] {
  // Group nodes by layer
  const maxLayer = Math.max(0, ...layers.values());
  const layerGroups: string[][] = Array.from({ length: maxLayer + 1 }, () => []);

  for (const n of nodes) {
    const layer = layers.get(n.id) ?? 0;
    layerGroups[layer].push(n.id);
  }

  // Build adjacency for barycenter
  const incomingMap = new Map<string, string[]>();
  for (const e of edges) {
    const existing = incomingMap.get(e.to) ?? [];
    existing.push(e.from);
    incomingMap.set(e.to, existing);
  }

  // For each layer > 0, order by barycenter of predecessors' positions
  for (let l = 1; l <= maxLayer; l++) {
    const prevOrder = layerGroups[l - 1];
    const posMap = new Map<string, number>();
    for (let i = 0; i < prevOrder.length; i++) {
      posMap.set(prevOrder[i], i);
    }

    const barycenters = new Map<string, number>();
    for (const nodeId of layerGroups[l]) {
      const preds = (incomingMap.get(nodeId) ?? []).filter((p) => posMap.has(p));
      if (preds.length > 0) {
        const sum = preds.reduce((acc, p) => acc + (posMap.get(p) ?? 0), 0);
        barycenters.set(nodeId, sum / preds.length);
      } else {
        barycenters.set(nodeId, 0);
      }
    }

    layerGroups[l].sort((a, b) => (barycenters.get(a) ?? 0) - (barycenters.get(b) ?? 0));
  }

  return layerGroups;
}

// --- Grid rendering ---

function emptyCell(): GridCell {
  return { char: ' ', color: null, dim: false };
}

function createGrid(rows: number, cols: number): GridCell[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => emptyCell()));
}

function setCell(
  grid: GridCell[][],
  row: number,
  col: number,
  char: string,
  color: string | null,
  dim: boolean,
): void {
  if (row >= 0 && row < grid.length && col >= 0 && col < grid[0].length) {
    grid[row][col] = { char, color, dim };
  }
}

function drawBox(
  grid: GridCell[][],
  row: number,
  col: number,
  width: number,
  label: string,
  color: string,
): void {
  // Top border: ┌──...──┐
  setCell(grid, row, col, '┌', color, false);
  for (let c = col + 1; c < col + width - 1; c++) {
    setCell(grid, row, c, '─', color, false);
  }
  setCell(grid, row, col + width - 1, '┐', color, false);

  // Content row: │ label │
  setCell(grid, row + 1, col, '│', color, false);
  const padded = ` ${label} `;
  for (let i = 0; i < padded.length && col + 1 + i < col + width - 1; i++) {
    setCell(grid, row + 1, col + 1 + i, padded[i], null, false);
  }
  // Fill remaining space
  for (let c = col + 1 + padded.length; c < col + width - 1; c++) {
    setCell(grid, row + 1, c, ' ', null, false);
  }
  setCell(grid, row + 1, col + width - 1, '│', color, false);

  // Bottom border: └──...──┘
  setCell(grid, row + 2, col, '└', color, false);
  for (let c = col + 1; c < col + width - 1; c++) {
    setCell(grid, row + 2, c, '─', color, false);
  }
  setCell(grid, row + 2, col + width - 1, '┘', color, false);
}

function drawEdge(
  grid: GridCell[][],
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  color: string,
  dim: boolean,
): void {
  // Vertical line from source bottom to target top
  if (fromCol === toCol) {
    // Straight down
    for (let r = fromRow; r <= toRow; r++) {
      if (r === toRow) {
        setCell(grid, r, fromCol, '▼', color, dim);
      } else {
        setCell(grid, r, fromCol, '│', color, dim);
      }
    }
  } else {
    // Go down from source, horizontal offset, then down to target
    const midRow = fromRow + Math.floor((toRow - fromRow) / 2);

    // Down from source to midRow
    for (let r = fromRow; r < midRow; r++) {
      setCell(grid, r, fromCol, '│', color, dim);
    }

    // Corner at midRow
    if (fromCol < toCol) {
      setCell(grid, midRow, fromCol, '└', color, dim);
      for (let c = fromCol + 1; c < toCol; c++) {
        setCell(grid, midRow, c, '─', color, dim);
      }
      setCell(grid, midRow, toCol, '┐', color, dim);
    } else {
      setCell(grid, midRow, fromCol, '┘', color, dim);
      for (let c = toCol + 1; c < fromCol; c++) {
        setCell(grid, midRow, c, '─', color, dim);
      }
      setCell(grid, midRow, toCol, '┌', color, dim);
    }

    // Down from midRow to target
    for (let r = midRow + 1; r < toRow; r++) {
      setCell(grid, r, toCol, '│', color, dim);
    }
    setCell(grid, toRow, toCol, '▼', color, dim);
  }
}

// --- Main layout function ---

export function layoutDag(input: DagLayoutInput): GridCell[][] {
  const { nodes, edges, width } = input;

  if (nodes.length === 0) {
    return createGrid(1, width);
  }

  const layers = assignLayers(nodes, edges);
  const layerGroups = orderLayers(layers, edges, nodes);
  const nodeMap = new Map<string, DagNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Calculate node widths
  const nodeWidths = new Map<string, number>();
  for (const n of nodes) {
    const w = Math.max(MIN_NODE_WIDTH, n.name.length + NODE_PADDING);
    nodeWidths.set(n.id, w);
  }

  // Calculate total height
  const totalLayers = layerGroups.length;
  const gridHeight = totalLayers * NODE_HEIGHT + (totalLayers - 1) * EDGE_SPACE;

  const grid = createGrid(gridHeight, width);

  // Position nodes: center each layer
  const nodePositions = new Map<string, { row: number; col: number; width: number }>();

  for (let l = 0; l < layerGroups.length; l++) {
    const group = layerGroups[l];
    const layerRow = l * (NODE_HEIGHT + EDGE_SPACE);

    // Calculate total width needed for this layer
    const gap = 2;
    let totalWidth = 0;
    for (const id of group) {
      totalWidth += nodeWidths.get(id) ?? MIN_NODE_WIDTH;
    }
    totalWidth += (group.length - 1) * gap;

    // Truncate node names if layer too wide
    if (totalWidth > width && group.length > 0) {
      const available = width - (group.length - 1) * gap;
      const perNode = Math.max(MIN_NODE_WIDTH, Math.floor(available / group.length));
      for (const id of group) {
        nodeWidths.set(id, perNode);
      }
      totalWidth = perNode * group.length + (group.length - 1) * gap;
    }

    // Center the layer
    let startCol = Math.max(0, Math.floor((width - totalWidth) / 2));

    for (const id of group) {
      const nw = nodeWidths.get(id) ?? MIN_NODE_WIDTH;
      const node = nodeMap.get(id);
      if (node) {
        const truncatedName =
          node.name.length > nw - NODE_PADDING
            ? `${node.name.slice(0, nw - NODE_PADDING - 1)}…`
            : node.name;
        drawBox(grid, layerRow, startCol, nw, truncatedName, statusColor(node.status));
      }
      nodePositions.set(id, { row: layerRow, col: startCol, width: nw });
      startCol += nw + gap;
    }
  }

  // Draw edges
  for (const edge of edges) {
    const fromPos = nodePositions.get(edge.from);
    const toPos = nodePositions.get(edge.to);
    if (!fromPos || !toPos) continue;

    const fromCenterCol = fromPos.col + Math.floor(fromPos.width / 2);
    const toCenterCol = toPos.col + Math.floor(toPos.width / 2);
    const fromBottomRow = fromPos.row + NODE_HEIGHT; // row below bottom border
    const toTopRow = toPos.row - 1; // row above top border

    if (fromBottomRow < toTopRow) {
      const edgeColor = edge.isBlocked ? 'red' : 'gray';
      drawEdge(
        grid,
        fromBottomRow,
        fromCenterCol,
        toTopRow,
        toCenterCol,
        edgeColor,
        edge.isBlocked,
      );
    }
  }

  return grid;
}
