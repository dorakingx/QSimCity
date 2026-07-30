import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { gateDef, matEqualUpToGlobalPhase, matIdentity } from '@qsimcity/domain';
import { basisOpsMatrix, normalizeAngle, unitaryToBasisOps, zyzAngles } from '../src/euler.js';

describe('normalizeAngle', () => {
  it('wraps into (-pi, pi]', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngle(2 * Math.PI + 0.1)).toBeCloseTo(0.1, 12);
    expect(normalizeAngle(-0.1)).toBeCloseTo(-0.1, 12);
  });
});

describe('zyzAngles + unitaryToBasisOps', () => {
  const namedGates = ['id', 'x', 'y', 'z', 'h', 's', 'sdg', 't', 'tdg', 'sx', 'sxdg'] as const;

  for (const name of namedGates) {
    it(`reconstructs ${name} in the {rz, sx, x} basis up to global phase`, () => {
      const u = gateDef(name).matrix([]);
      const ops = unitaryToBasisOps(u);
      expect(matEqualUpToGlobalPhase(basisOpsMatrix(ops), u, 2, 1e-8)).toBe(true);
      for (const op of ops) expect(['rz', 'sx', 'x']).toContain(op.name);
    });
  }

  it('identity translates to an empty sequence', () => {
    expect(unitaryToBasisOps(gateDef('id').matrix([]))).toEqual([]);
  });

  it('z translates to a single rz', () => {
    const ops = unitaryToBasisOps(gateDef('z').matrix([]));
    expect(ops).toHaveLength(1);
    expect(ops[0]!.name).toBe('rz');
  });

  it('sx translates to itself', () => {
    expect(unitaryToBasisOps(gateDef('sx').matrix([]))).toEqual([{ name: 'sx' }]);
  });

  it('x translates to a single x', () => {
    expect(unitaryToBasisOps(gateDef('x').matrix([]))).toEqual([{ name: 'x' }]);
  });

  it('property: any u(theta, phi, lambda) reconstructs up to global phase', () => {
    const angle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });
    fc.assert(
      fc.property(angle, angle, angle, (theta, phi, lambda) => {
        const u = gateDef('u').matrix([theta, phi, lambda]);
        const ops = unitaryToBasisOps(u);
        if (ops.length > 5) return false;
        return matEqualUpToGlobalPhase(basisOpsMatrix(ops), u, 2, 1e-7);
      }),
      { numRuns: 300 },
    );
  });

  it('property: rotation gates reconstruct for arbitrary angles', () => {
    const angle = fc.double({ min: -10, max: 10, noNaN: true });
    for (const name of ['rx', 'ry', 'rz', 'p'] as const) {
      fc.assert(
        fc.property(angle, (theta) => {
          const u = gateDef(name).matrix([theta]);
          const ops = unitaryToBasisOps(u);
          return matEqualUpToGlobalPhase(basisOpsMatrix(ops), u, 2, 1e-7);
        }),
        { numRuns: 100 },
      );
    }
  });

  it('zyz angles of the identity are zero-equivalent', () => {
    const angles = zyzAngles(matIdentity(2));
    expect(angles.theta).toBe(0);
    expect(normalizeAngle(angles.phi + angles.lambda)).toBeCloseTo(0, 10);
  });

  it('emits at most 5 operations for any unitary', () => {
    const angle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });
    fc.assert(
      fc.property(angle, angle, angle, (a, b, c) => {
        return unitaryToBasisOps(gateDef('u').matrix([a, b, c])).length <= 5;
      }),
      { numRuns: 200 },
    );
  });
});
