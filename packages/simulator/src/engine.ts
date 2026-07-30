import {
  circuitMetrics,
  createRng,
  gateDef,
  type Circuit,
  type Instruction,
  type Rng,
} from '@qsimcity/domain';
import {
  applyAmplitudeDamping,
  applyDepolarizing,
  applyPhaseDamping,
  applyReadoutError,
  isZeroNoise,
  validateNoiseModel,
  ZERO_NOISE,
  type AppliedNoise,
  type NoiseModel,
} from './noise.js';
import {
  applyGate1,
  applyGate2,
  applyGate3,
  collapse,
  createState,
  indexToBitstring,
  probabilities,
  probabilityOfOne,
  MAX_EXACT_QUBITS,
  type StateVector,
} from './statevector.js';

export interface SimulationOptions {
  readonly shots: number;
  readonly seed: string;
  readonly noise?: NoiseModel | null;
  /** Called between shot batches; return true to abort. */
  readonly shouldCancel?: () => boolean;
  readonly onProgress?: (completedShots: number, totalShots: number) => void;
  /** Shots per synchronous batch before yielding to the event loop. */
  readonly batchSize?: number;
}

/** One replayable step from the representative (first) shot. */
export type EngineEvent =
  | {
      kind: 'gate';
      instructionId: string;
      name: string;
      qubits: readonly number[];
      params: readonly number[];
      skipped: boolean;
    }
  | { kind: 'noise'; instructionId: string; noise: AppliedNoise }
  | {
      kind: 'measurement';
      instructionId: string;
      qubit: number;
      clbit: number;
      outcome: 0 | 1;
      readoutFlipped: boolean;
    }
  | { kind: 'reset'; instructionId: string; qubit: number; outcome: 0 | 1 }
  | {
      kind: 'condition';
      instructionId: string;
      creg: string;
      expected: number;
      actual: number;
      satisfied: boolean;
    };

export interface SimulationResult {
  /**
   * Exact final probability distribution keyed by classical bitstring
   * (or qubit bitstring when the circuit measures nothing). Present only
   * for noise-free circuits without mid-circuit dynamics — the only case
   * where the label EXACT is honest.
   */
  readonly exactProbabilities: Readonly<Record<string, number>> | null;
  /** Sampled counts keyed by classical bitstring (clbit 0 rightmost). */
  readonly counts: Readonly<Record<string, number>>;
  readonly shots: number;
  /** Steps of the representative shot (shot 0) for trace playback. */
  readonly representativeEvents: readonly EngineEvent[];
  readonly noiseWasApplied: boolean;
  readonly dynamic: boolean;
  readonly seed: string;
}

export const MAX_SHOTS = 100_000;

/** True when per-shot trajectories are required even without noise. */
export function isDynamicCircuit(circuit: Circuit): boolean {
  const measuredOrReset = new Set<number>();
  for (const instr of circuit.instructions) {
    if (instr.condition) return true;
    if (instr.kind === 'reset') return true;
    if (instr.kind === 'measure') {
      for (const q of instr.qubits) measuredOrReset.add(q);
      continue;
    }
    if (instr.kind === 'gate') {
      // A gate acting on an already-measured qubit means mid-circuit
      // measurement, which branches the state.
      for (const q of instr.qubits) {
        if (measuredOrReset.has(q)) return true;
      }
    }
  }
  return false;
}

function applyGateInstr(state: StateVector, instr: Instruction): void {
  const def = gateDef(instr.name);
  const m = def.matrix(instr.params);
  if (def.numQubits === 1) applyGate1(state, m, instr.qubits[0]!);
  else if (def.numQubits === 2) applyGate2(state, m, instr.qubits[0]!, instr.qubits[1]!);
  else applyGate3(state, m, instr.qubits[0]!, instr.qubits[1]!, instr.qubits[2]!);
}

function cregValue(circuit: Circuit, clbits: Uint8Array, cregName: string): number {
  const reg = circuit.cregs.find((r) => r.name === cregName);
  if (!reg) throw new Error(`Unknown classical register: ${cregName}`);
  let value = 0;
  for (let k = 0; k < reg.size; k++) {
    if (clbits[reg.offset + k]! === 1) value |= 1 << k;
  }
  return value;
}

function clbitsToKey(clbits: Uint8Array): string {
  let out = '';
  for (let i = clbits.length - 1; i >= 0; i--) out += clbits[i]!;
  return out;
}

