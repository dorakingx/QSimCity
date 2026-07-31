import { describe, expect, it } from 'vitest';
import {
  DEVICES,
  distanceMatrix,
  getDevice,
  hasEdge,
  isConnected,
  neighbors,
  shortestPath,
} from '../src/topology.js';

describe('device catalog', () => {
  it('provides the documented set of devices', () => {
    expect(DEVICES.map((d) => d.id)).toEqual(['linear-5', 'ring-8', 'grid-3x3', 'tee-7', 'full-5']);
  });

  it('every device is connected', () => {
    for (const d of DEVICES) expect(isConnected(d), d.id).toBe(true);
  });

  it('every edge references valid qubits and is normalized a<b', () => {
    for (const d of DEVICES) {
      for (const [a, b] of d.edges) {
        expect(a).toBeLessThan(b);
        expect(b).toBeLessThan(d.numQubits);
        expect(a).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('every device has one position per qubit', () => {
    for (const d of DEVICES) expect(d.positions).toHaveLength(d.numQubits);
  });

  it('every device declares durations for its basis gates and measurement', () => {
    for (const d of DEVICES) {
      for (const g of d.basisGates) expect(d.durations[g], `${d.id}/${g}`).toBeDefined();
      expect(d.durations['measure']).toBeDefined();
    }
  });

  it('getDevice throws for unknown ids', () => {
    expect(() => getDevice('warp-drive')).toThrow(/Unknown device/);
  });
});

describe('graph operations', () => {
  const linear = getDevice('linear-5');
  const grid = getDevice('grid-3x3');

  it('hasEdge is symmetric', () => {
    expect(hasEdge(linear, 0, 1)).toBe(true);
    expect(hasEdge(linear, 1, 0)).toBe(true);
    expect(hasEdge(linear, 0, 2)).toBe(false);
  });

  it('neighbors returns sorted adjacent qubits', () => {
    expect(neighbors(grid, 4)).toEqual([1, 3, 5, 7]);
    expect(neighbors(linear, 0)).toEqual([1]);
  });

  it('distanceMatrix matches manual expectations on linear-5', () => {
    const dist = distanceMatrix(linear);
    expect(dist[0]![4]).toBe(4);
    expect(dist[2]![2]).toBe(0);
    expect(dist[1]![3]).toBe(2);
  });

  it('distanceMatrix is symmetric', () => {
    for (const d of DEVICES) {
      const dist = distanceMatrix(d);
      for (let a = 0; a < d.numQubits; a++) {
        for (let b = 0; b < d.numQubits; b++) {
          expect(dist[a]![b]).toBe(dist[b]![a]);
        }
      }
    }
  });

  it('shortestPath returns an inclusive adjacent-step path', () => {
    const path = shortestPath(linear, 0, 4)!;
    expect(path).toEqual([0, 1, 2, 3, 4]);
    for (let i = 0; i + 1 < path.length; i++) {
      expect(hasEdge(linear, path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('shortestPath handles from === to', () => {
    expect(shortestPath(grid, 3, 3)).toEqual([3]);
  });

  it('shortestPath length matches distanceMatrix', () => {
    for (const d of DEVICES) {
      const dist = distanceMatrix(d);
      for (let a = 0; a < d.numQubits; a++) {
        for (let b = 0; b < d.numQubits; b++) {
          const p = shortestPath(d, a, b)!;
          expect(p.length - 1, `${d.id} ${a}->${b}`).toBe(dist[a]![b]);
        }
      }
    }
  });

  it('ring-8 wraps around', () => {
    const ring = getDevice('ring-8');
    expect(distanceMatrix(ring)[0]![7]).toBe(1);
    expect(distanceMatrix(ring)[0]![4]).toBe(4);
  });
});

describe('topology structure is pinned', () => {
  /** Edge counts are pinned: a generator bug would silently change routing. */
  it('each device has exactly the expected number of coupling edges', () => {
    const expected: Record<string, number> = {
      'linear-5': 4,
      'ring-8': 8,
      'grid-3x3': 12,
      'tee-7': 6,
      'full-5': 10,
    };
    for (const d of DEVICES) {
      expect(d.edges.length, d.id).toBe(expected[d.id]);
    }
  });

  it('grid-3x3 has exactly the textbook lattice edges', () => {
    const grid = getDevice('grid-3x3');
    expect(grid.edges.map(([a, b]) => `${a}-${b}`)).toEqual([
      '0-1',
      '0-3',
      '1-2',
      '1-4',
      '2-5',
      '3-4',
      '3-6',
      '4-5',
      '4-7',
      '5-8',
      '6-7',
      '7-8',
    ]);
  });

  it('no device connects a row end to the next row start', () => {
    const grid = getDevice('grid-3x3');
    // 2-3 and 5-6 would be wrap-around edges a naive loop bound introduces.
    for (const forbidden of ['2-3', '5-6']) {
      expect(
        grid.edges.some(([a, b]) => `${a}-${b}` === forbidden),
        forbidden,
      ).toBe(false);
    }
  });
});

describe('neighbor ordering is deterministic', () => {
  /**
   * Routing tie-breaking depends on neighbor order, so the comparator must
   * sort ascending even when the underlying edge list is not already ordered.
   */
  it('sorts neighbors ascending regardless of edge declaration order', () => {
    const tee = getDevice('tee-7');
    // Node 5's edges appear as 3-5, 4-5, 5-6 in declaration order, so a
    // broken comparator would surface them out of order.
    expect(neighbors(tee, 5)).toEqual([3, 4, 6]);
    expect(neighbors(tee, 1)).toEqual([0, 2, 3]);
    for (const d of DEVICES) {
      for (let q = 0; q < d.numQubits; q++) {
        const ns = neighbors(d, q);
        expect(
          [...ns].sort((a, b) => a - b),
          `${d.id} q${q}`,
        ).toEqual(ns);
      }
    }
  });
});

describe('device diagram positions', () => {
  /**
   * `positions` is presentation data, but the coupling map is a real product
   * surface: two qubits sharing a coordinate would silently overlap in the
   * diagram, and a shifted coordinate would misrepresent the device shape.
   */
  it('gives every qubit of every device a distinct coordinate', () => {
    for (const device of DEVICES) {
      expect(device.positions).toHaveLength(device.numQubits);
      const seen = new Set(device.positions.map(([x, y]) => `${x},${y}`));
      expect(seen.size).toBe(device.numQubits);
    }
  });

  it('lays out the T-shaped device as a T', () => {
    expect(getDevice('tee-7').positions).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });

  it('lays out the 3x3 grid device as a grid', () => {
    expect(getDevice('grid-3x3').positions).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });
});
