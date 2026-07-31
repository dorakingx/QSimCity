import type { ComplexMatrix } from '@qsimcity/domain';

/**
 * Statevector storage: separate re/im Float64Arrays of length 2^n, basis
 * index little-endian in qubit number (bit k of the index = qubit k), the
 * same convention Qiskit uses, so cross-validation needs no reindexing.
 */
export interface StateVector {
  readonly numQubits: number;
  readonly re: Float64Array;
  readonly im: Float64Array;
}

/** Exact statevector simulation is restricted to this many qubits (spec §12.1). */
export const MAX_EXACT_QUBITS = 12;

export function createState(numQubits: number): StateVector {
  if (!Number.isInteger(numQubits) || numQubits < 1) {
    throw new Error(`Qubit count must be a positive integer, got ${numQubits}`);
  }
  if (numQubits > MAX_EXACT_QUBITS) {
    throw new Error(
      `Exact statevector simulation supports at most ${MAX_EXACT_QUBITS} qubits, got ${numQubits}`,
    );
  }
  const size = 1 << numQubits;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re[0] = 1;
  return { numQubits, re, im };
}

export function cloneState(state: StateVector): StateVector {
  return {
    numQubits: state.numQubits,
    re: state.re.slice(),
    im: state.im.slice(),
  };
}

export function norm(state: StateVector): number {
  let sum = 0;
  for (let i = 0; i < state.re.length; i++) {
    sum += state.re[i]! * state.re[i]! + state.im[i]! * state.im[i]!;
  }
  return Math.sqrt(sum);
}

export function normalize(state: StateVector): void {
  const n = norm(state);
  if (n < 1e-300) throw new Error('Cannot normalize a zero statevector');
  const inv = 1 / n;
  for (let i = 0; i < state.re.length; i++) {
    state.re[i]! *= inv;
    state.im[i]! *= inv;
  }
}

/** Applies a 2x2 gate matrix to `target`, in place. */
export function applyGate1(state: StateVector, m: ComplexMatrix, target: number): void {
  checkQubit(state, target);
  const { re, im } = state;
  const bit = 1 << target;
  const m00r = m[0]!,
    m00i = m[1]!,
    m01r = m[2]!,
    m01i = m[3]!;
  const m10r = m[4]!,
    m10i = m[5]!,
    m11r = m[6]!,
    m11i = m[7]!;
  const size = re.length;
  for (let base = 0; base < size; base++) {
    if ((base & bit) !== 0) continue;
    const j = base | bit;
    const ar = re[base]!,
      ai = im[base]!;
    const br = re[j]!,
      bi = im[j]!;
    re[base] = m00r * ar - m00i * ai + m01r * br - m01i * bi;
    im[base] = m00r * ai + m00i * ar + m01r * bi + m01i * br;
    re[j] = m10r * ar - m10i * ai + m11r * br - m11i * bi;
    im[j] = m10r * ai + m10i * ar + m11r * bi + m11i * br;
  }
}

/**
 * Applies a 4x4 gate matrix to qubits [q0, q1] where q0 is bit 0 of the
 * gate's local index (matching the domain gate-matrix convention).
 */
export function applyGate2(state: StateVector, m: ComplexMatrix, q0: number, q1: number): void {
  checkQubit(state, q0);
  checkQubit(state, q1);
  if (q0 === q1) throw new Error('Two-qubit gate requires distinct qubits');
  const { re, im } = state;
  const b0 = 1 << q0;
  const b1 = 1 << q1;
  const size = re.length;
  const outR = new Float64Array(4);
  const outI = new Float64Array(4);
  const inR = new Float64Array(4);
  const inI = new Float64Array(4);
  for (let base = 0; base < size; base++) {
    if ((base & b0) !== 0 || (base & b1) !== 0) continue;
    const idx = [base, base | b0, base | b1, base | b0 | b1];
    for (let k = 0; k < 4; k++) {
      inR[k] = re[idx[k]!]!;
      inI[k] = im[idx[k]!]!;
    }
    for (let row = 0; row < 4; row++) {
      let sr = 0;
      let si = 0;
      for (let col = 0; col < 4; col++) {
        const mr = m[2 * (row * 4 + col)]!;
        const mi = m[2 * (row * 4 + col) + 1]!;
        sr += mr * inR[col]! - mi * inI[col]!;
        si += mr * inI[col]! + mi * inR[col]!;
      }
      outR[row] = sr;
      outI[row] = si;
    }
    for (let k = 0; k < 4; k++) {
      re[idx[k]!] = outR[k]!;
      im[idx[k]!] = outI[k]!;
    }
  }
}

