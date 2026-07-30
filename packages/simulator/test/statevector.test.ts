import { describe, expect, it } from 'vitest';
import { gateDef } from '@qsimcity/domain';
import {
  applyGate1,
  applyGate2,
  applyGate3,
  cloneState,
  collapse,
  createState,
  indexToBitstring,
  norm,
  probabilities,
  probabilityOfOne,
  MAX_EXACT_QUBITS,
} from '../src/statevector.js';

const H = gateDef('h').matrix([]);
const X = gateDef('x').matrix([]);
const CX = gateDef('cx').matrix([]);
const SWAP = gateDef('swap').matrix([]);
const CCX = gateDef('ccx').matrix([]);

describe('createState', () => {
  it('initializes to |0...0>', () => {
    const s = createState(3);
    expect(s.re[0]).toBe(1);
    expect(norm(s)).toBeCloseTo(1, 12);
    expect(probabilityOfOne(s, 0)).toBe(0);
  });

  it('enforces the exact-simulation qubit limit', () => {
    expect(() => createState(MAX_EXACT_QUBITS + 1)).toThrow(/at most 12 qubits/);
    expect(() => createState(0)).toThrow(/positive integer/);
    expect(createState(MAX_EXACT_QUBITS).re.length).toBe(2 ** MAX_EXACT_QUBITS);
  });
});

describe('applyGate1', () => {
  it('X flips qubit 0: |00> -> |01>', () => {
    const s = createState(2);
    applyGate1(s, X, 0);
    // Basis index 1 = qubit0 set (little-endian).
    expect(s.re[1]).toBeCloseTo(1, 12);
    expect(probabilityOfOne(s, 0)).toBeCloseTo(1, 12);
    expect(probabilityOfOne(s, 1)).toBeCloseTo(0, 12);
  });

  it('X on qubit 1 targets basis index 2', () => {
    const s = createState(2);
    applyGate1(s, X, 1);
    expect(s.re[2]).toBeCloseTo(1, 12);
  });

  it('H creates an equal superposition', () => {
    const s = createState(1);
    applyGate1(s, H, 0);
    expect(probabilityOfOne(s, 0)).toBeCloseTo(0.5, 12);
    expect(norm(s)).toBeCloseTo(1, 12);
  });

  it('preserves normalization under many gates', () => {
    const s = createState(3);
    const RY = gateDef('ry');
    for (let i = 0; i < 60; i++) {
      applyGate1(s, RY.matrix([0.1 + i * 0.05]), i % 3);
    }
    expect(norm(s)).toBeCloseTo(1, 10);
  });

  it('rejects out-of-range qubits', () => {
    const s = createState(2);
    expect(() => applyGate1(s, X, 2)).toThrow(/outside/);
    expect(() => applyGate1(s, X, -1)).toThrow(/outside/);
  });
});

describe('applyGate2', () => {
  it('CX with control=0 leaves target unchanged', () => {
    const s = createState(2);
    applyGate2(s, CX, 0, 1);
    expect(s.re[0]).toBeCloseTo(1, 12);
  });

  it('CX with control=1 flips the target', () => {
    const s = createState(2);
    applyGate1(s, X, 0); // control (qubit 0) to |1>
    applyGate2(s, CX, 0, 1);
    // Expect |11> = index 3
    expect(s.re[3]).toBeCloseTo(1, 12);
  });

  it('argument order matters: control and target are positional', () => {
    const s = createState(2);
    applyGate1(s, X, 0);
    applyGate2(s, CX, 1, 0); // control = qubit 1 (which is |0>)
    expect(s.re[1]).toBeCloseTo(1, 12); // unchanged
  });

  it('H + CX produces a Bell state', () => {
    const s = createState(2);
    applyGate1(s, H, 0);
    applyGate2(s, CX, 0, 1);
    const p = probabilities(s);
    expect(p[0]).toBeCloseTo(0.5, 12);
    expect(p[3]).toBeCloseTo(0.5, 12);
    expect(p[1]).toBeCloseTo(0, 12);
    expect(p[2]).toBeCloseTo(0, 12);
  });

  it('SWAP exchanges qubit states', () => {
    const s = createState(2);
    applyGate1(s, X, 0);
    applyGate2(s, SWAP, 0, 1);
    expect(s.re[2]).toBeCloseTo(1, 12);
  });

  it('works on non-adjacent qubits', () => {
    const s = createState(3);
    applyGate1(s, X, 0);
    applyGate2(s, CX, 0, 2);
    // qubits 0 and 2 set: index 5
    expect(s.re[5]).toBeCloseTo(1, 12);
  });

  it('rejects duplicate qubits', () => {
    const s = createState(2);
    expect(() => applyGate2(s, CX, 1, 1)).toThrow(/distinct/);
  });
});

describe('applyGate3', () => {
  it('CCX flips target only when both controls are set', () => {
    const s = createState(3);
    applyGate1(s, X, 0);
    applyGate1(s, X, 1);
    applyGate3(s, CCX, 0, 1, 2);
    expect(s.re[7]).toBeCloseTo(1, 12);
  });

  it('CCX leaves state alone when a control is unset', () => {
    const s = createState(3);
    applyGate1(s, X, 0);
    applyGate3(s, CCX, 0, 1, 2);
    expect(s.re[1]).toBeCloseTo(1, 12);
  });

  it('rejects duplicate qubits', () => {
    const s = createState(3);
    expect(() => applyGate3(s, CCX, 0, 1, 1)).toThrow(/distinct/);
  });
});

describe('collapse', () => {
  it('projects onto the measured outcome and renormalizes', () => {
    const s = createState(2);
    applyGate1(s, H, 0);
    applyGate2(s, CX, 0, 1);
    collapse(s, 0, 1);
    // Bell state collapsed on qubit0=1 must be |11>.
    expect(s.re[3]).toBeCloseTo(1, 12);
    expect(norm(s)).toBeCloseTo(1, 12);
    expect(probabilityOfOne(s, 1)).toBeCloseTo(1, 12);
  });

  it('collapse to outcome 0 keeps only matching amplitudes', () => {
    const s = createState(1);
    applyGate1(s, H, 0);
    collapse(s, 0, 0);
    expect(s.re[0]).toBeCloseTo(1, 12);
    expect(probabilityOfOne(s, 0)).toBeCloseTo(0, 12);
  });

  it('throws when collapsing onto a zero-probability branch', () => {
    const s = createState(1);
    expect(() => collapse(s, 0, 1)).toThrow(/zero statevector/);
  });
});

describe('helpers', () => {
  it('cloneState is independent of the original', () => {
    const s = createState(1);
    const c = cloneState(s);
    applyGate1(s, X, 0);
    expect(c.re[0]).toBe(1);
    expect(s.re[0]).toBeCloseTo(0, 12);
  });

  it('indexToBitstring places qubit 0 rightmost', () => {
    expect(indexToBitstring(1, 3)).toBe('001');
    expect(indexToBitstring(4, 3)).toBe('100');
    expect(indexToBitstring(0, 2)).toBe('00');
  });

  it('probabilities sums to 1 for any circuit state', () => {
    const s = createState(3);
    applyGate1(s, H, 0);
    applyGate1(s, H, 1);
    applyGate2(s, CX, 1, 2);
    const total = [...probabilities(s)].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
  });
});