/** Runs one trajectory; mutates nothing outside its own state. */
function runTrajectory(
  circuit: Circuit,
  rng: Rng,
  noise: NoiseModel,
  recordEvents: boolean,
): { key: string; events: EngineEvent[] } {
  const state = createState(circuit.numQubits);
  const clbits = new Uint8Array(Math.max(1, circuit.numClbits));
  const events: EngineEvent[] = [];
  const noisy = !isZeroNoise(noise);

  const applyPerQubitNoise = (instr: Instruction): void => {
    if (!noisy) return;
    for (const q of instr.qubits) {
      const dep =
        instr.qubits.length >= 2
          ? applyDepolarizing(state, q, noise.depolarizing2q, rng)
          : applyDepolarizing(state, q, noise.depolarizing1q, rng);
      if (dep && recordEvents) events.push({ kind: 'noise', instructionId: instr.id, noise: dep });
      const ad = applyAmplitudeDamping(state, q, noise.amplitudeDamping, rng);
      if (ad && recordEvents) events.push({ kind: 'noise', instructionId: instr.id, noise: ad });
      const pd = applyPhaseDamping(state, q, noise.phaseDamping, rng);
      if (pd && recordEvents) events.push({ kind: 'noise', instructionId: instr.id, noise: pd });
    }
  };

  for (const instr of circuit.instructions) {
    if (instr.condition) {
      const actual = cregValue(circuit, clbits, instr.condition.creg);
      const satisfied = actual === instr.condition.value;
      if (recordEvents) {
        events.push({
          kind: 'condition',
          instructionId: instr.id,
          creg: instr.condition.creg,
          expected: instr.condition.value,
          actual,
          satisfied,
        });
      }
      if (!satisfied) {
        if (recordEvents && instr.kind === 'gate') {
          events.push({
            kind: 'gate',
            instructionId: instr.id,
            name: instr.name,
            qubits: instr.qubits,
            params: instr.params,
            skipped: true,
          });
        }
        continue;
      }
    }
    switch (instr.kind) {
      case 'gate': {
        applyGateInstr(state, instr);
        if (recordEvents) {
          events.push({
            kind: 'gate',
            instructionId: instr.id,
            name: instr.name,
            qubits: instr.qubits,
            params: instr.params,
            skipped: false,
          });
        }
        applyPerQubitNoise(instr);
        break;
      }
      case 'measure': {
        const qubit = instr.qubits[0]!;
        const clbit = instr.clbits[0]!;
        const p1 = probabilityOfOne(state, qubit);
        const trueOutcome: 0 | 1 = rng.next() < p1 ? 1 : 0;
        collapse(state, qubit, trueOutcome);
        const recorded = applyReadoutError(trueOutcome, noise.readoutError, rng);
        clbits[clbit] = recorded;
        if (recordEvents) {
          events.push({
            kind: 'measurement',
            instructionId: instr.id,
            qubit,
            clbit,
            outcome: recorded,
            readoutFlipped: recorded !== trueOutcome,
          });
        }
        break;
      }
      case 'reset': {
        const qubit = instr.qubits[0]!;
        const p1 = probabilityOfOne(state, qubit);
        const outcome: 0 | 1 = rng.next() < p1 ? 1 : 0;
        collapse(state, qubit, outcome);
        if (outcome === 1) applyGate1(state, gateDef('x').matrix([]), qubit);
        if (recordEvents) events.push({ kind: 'reset', instructionId: instr.id, qubit, outcome });
        break;
      }
      case 'barrier':
        break;
    }
  }
  return { key: circuit.numClbits > 0 ? clbitsToKey(clbits) : '', events };
}

/**
 * Exact single-pass evaluation for static (terminal-measurement, noise-free)
 * circuits. Returns the probability distribution over classical bitstrings,
 * or over qubit bitstrings when nothing is measured.
 */
