/** Device topology: coupling graph plus native-gate and timing metadata. */

export interface Device {
  readonly id: string;
  readonly displayName: string;
  readonly numQubits: number;
  /** Undirected coupling edges (a < b). Two-qubit gates are legal on these only. */
  readonly edges: readonly (readonly [number, number])[];
  /** Native basis the reference compiler targets. */
  readonly basisGates: readonly string[];
  /**
   * Representative gate durations in nanoseconds. These are model values for
   * scheduling (certainty: ESTIMATED), not measurements of real hardware.
   */
  readonly durations: Readonly<Record<string, number>>;
  /** 2D layout positions for coupling-map display, one [x, y] per qubit. */
  readonly positions: readonly (readonly [number, number])[];
}

const DEFAULT_BASIS = ['rz', 'sx', 'x', 'cx'] as const;
const DEFAULT_DURATIONS = {
  rz: 0,
  sx: 35,
  x: 35,
  cx: 300,
  measure: 800,
  reset: 900,
  swap: 900,
} as const;

function line(n: number): [number, number][] {
  const edges: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]);
  return edges;
}

function ring(n: number): [number, number][] {
  const edges = line(n);
  edges.push([0, n - 1]);
  return edges;
}

function grid(rows: number, cols: number): [number, number][] {
  const edges: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c + 1 < cols) edges.push([i, i + 1]);
      if (r + 1 < rows) edges.push([i, i + cols]);
    }
  }
  return edges;
}

function fullyConnected(n: number): [number, number][] {
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) edges.push([a, b]);
  return edges;
}

function linePositions(n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [i, 0] as [number, number]);
}

function ringPositions(n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [Math.cos(a), Math.sin(a)] as [number, number];
  });
}

function gridPositions(rows: number, cols: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([c, r]);
  return out;
}

export const DEVICES: readonly Device[] = [
  {
    id: 'linear-5',
    displayName: 'Linear 5',
    numQubits: 5,
    edges: line(5),
    basisGates: DEFAULT_BASIS,
    durations: DEFAULT_DURATIONS,
    positions: linePositions(5),
  },
  {
    id: 'ring-8',
    displayName: 'Ring 8',
    numQubits: 8,
    edges: ring(8),
    basisGates: DEFAULT_BASIS,
    durations: DEFAULT_DURATIONS,
    positions: ringPositions(8),
  },
  {
    id: 'grid-3x3',
    displayName: 'Grid 3×3',
    numQubits: 9,
    edges: grid(3, 3),
    basisGates: DEFAULT_BASIS,
    durations: DEFAULT_DURATIONS,
    positions: gridPositions(3, 3),
  },
  {
    id: 'tee-7',
    displayName: 'Tee 7',
    numQubits: 7,
    // H-shaped 7-qubit graph inspired by small superconducting devices:
    // 0-1-2 spine with 1-3, and 4-5-6 spine with 5-3.
    edges: [
      [0, 1],
      [1, 2],
      [1, 3],
      [3, 5],
      [4, 5],
      [5, 6],
    ],
    basisGates: DEFAULT_BASIS,
    durations: DEFAULT_DURATIONS,
    positions: [
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ],
  },
  {
    id: 'full-5',
    displayName: 'All-to-all 5',
    numQubits: 5,
    edges: fullyConnected(5),
    basisGates: DEFAULT_BASIS,
    durations: DEFAULT_DURATIONS,
    positions: ringPositions(5),
  },
];

export function getDevice(id: string): Device {
  const d = DEVICES.find((dev) => dev.id === id);
  if (!d) throw new Error(`Unknown device: ${id}`);
  return d;
}

export function hasEdge(device: Device, a: number, b: number): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return device.edges.some(([x, y]) => x === lo && y === hi);
}

export function neighbors(device: Device, q: number): number[] {
  const out: number[] = [];
  for (const [a, b] of device.edges) {
    if (a === q) out.push(b);
    else if (b === q) out.push(a);
  }
  return out.sort((x, y) => x - y);
}

/** All-pairs shortest-path distances via BFS. Unreachable pairs are Infinity. */
export function distanceMatrix(device: Device): number[][] {
  const n = device.numQubits;
  const dist: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  for (let s = 0; s < n; s++) {
    dist[s]![s] = 0;
    const queue = [s];
    while (queue.length > 0) {
      const u = queue.shift()!;
      for (const v of neighbors(device, u)) {
        if (dist[s]![v] === Infinity) {
          dist[s]![v] = dist[s]![u]! + 1;
          queue.push(v);
        }
      }
    }
  }
  return dist;
}

/**
 * One shortest path between two physical qubits (BFS, lowest-index
 * tie-breaking so results are deterministic). Returns the inclusive node
 * sequence, or null if unreachable.
 */
export function shortestPath(device: Device, from: number, to: number): number[] | null {
  if (from === to) return [from];
  const prev = new Array<number>(device.numQubits).fill(-1);
  const seen = new Array<boolean>(device.numQubits).fill(false);
  seen[from] = true;
  const queue = [from];
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const v of neighbors(device, u)) {
      if (!seen[v]) {
        seen[v] = true;
        prev[v] = u;
        if (v === to) {
          const path = [to];
          let cur = to;
          while (prev[cur] !== -1) {
            cur = prev[cur]!;
            path.push(cur);
          }
          return path.reverse();
        }
        queue.push(v);
      }
    }
  }
  return null;
}

/** True when every qubit can reach every other qubit. */
export function isConnected(device: Device): boolean {
  const dist = distanceMatrix(device);
  return dist.every((row) => row.every((d) => Number.isFinite(d)));
}
