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
