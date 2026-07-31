import { gateDef, matMul, type ComplexMatrix } from '@qsimcity/domain';

/**
 * ZYZ Euler decomposition of an arbitrary 2x2 unitary:
 * U = e^{i alpha} Rz(phi) Ry(theta) Rz(lambda).
 * Used to translate every 1-qubit gate into the native basis
 * {rz, sx} via the standard identity
 * U(theta, phi, lambda) = Rz(phi+pi) SX Rz(theta+pi) SX Rz(lambda)
 * (up to global phase), the same construction IBM backends use.
 */

export interface EulerAngles {
  readonly theta: number;
  readonly phi: number;
  readonly lambda: number;
}

const ATOL = 1e-10;

export function zyzAngles(u: ComplexMatrix): EulerAngles {
  const ar = u[0]!,
    ai = u[1]!; // U[0][0]
  const br = u[2]!,
    bi = u[3]!; // U[0][1]
  const cr = u[4]!,
    ci = u[5]!; // U[1][0]
  const dr = u[6]!,
    di = u[7]!; // U[1][1]
  const absA = Math.hypot(ar, ai);
  const absC = Math.hypot(cr, ci);
  const theta = 2 * Math.atan2(absC, absA);
  if (absC < ATOL) {
    // Diagonal-dominant: only phi + lambda is defined; put it all in lambda.
    return { theta: 0, phi: 0, lambda: Math.atan2(di, dr) - Math.atan2(ai, ar) };
  }
  if (absA < ATOL) {
    // Anti-diagonal: only phi - lambda is defined.
    return {
      theta: Math.PI,
      phi: Math.atan2(ci, cr) - Math.atan2(-bi, -br),
      lambda: 0,
    };
  }
  const phi = Math.atan2(ci, cr) - Math.atan2(ai, ar);
  const lambda = Math.atan2(di, dr) - Math.atan2(ci, cr);
  return { theta, phi, lambda };
}

export interface BasisGateOp {
  readonly name: 'rz' | 'sx' | 'x';
  readonly param?: number;
}

/** Normalizes an angle to (-pi, pi]. */
export function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/**
 * Translates a 1-qubit unitary into a minimal {rz, sx, x} sequence
 * (application order: first element applied first).
 */
export function unitaryToBasisOps(u: ComplexMatrix): BasisGateOp[] {
  const { theta, phi, lambda } = zyzAngles(u);
  const halfPi = Math.PI / 2;
  const isZero = (x: number): boolean => Math.abs(normalizeAngle(x)) < ATOL;
  const isPi = (x: number): boolean => Math.abs(Math.abs(normalizeAngle(x)) - Math.PI) < ATOL;

  // theta == 0: pure Z rotation.
  if (isZero(theta)) {
    const total = normalizeAngle(phi + lambda);
    return isZero(total) ? [] : [{ name: 'rz', param: total }];
  }
  // SX = e^{i pi/4} Rz(-pi/2) Ry(pi/2) Rz(pi/2): single-sx shortcut.
  if (Math.abs(theta - halfPi) < ATOL && isZero(phi + halfPi) && isZero(lambda - halfPi)) {
    return [{ name: 'sx' }];
  }
  // X = e^{i alpha} Rz(phi) Ry(pi) Rz(lambda) exactly when theta == pi and
  // phi - lambda == +/- pi (both off-diagonal entries equal up to phase).
  if (isPi(theta) && isPi(phi - lambda)) {
    return [{ name: 'x' }];
  }
  const ops: BasisGateOp[] = [];
  const push = (angle: number): void => {
    const a = normalizeAngle(angle);
    if (!isZero(a)) ops.push({ name: 'rz', param: a });
  };
  push(lambda);
  ops.push({ name: 'sx' });
  push(theta + Math.PI);
  ops.push({ name: 'sx' });
  push(phi + Math.PI);
  return ops;
}

/** Composes the matrix of a basis-op sequence (for verification). */
export function basisOpsMatrix(ops: readonly BasisGateOp[]): ComplexMatrix {
  let m = gateDef('id').matrix([]);
  for (const op of ops) {
    const g = op.name === 'rz' ? gateDef('rz').matrix([op.param!]) : gateDef(op.name).matrix([]);
    // Applied after existing sequence: total = g · m
    m = matMul(g, m, 2);
  }
  return m;
}