/** Applies an 8x8 gate matrix to qubits [q0, q1, q2] (q0 = local bit 0). */
export function applyGate3(
  state: StateVector,
  m: ComplexMatrix,
  q0: number,
  q1: number,
  q2: number,
): void {
  checkQubit(state, q0);
  checkQubit(state, q1);
  checkQubit(state, q2);
  if (new Set([q0, q1, q2]).size !== 3) {
    throw new Error('Three-qubit gate requires distinct qubits');
  }
  const { re, im } = state;
  const bits = [1 << q0, 1 << q1, 1 << q2] as const;
  const mask = bits[0] | bits[1] | bits[2];
  const size = re.length;
  const idx = new Array<number>(8);
  const inR = new Float64Array(8);
  const inI = new Float64Array(8);
  const outR = new Float64Array(8);
  const outI = new Float64Array(8);
  for (let base = 0; base < size; base++) {
    if ((base & mask) !== 0) continue;
    for (let local = 0; local < 8; local++) {
      let i = base;
      if (local & 1) i |= bits[0];
      if (local & 2) i |= bits[1];
      if (local & 4) i |= bits[2];
      idx[local] = i;
      inR[local] = re[i]!;
      inI[local] = im[i]!;
    }
    for (let row = 0; row < 8; row++) {
      let sr = 0;
      let si = 0;
      for (let col = 0; col < 8; col++) {
        const mr = m[2 * (row * 8 + col)]!;
        const mi = m[2 * (row * 8 + col) + 1]!;
        sr += mr * inR[col]! - mi * inI[col]!;
        si += mr * inI[col]! + mi * inR[col]!;
      }
      outR[row] = sr;
      outI[row] = si;
    }
    for (let local = 0; local < 8; local++) {
      re[idx[local]!] = outR[local]!;
      im[idx[local]!] = outI[local]!;
    }
  }
}

/** P(qubit = 1). */
export function probabilityOfOne(state: StateVector, qubit: number): number {
  checkQubit(state, qubit);
  const bit = 1 << qubit;
  let p = 0;
  for (let i = 0; i < state.re.length; i++) {
    if ((i & bit) !== 0) p += state.re[i]! * state.re[i]! + state.im[i]! * state.im[i]!;
  }
  return p;
}

/** Projects `qubit` onto `outcome` and renormalizes (measurement collapse). */
export function collapse(state: StateVector, qubit: number, outcome: 0 | 1): void {
  checkQubit(state, qubit);
  const bit = 1 << qubit;
  for (let i = 0; i < state.re.length; i++) {
    const isOne = (i & bit) !== 0;
    if ((outcome === 1) !== isOne) {
      state.re[i] = 0;
      state.im[i] = 0;
    }
  }
  normalize(state);
}

/** Full probability distribution over basis states. */
export function probabilities(state: StateVector): Float64Array {
  const out = new Float64Array(state.re.length);
  for (let i = 0; i < state.re.length; i++) {
    out[i] = state.re[i]! * state.re[i]! + state.im[i]! * state.im[i]!;
  }
  return out;
}

/** Basis index formatted as a bitstring with qubit 0 rightmost. */
export function indexToBitstring(index: number, numQubits: number): string {
  return index.toString(2).padStart(numQubits, '0');
}

function checkQubit(state: StateVector, qubit: number): void {
  if (!Number.isInteger(qubit) || qubit < 0 || qubit >= state.numQubits) {
    throw new Error(`Qubit ${qubit} outside 0..${state.numQubits - 1}`);
  }
}
