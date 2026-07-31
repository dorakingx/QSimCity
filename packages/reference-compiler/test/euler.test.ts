import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { gateDef, matEqualUpToGlobalPhase, matIdentity, matMul } from '@qsimcity/domain';
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

describe('decomposition boundaries and composition', () => {
  /**
   * `zyzAngles` treats |U[1][0]| below ATOL as diagonal. Exactly at the
   * tolerance the matrix is not diagonal, so the general branch must run —
   * a strict-versus-inclusive comparison here silently changes which
   * decomposition every borderline gate receives.
   */
  it('treats |U[1][0]| exactly at the tolerance as non-diagonal', () => {
    const atol = 1e-10;
    const boundary: number[] = [
      1,
      0, // U[0][0]
      0,
      0, // U[0][1]
      atol,
      0, // U[1][0]: exactly at the tolerance
      1,
      0, // U[1][1]
    ];
    const angles = zyzAngles(Float64Array.from(boundary));
    // The diagonal branch returns theta === 0; the general branch does not.
    expect(angles.theta).toBeGreaterThan(0);
    expect(angles.theta).toBeCloseTo(2 * atol, 15);

    const belowBoundary = Float64Array.from([1, 0, 0, 0, atol / 2, 0, 1, 0]);
    expect(zyzAngles(belowBoundary).theta).toBe(0);
  });

  it('composes each basis op with its own gate definition', () => {
    // Every op must be built from its own name and its own parameters. Reading
    // the wrong branch produces a plausible-looking 2x2 matrix, so the check
    // is against the gate definitions themselves rather than against a
    // property that both branches satisfy.
    const angle = Math.PI / 3;
    expect(Array.from(basisOpsMatrix([{ name: 'rz', param: angle }]))).toEqual(
      Array.from(gateDef('rz').matrix([angle])),
    );
    expect(Array.from(basisOpsMatrix([{ name: 'x' }]))).toEqual(
      Array.from(gateDef('x').matrix([])),
    );
    expect(Array.from(basisOpsMatrix([{ name: 'sx' }]))).toEqual(
      Array.from(gateDef('sx').matrix([])),
    );

    // A mixed sequence composes in application order: total = g_n · ... · g_1.
    const mixed = basisOpsMatrix([{ name: 'rz', param: angle }, { name: 'x' }]);
    const expected = matMul(gateDef('x').matrix([]), gateDef('rz').matrix([angle]), 2);
    expect(Array.from(mixed)).toEqual(Array.from(expected));
  });
});
