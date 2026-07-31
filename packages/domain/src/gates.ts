import { mat, type ComplexMatrix } from './complex.js';

/**
 * Gate matrix convention: for a gate applied to qubits [a, b, c], bit 0 of
 * the local basis index is qubit a's value, bit 1 is b's, bit 2 is c's
 * (little-endian over the argument list, matching Qiskit's convention so
 * cross-validation is direct). Matrices are row-major: M[out][in].
 */

export interface GateDef {
  readonly name: string;
  readonly numQubits: 1 | 2 | 3;
  readonly numParams: number;
  /** Human-readable label for UI use. */
  readonly label: string;
  readonly matrix: (params: readonly number[]) => ComplexMatrix;
}

const SQ2 = Math.SQRT1_2;

function fixed(m: ComplexMatrix): (params: readonly number[]) => ComplexMatrix {
  return () => m;
}

const MAT_I = mat([
  [1, 0],
  [0, 0],
  [0, 0],
  [1, 0],
]);
const MAT_X = mat([
  [0, 0],
  [1, 0],
  [1, 0],
  [0, 0],
]);
const MAT_Y = mat([
  [0, 0],
  [0, -1],
  [0, 1],
  [0, 0],
]);
const MAT_Z = mat([
  [1, 0],
  [0, 0],
  [0, 0],
  [-1, 0],
]);
const MAT_H = mat([
  [SQ2, 0],
  [SQ2, 0],
  [SQ2, 0],
  [-SQ2, 0],
]);
const MAT_S = mat([
  [1, 0],
  [0, 0],
  [0, 0],
  [0, 1],
]);
const MAT_SDG = mat([
  [1, 0],
  [0, 0],
  [0, 0],
  [0, -1],
]);
const T_PH = [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)] as const;
const MAT_T = mat([
  [1, 0],
  [0, 0],
  [0, 0],
  [T_PH[0], T_PH[1]],
]);
const MAT_TDG = mat([
  [1, 0],
  [0, 0],
  [0, 0],
  [T_PH[0], -T_PH[1]],
]);
const MAT_SX = mat([
  [0.5, 0.5],
  [0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
]);
const MAT_SXDG = mat([
  [0.5, -0.5],
  [0.5, 0.5],
  [0.5, 0.5],
  [0.5, -0.5],
]);

// Two-qubit matrices, qubit order [q0=first arg (bit0), q1=second arg (bit1)].
const MAT_CX = mat([
  // control = q0, target = q1
  [1, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [1, 0],
  [0, 0],
  [0, 0],
  [1, 0],
  [0, 0],
  [0, 0],
  [1, 0],
  [0, 0],
  [0, 0],
]);
const MAT_CZ = mat([
  [1, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [1, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [1, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [-1, 0],
]);
const MAT_SWAP = mat([
  [1, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [1, 0],
  [0, 0],
  [0, 0],
  [1, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
  [1, 0],
]);

function ccxMatrix(): ComplexMatrix {
  // controls = q0, q1; target = q2. Swaps basis states 3 (011) and 7 (111).
  const m = new Float64Array(64 * 2);
  for (let i = 0; i < 8; i++) {
    const out = i === 3 ? 7 : i === 7 ? 3 : i;
    m[2 * (out * 8 + i)] = 1;
  }
  return m;
}
const MAT_CCX = ccxMatrix();

function rx(params: readonly number[]): ComplexMatrix {
  const t = params[0]! / 2;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return mat([
    [c, 0],
    [0, -s],
    [0, -s],
    [c, 0],
  ]);
}

function ry(params: readonly number[]): ComplexMatrix {
  const t = params[0]! / 2;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return mat([
    [c, 0],
    [-s, 0],
    [s, 0],
    [c, 0],
  ]);
}

function rz(params: readonly number[]): ComplexMatrix {
  const t = params[0]! / 2;
  return mat([
    [Math.cos(t), -Math.sin(t)],
    [0, 0],
    [0, 0],
    [Math.cos(t), Math.sin(t)],
  ]);
}

/** Phase gate: diag(1, e^{iλ}). */
function phase(params: readonly number[]): ComplexMatrix {
  const l = params[0]!;
  return mat([
    [1, 0],
    [0, 0],
    [0, 0],
    [Math.cos(l), Math.sin(l)],
  ]);
}

/** Qiskit U(θ, φ, λ). */
function u3(params: readonly number[]): ComplexMatrix {
  const [th, ph, la] = [params[0]!, params[1]!, params[2]!];
  const c = Math.cos(th / 2);
  const s = Math.sin(th / 2);
  return mat([
    [c, 0],
    [-Math.cos(la) * s, -Math.sin(la) * s],
    [Math.cos(ph) * s, Math.sin(ph) * s],
    [Math.cos(ph + la) * c, Math.sin(ph + la) * c],
  ]);
}

/** Controlled-phase: diag(1, 1, 1, e^{iλ}). Symmetric in its qubits. */
function cphase(params: readonly number[]): ComplexMatrix {
  const l = params[0]!;
  return mat([
    [1, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [1, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [1, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [Math.cos(l), Math.sin(l)],
  ]);
}

export const GATE_DEFS: Readonly<Record<string, GateDef>> = {
  id: { name: 'id', numQubits: 1, numParams: 0, label: 'Identity', matrix: fixed(MAT_I) },
  x: { name: 'x', numQubits: 1, numParams: 0, label: 'Pauli-X', matrix: fixed(MAT_X) },
  y: { name: 'y', numQubits: 1, numParams: 0, label: 'Pauli-Y', matrix: fixed(MAT_Y) },
  z: { name: 'z', numQubits: 1, numParams: 0, label: 'Pauli-Z', matrix: fixed(MAT_Z) },
  h: { name: 'h', numQubits: 1, numParams: 0, label: 'Hadamard', matrix: fixed(MAT_H) },
  s: { name: 's', numQubits: 1, numParams: 0, label: 'S (phase)', matrix: fixed(MAT_S) },
  sdg: { name: 'sdg', numQubits: 1, numParams: 0, label: 'S-dagger', matrix: fixed(MAT_SDG) },
  t: { name: 't', numQubits: 1, numParams: 0, label: 'T', matrix: fixed(MAT_T) },
  tdg: { name: 'tdg', numQubits: 1, numParams: 0, label: 'T-dagger', matrix: fixed(MAT_TDG) },
  sx: { name: 'sx', numQubits: 1, numParams: 0, label: 'Sqrt-X', matrix: fixed(MAT_SX) },
  sxdg: {
    name: 'sxdg',
    numQubits: 1,
    numParams: 0,
    label: 'Sqrt-X-dagger',
    matrix: fixed(MAT_SXDG),
  },
  rx: { name: 'rx', numQubits: 1, numParams: 1, label: 'X rotation', matrix: rx },
  ry: { name: 'ry', numQubits: 1, numParams: 1, label: 'Y rotation', matrix: ry },
  rz: { name: 'rz', numQubits: 1, numParams: 1, label: 'Z rotation', matrix: rz },
  p: { name: 'p', numQubits: 1, numParams: 1, label: 'Phase', matrix: phase },
  u: { name: 'u', numQubits: 1, numParams: 3, label: 'Generic 1-qubit', matrix: u3 },
  cx: { name: 'cx', numQubits: 2, numParams: 0, label: 'CNOT', matrix: fixed(MAT_CX) },
  cz: { name: 'cz', numQubits: 2, numParams: 0, label: 'Controlled-Z', matrix: fixed(MAT_CZ) },
  cp: { name: 'cp', numQubits: 2, numParams: 1, label: 'Controlled-phase', matrix: cphase },
  swap: { name: 'swap', numQubits: 2, numParams: 0, label: 'SWAP', matrix: fixed(MAT_SWAP) },
  ccx: { name: 'ccx', numQubits: 3, numParams: 0, label: 'Toffoli', matrix: fixed(MAT_CCX) },
};

export const TWO_QUBIT_GATES: ReadonlySet<string> = new Set(['cx', 'cz', 'cp', 'swap']);

export function gateDef(name: string): GateDef {
  const def = GATE_DEFS[name];
  if (!def) throw new Error(`Unknown gate: ${name}`);
  return def;
}

export function isKnownGate(name: string): boolean {
  return name in GATE_DEFS;
}