function computeExactDistribution(circuit: Circuit): Record<string, number> {
  const state = createState(circuit.numQubits);
  const lastMeasureForClbit = new Map<number, number>();
  for (const instr of circuit.instructions) {
    if (instr.kind === 'gate') applyGateInstr(state, instr);
    else if (instr.kind === 'measure') lastMeasureForClbit.set(instr.clbits[0]!, instr.qubits[0]!);
  }
  const probs = probabilities(state);
  const out: Record<string, number> = {};
  // Floating-point rounding can push a certain outcome to 1 + O(eps);
  // clamp so downstream schema bounds ([0, 1]) hold exactly.
  const clamp = (p: number): number => Math.min(1, p);
  if (lastMeasureForClbit.size === 0) {
    for (let i = 0; i < probs.length; i++) {
      const p = clamp(probs[i]!);
      if (p > 1e-12) out[indexToBitstring(i, circuit.numQubits)] = p;
    }
    return out;
  }
  for (let i = 0; i < probs.length; i++) {
    const p = clamp(probs[i]!);
    if (p <= 1e-12) continue;
    const clbits = new Uint8Array(circuit.numClbits);
    for (const [clbit, qubit] of lastMeasureForClbit) {
      clbits[clbit] = ((i >> qubit) & 1) as 0 | 1;
    }
    const key = clbitsToKey(clbits);
    out[key] = clamp((out[key] ?? 0) + p);
  }
  return out;
}

function sampleFromDistribution(
  dist: Readonly<Record<string, number>>,
  shots: number,
  rng: Rng,
): Record<string, number> {
  const keys = Object.keys(dist).sort();
  const cumulative: number[] = [];
  let acc = 0;
  for (const k of keys) {
    acc += dist[k]!;
    cumulative.push(acc);
  }
  const counts: Record<string, number> = {};
  for (let s = 0; s < shots; s++) {
    const r = rng.next() * acc;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! <= r) lo = mid + 1;
      else hi = mid;
    }
    const key = keys[lo]!;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Simulates a circuit. Deterministic for a given (circuit, shots, seed,
 * noise) tuple. Yields to the event loop between shot batches so progress
 * reporting and cancellation work inside a Web Worker.
 */
export async function simulate(
  circuit: Circuit,
  options: SimulationOptions,
): Promise<SimulationResult> {
  const noise = options.noise ?? ZERO_NOISE;
  validateNoiseModel(noise);
  if (!Number.isInteger(options.shots) || options.shots < 1 || options.shots > MAX_SHOTS) {
    throw new Error(`Shot count must be an integer in 1..${MAX_SHOTS}, got ${options.shots}`);
  }
  if (circuit.numQubits > MAX_EXACT_QUBITS) {
    throw new Error(
      `This simulator supports at most ${MAX_EXACT_QUBITS} qubits (got ${circuit.numQubits}). ` +
        `Larger circuits need the Qiskit bridge or an imported trace.`,
    );
  }
  circuitMetrics(circuit); // validates instruction integrity early
  const dynamic = isDynamicCircuit(circuit);
  const noisy = !isZeroNoise(noise);
  const rootRng = createRng(options.seed);
  const batchSize = options.batchSize ?? 256;

  // The representative trajectory is always computed for trace playback.
  const representative = runTrajectory(circuit, rootRng.fork('shot-0'), noise, true);

  if (!dynamic && !noisy) {
    const exact = computeExactDistribution(circuit);
    const counts = sampleFromDistribution(exact, options.shots, rootRng.fork('sampling'));
    options.onProgress?.(options.shots, options.shots);
    return {
      exactProbabilities: exact,
      counts,
      shots: options.shots,
      representativeEvents: representative.events,
      noiseWasApplied: false,
      dynamic,
      seed: options.seed,
    };
  }

  const counts: Record<string, number> = {};
  if (circuit.numClbits > 0 || dynamic) {
    counts[representative.key] = 1;
    for (let shot = 1; shot < options.shots; shot++) {
      const { key } = runTrajectory(circuit, rootRng.fork(`shot-${shot}`), noise, false);
      counts[key] = (counts[key] ?? 0) + 1;
      if (shot % batchSize === 0) {
        options.onProgress?.(shot + 1, options.shots);
        if (options.shouldCancel?.()) {
          throw new SimulationCancelledError(shot + 1);
        }
        // Macrotask yield so a Web Worker can receive cancel messages.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }
  options.onProgress?.(options.shots, options.shots);
  return {
    exactProbabilities: null,
    counts,
    shots: options.shots,
    representativeEvents: representative.events,
    noiseWasApplied: noisy,
    dynamic,
    seed: options.seed,
  };
}

export class SimulationCancelledError extends Error {
  readonly completedShots: number;

  constructor(completedShots: number) {
    super('Simulation cancelled');
    this.name = 'SimulationCancelledError';
    this.completedShots = completedShots;
  }
}
