import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  matDagger,
  matEqualUpToGlobalPhase,
  matIdentity,
  matMaxDiff,
  matMul,
} from '../src/complex.js';
import { GATE_DEFS, gateDef, isKnownGate, TWO_QUBIT_GATES } from '../src/gates.js';

function randomParams(count: number, seedIndex: number): number[] {
  return Array.from({ length: count }, (_, i) => ((seedIndex * 37 + i * 13) % 63) / 10 - 3.1);
}

describe('gate registry', () => {
  it('contains every gate the product promises to support', () => {
    for (const name of ['id', 'x', 'y', 'z', 'h', 's', 'sdg', 't', 'tdg', 'rx', 'ry', 'rz', 'cx', 'cz', 'swap', 'ccx']) {
      expect(isKnownGate(name), name).toBe(true);
    }
  });

  it('rejects unknown gate lookups', () => {
    expect(() => gateDef('nonsense')).toThrow(/Unknown gate/);
  });

  it('classifies two-qubit gates', () => {
    expect(TWO_QUBIT_GATES.has('cx')).toBe(true);
    expect(TWO_QUBIT_GATES.has('ccx')).toBe(false);
    expect(TWO_QUBIT_GATES.has('h')).toBe(false);
  });

  it('every gate matrix is unitary (U·U† = I)', () => {
    for (const def of Object.values(GATE_DEFS)) {
      const dim = 2 ** def.numQubits;
      for (let trial = 0; trial < 3; trial++) {
        const params = randomParams(def.numParams, trial + 1);
        const m = def.matrix(params);
        expect(m.length).toBe(dim * dim * 2);
        const product = matMul(m, matDagger(m, dim), dim);
        expect(matMaxDiff(product, matIdentity(dim)), `${def.name} unitarity`).toBeLessThan(1e-10);
      }
    }
  });
});

describe('specific gate matrices', () => {
  it('X flips basis states', () => {
    const x = gateDef('x').matrix([]);
    // column 0 -> row 1
    expect(x[2 * 2]).toBe(1); // M[1][0]
    expect(x[0]).toBe(0);
  });

  it('H·H = I', () => {
    const h = gateDef('h').matrix([]);
    expect(matMaxDiff(matMul(h, h, 2), matIdentity(2))).toBeLessThan(1e-12);
  });

  it('S·S = Z and T·T = S', () => {
    const s = gateDef('s').matrix([]);
    const t = gateDef('t').matrix([]);
    const z = gateDef('z').matrix([]);
    expect(matMaxDiff(matMul(s, s, 2), z)).toBeLessThan(1e-12);
    expect(matMaxDiff(matMul(t, t, 2), s)).toBeLessThan(1e-12);
  });

  it('Sdg and Tdg are inverses of S and T', () => {
    const s = gateDef('s').matrix([]);
    const sdg = gateDef('sdg').matrix([]);
    const t = gateDef('t').matrix([]);
    const tdg = gateDef('tdg').matrix([]);
    expect(matMaxDiff(matMul(s, sdg, 2), matIdentity(2))).toBeLessThan(1e-12);
    expect(matMaxDiff(matMul(t, tdg, 2), matIdentity(2))).toBeLessThan(1e-12);
  });

  it('SX·SX = X and SXdg is its inverse', () => {
    const sx = gateDef('sx').matrix([]);
    const sxdg = gateDef('sxdg').matrix([]);
    const x = gateDef('x').matrix([]);
    expect(matMaxDiff(matMul(sx, sx, 2), x)).toBeLessThan(1e-12);
    expect(matMaxDiff(matMul(sx, sxdg, 2), matIdentity(2))).toBeLessThan(1e-12);
  });

  it('rx(π) equals X up to global phase', () => {
    const rx = gateDef('rx').matrix([Math.PI]);
    expect(matEqualUpToGlobalPhase(rx, gateDef('x').matrix([]), 2)).toBe(true);
  });

  it('ry(π) equals Y up to global phase', () => {
    const ry = gateDef('ry').matrix([Math.PI]);
    expect(matEqualUpToGlobalPhase(ry, gateDef('y').matrix([]), 2)).toBe(true);
  });

  it('rz(π) equals Z up to global phase', () => {
    const rz = gateDef('rz').matrix([Math.PI]);
    expect(matEqualUpToGlobalPhase(rz, gateDef('z').matrix([]), 2)).toBe(true);
  });

  it('rz(θ) equals p(θ) up to global phase', () => {
    fc.assert(
      fc.property(fc.double({ min: -6.28, max: 6.28, noNaN: true }), (theta) => {
        const rz = gateDef('rz').matrix([theta]);
        const p = gateDef('p').matrix([theta]);
        return matEqualUpToGlobalPhase(rz, p, 2);
      }),
      { numRuns: 50 },
    );
  });

  it('u(θ,φ,λ) reduces to ry(θ) when φ=λ=0', () => {
    const u = gateDef('u').matrix([1.1, 0, 0]);
    const ry = gateDef('ry').matrix([1.1]);
    expect(matMaxDiff(u, ry)).toBeLessThan(1e-12);
  });

  it('rotation angles are 2π-periodic up to global phase', () => {
    for (const name of ['rx', 'ry', 'rz']) {
      const a = gateDef(name).matrix([0.7]);
      const b = gateDef(name).matrix([0.7 + 2 * Math.PI]);
      expect(matEqualUpToGlobalPhase(a, b, 2), name).toBe(true);
    }
  });

  it('CX maps |10> (control=1, target=0) to |11>', () => {
    const cx = gateDef('cx').matrix([]);
    // local index 1 = control set. Expect M[3][1] = 1.
    expect(cx[2 * (3 * 4 + 1)]).toBe(1);
    expect(cx[2 * (1 * 4 + 1)]).toBe(0);
  });

  it('CZ is diagonal with a single -1 on |11>', () => {
    const cz = gateDef('cz').matrix([]);
    expect(cz[2 * (0 * 4 + 0)]).toBe(1);
    expect(cz[2 * (3 * 4 + 3)]).toBe(-1);
  });

  it('SWAP exchanges |01> and |10>', () => {
    const swap = gateDef('swap').matrix([]);
    expect(swap[2 * (2 * 4 + 1)]).toBe(1);
    expect(swap[2 * (1 * 4 + 2)]).toBe(1);
    expect(swap[2 * (1 * 4 + 1)]).toBe(0);
  });

  it('CCX swaps only |011> and |111> (controls set)', () => {
    const ccx = gateDef('ccx').matrix([]);
    expect(ccx[2 * (7 * 8 + 3)]).toBe(1);
    expect(ccx[2 * (3 * 8 + 7)]).toBe(1);
    expect(ccx[2 * (5 * 8 + 5)]).toBe(1);
    expect(ccx[2 * (3 * 8 + 3)]).toBe(0);
  });

  it('cp(λ) applies phase only to |11>', () => {
    const l = 0.9;
    const cp = gateDef('cp').matrix([l]);
    expect(cp[2 * (3 * 4 + 3)]).toBeCloseTo(Math.cos(l), 12);
    expect(cp[2 * (3 * 4 + 3) + 1]).toBeCloseTo(Math.sin(l), 12);
    expect(cp[2 * (1 * 4 + 1)]).toBe(1);
  });
});
