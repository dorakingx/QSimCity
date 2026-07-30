import { gateDef, type Rng } from '@qsimcity/domain';
import { applyGate1, collapse, normalize, probabilityOfOne, type StateVector } from './statevector.js';

/**
 * Noise channels implemented with the quantum-trajectory (Monte Carlo wave
 * function) method: each shot stochastically selects one Kraus branch with
 * its Born probability, so ensemble statistics converge to the channel's
 * density-matrix action. Results are classified SAMPLED/ESTIMATED — never
 * EXACT (docs/scientific-accuracy.md).
 */

export interface NoiseModel {
  /** Probability a measured bit is flipped at readout. */
  readonly readoutError: number;
  /** Depolarizing probability applied after each 1-qubit gate. */
  readonly depolarizing1q: number;
  /** Depolarizing probability applied after each 2-qubit gate (per gate). */
  readonly depolarizing2q: number;
  /** Amplitude-damping parameter gamma applied after each gate per qubit. */
  readonly amplitudeDamping: number;
  /** Phase-damping parameter lambda applied after each gate per qubit. */
  readonly phaseDamping: number;
}

export const ZERO_NOISE: NoiseModel = {
  readoutError: 0,
  depolarizing1q: 0,
  depolarizing2q: 0,
  amplitudeDamping: 0,
  phaseDamping: 0,
};

export function isZeroNoise(model: NoiseModel): boolean {
  return (
    model.readoutError === 0 &&
    model.depolarizing1q === 0 &&
    model.depolarizing2q === 0 &&
    model.amplitudeDamping === 0 &&
    model.phaseDamping === 0
  );
}

export function validateNoiseModel(model: NoiseModel): void {
  for (const [key, value] of Object.entries(model)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Noise parameter ${key} must be within [0, 1], got ${value}`);
    }
  }
}

export type AppliedNoise =
  | { kind: 'depolarizing'; qubit: number; pauli: 'x' | 'y' | 'z' }
  | { kind: 'amplitude_damping'; qubit: number; decayed: boolean }
  | { kind: 'phase_damping'; qubit: number; dephased: boolean };

/**
 * Depolarizing channel via stochastic Pauli insertion: with probability p,
 * one of X, Y, Z (uniform) is applied. Returns the event when a Pauli fired.
 */
export function applyDepolarizing(
  state: StateVector,
  qubit: number,
  p: number,
  rng: Rng,
): AppliedNoise | null {
  if (p <= 0) return null;
  if (rng.next() >= p) return null;
  const paulis = ['x', 'y', 'z'] as const;
  const pauli = paulis[Math.floor(rng.next() * 3)]!;
  applyGate1(state, gateDef(pauli).matrix([]), qubit);
  return { kind: 'depolarizing', qubit, pauli };
}

/**
 * Amplitude damping (energy relaxation toward |0>), trajectory form.
 * K0 = diag(1, sqrt(1-gamma)); K1 = |0><1| * sqrt(gamma).
 * Branch K1 fires with probability gamma * P(|1>).
 */
export function applyAmplitudeDamping(
  state: StateVector,
  qubit: number,
  gamma: number,
  rng: Rng,
): AppliedNoise | null {
  if (gamma <= 0) return null;
  const p1 = probabilityOfOne(state, qubit);
  const pDecay = gamma * p1;
  if (rng.next() < pDecay) {
    // K1 branch: the qubit relaxes to |0>. Project onto |1>, then flip.
    collapse(state, qubit, 1);
    applyGate1(state, gateDef('x').matrix([]), qubit);
    return { kind: 'amplitude_damping', qubit, decayed: true };
  }
  // K0 branch: |1> amplitude shrinks by sqrt(1-gamma); renormalize.
  const bit = 1 << qubit;
  const factor = Math.sqrt(1 - gamma);
  for (let i = 0; i < state.re.length; i++) {
    if ((i & bit) !== 0) {
      state.re[i]! *= factor;
      state.im[i]! *= factor;
    }
  }
  normalize(state);
  return null;
}

/**
 * Phase damping (pure dephasing), trajectory form.
 * K0 = diag(1, sqrt(1-lambda)); K1 = diag(0, sqrt(lambda)).
 * Branch K1 fires with probability lambda * P(|1>) and projects onto |1>.
 */
export function applyPhaseDamping(
  state: StateVector,
  qubit: number,
  lambda: number,
  rng: Rng,
): AppliedNoise | null {
  if (lambda <= 0) return null;
  const p1 = probabilityOfOne(state, qubit);
  const pProject = lambda * p1;
  if (rng.next() < pProject) {
    collapse(state, qubit, 1);
    return { kind: 'phase_damping', qubit, dephased: true };
  }
  const bit = 1 << qubit;
  const factor = Math.sqrt(1 - lambda);
  for (let i = 0; i < state.re.length; i++) {
    if ((i & bit) !== 0) {
      state.re[i]! *= factor;
      state.im[i]! *= factor;
    }
  }
  normalize(state);
  return null;
}

/** Readout error: flips a classical measurement outcome with probability p. */
export function applyReadoutError(outcome: 0 | 1, p: number, rng: Rng): 0 | 1 {
  if (p <= 0) return outcome;
  if (rng.next() < p) return outcome === 0 ? 1 : 0;
  return outcome;
}
