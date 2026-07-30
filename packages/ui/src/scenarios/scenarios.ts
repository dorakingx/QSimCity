import { getSampleCircuit } from '@qsimcity/domain';
import type { Trace } from 'qsimcity-trace';
import { DEFAULT_CONFIG, DEFAULT_NOISE, type RunConfig } from '../store/appStore.js';

/**
 * The 12 scenarios (spec §9). Each is declarative: a deterministic
 * configuration plus an objective, machine-checkable completion condition
 * evaluated against the produced trace. `kind: 'vqe'` scenarios run the
 * variational loop instead of the standard pipeline.
 */

export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly seed: string;
  readonly kind: 'pipeline' | 'vqe';
  /** Configuration applied on start (over the defaults). */
  readonly config: Partial<RunConfig>;
  readonly causalChain: readonly string[];
  readonly healthyState: string;
  readonly failureState: string;
  readonly comparisonMetric: string;
  readonly completionText: string;
  /** Objective completion condition on the resulting trace. */
  readonly isComplete: (trace: Trace) => boolean;
}

function fractionOf(counts: Readonly<Record<string, number>> | undefined, predicate: (key: string) => boolean): number {
  if (!counts) return 0;
  let total = 0;
  let matching = 0;
  for (const [key, count] of Object.entries(counts)) {
    total += count;
    if (predicate(key)) matching += count;
  }
  return total === 0 ? 0 : matching / total;
}

const noNoise = {
  noiseEnabled: false,
} satisfies Partial<RunConfig>;

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'bell-state',
    title: 'Bell State',
    purpose: 'See maximal two-qubit entanglement produce perfectly correlated measurements.',
    seed: 'scenario-bell',
    kind: 'pipeline',
    config: { sampleId: 'bell', shots: 1024, seed: 'scenario-bell', deviceId: 'linear-5', ...noNoise },
    causalChain: [
      'H creates superposition on q0',
      'CX entangles q0 with q1',
      'measurement collapses both qubits together',
      'only 00 and 11 appear, each near 50%',
    ],
    healthyState: 'Counts contain only 00 and 11, each between 45% and 55%.',
    failureState: 'Any 01/10 outcomes (impossible without noise) or a strong 00/11 imbalance.',
    comparisonMetric: 'Fraction of correlated outcomes (00 + 11)',
    completionText: 'Run completes with only correlated outcomes.',
    isComplete: (trace) =>
      fractionOf(trace.results.idealCounts?.counts, (k) => k === '00' || k === '11') === 1,
  },
  {
    id: 'ghz-state',
    title: 'GHZ State',
    purpose: 'Extend entanglement to four qubits: all-or-nothing correlations.',
    seed: 'scenario-ghz',
    kind: 'pipeline',
    config: { sampleId: 'ghz-4', shots: 1024, seed: 'scenario-ghz', deviceId: 'linear-5', ...noNoise },
    causalChain: [
      'H on q0, then a CX chain spreads the superposition',
      'four qubits share one entangled state',
      'every shot reads all zeros or all ones',
    ],
    healthyState: 'Only 0000 and 1111 appear.',
    failureState: 'Mixed bitstrings, which noise or a broken chain would produce.',
    comparisonMetric: 'Fraction of all-equal outcomes',
    completionText: 'Run completes with only 0000/1111 outcomes.',
    isComplete: (trace) =>
      fractionOf(trace.results.idealCounts?.counts, (k) => k === '0000' || k === '1111') === 1,
  },
  {
    id: 'teleportation',
    title: 'Quantum Teleportation',
    purpose: 'Move a quantum state using entanglement plus two classical bits.',
    seed: 'scenario-teleport',
    kind: 'pipeline',
    config: { sampleId: 'teleportation', shots: 2048, seed: 'scenario-teleport', deviceId: 'linear-5', ...noNoise },
    causalChain: [
      'a payload state is prepared on q0',
      'q1 and q2 are entangled',
      'a Bell measurement digitizes the payload relation into two classical bits',
      'feed-forward corrections on q2 rebuild the payload exactly',
    ],
    healthyState: 'The output bit is 1 about 20% of the time — the payload distribution, teleported.',
    failureState: 'Skipping the classical corrections leaves the output scrambled.',
    comparisonMetric: 'Output-bit distribution vs the prepared payload distribution',
    completionText: 'Output-bit statistics match the payload (0.20 ± 0.04).',
    isComplete: (trace) => {
      const f = fractionOf(trace.results.idealCounts?.counts, (k) => k.startsWith('1'));
      return f > 0.16 && f < 0.24;
    },
  },
  {
    id: 'grover-search',
    title: 'Grover Search',
    purpose: 'Amplitude amplification finds a marked item with certainty in one iteration (n=2).',
    seed: 'scenario-grover',
    kind: 'pipeline',
    config: { sampleId: 'grover-2', shots: 1024, seed: 'scenario-grover', deviceId: 'full-5', ...noNoise },
    causalChain: [
      'uniform superposition over 4 states',
      'the oracle flips the phase of |11>',
      'the diffusion operator reflects about the mean',
      'all amplitude lands on |11>',
    ],
    healthyState: 'Every shot returns 11.',
    failureState: 'With noise, other outcomes leak in and certainty is lost.',
    comparisonMetric: 'Success probability of the marked state',
    completionText: 'All shots find the marked state.',
    isComplete: (trace) => fractionOf(trace.results.idealCounts?.counts, (k) => k === '11') === 1,
  },
  {
    id: 'qft',
    title: 'Quantum Fourier Transform',
    purpose: 'Watch controlled phases and a swap build the frequency-domain picture of a basis state.',
    seed: 'scenario-qft',
    kind: 'pipeline',
    config: { sampleId: 'qft-3', shots: 2048, seed: 'scenario-qft', deviceId: 'linear-5', ...noNoise },
    causalChain: [
      'the input |001> enters the QFT',
      'Hadamards and controlled phases interfere',
      'the amplitude spreads uniformly with position-dependent phases',
      'measurement shows a near-uniform distribution',
    ],
    healthyState: 'All 8 outcomes near 12.5% each.',
    failureState: 'Phase errors would bias particular outcomes.',
    comparisonMetric: 'Deviation from the uniform distribution',
    completionText: 'No outcome exceeds 20% (uniformity within sampling noise).',
    isComplete: (trace) => {
      const counts = trace.results.idealCounts?.counts ?? {};
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return total > 0 && Object.values(counts).every((c) => c / total < 0.2);
    },
  },
  {
    id: 'swap-storm',
    title: 'SWAP Storm',
    purpose: 'Long-range gates on a linear device force the router to spend SWAPs.',
    seed: 'scenario-swapstorm',
    kind: 'pipeline',
    config: {
      sampleId: 'swap-storm',
      shots: 512,
      seed: 'scenario-swapstorm',
      deviceId: 'linear-5',
      layoutMethod: 'trivial',
      ...noNoise,
    },
    causalChain: [
      'the program requests CX between distant qubits',
      'routing finds shortest paths on the line',
      'SWAPs shuttle logical qubits into adjacency',
      'depth and two-qubit count balloon',
    ],
    healthyState: 'Several SWAPs inserted; compiled depth far above input depth.',
    failureState: 'On the all-to-all device the storm disappears — compare!',
    comparisonMetric: 'SWAP count and depth, linear-5 vs full-5',
    completionText: 'At least 3 SWAPs were inserted during routing.',
    isComplete: (trace) =>
      (trace.metrics.find((m) => m.stage === 'compiled')?.swapCount ?? 0) >= 3,
  },
  {
    id: 'bad-initial-layout',
    title: 'Bad Initial Layout',
    purpose: 'The same circuit pays more SWAPs when logical qubits start in poor seats.',
    seed: 'scenario-badlayout',
    kind: 'pipeline',
    config: {
      sampleId: 'ghz-4',
      shots: 512,
      seed: 'scenario-badlayout',
      deviceId: 'tee-7',
      layoutMethod: 'trivial',
      ...noNoise,
    },
    causalChain: [
      'trivial layout ignores the interaction pattern',
      'neighboring logical qubits land far apart',
      'routing inserts avoidable SWAPs',
      'depth grows and (with noise) fidelity proxies fall',
    ],
    healthyState: 'Switching the Layout Desk to automatic reduces SWAPs.',
    failureState: 'Trivial layout on this topology needs more routing.',
    comparisonMetric: 'SWAP count: trivial vs interaction layout',
    completionText: 'Run completes; compare the SWAP count after switching layout methods.',
    isComplete: (trace) => trace.compiledCircuit !== null && trace.initialLayout !== null,
  },
  {
    id: 'decoherence-weather',
    title: 'Decoherence Weather',
    purpose: 'Amplitude and phase damping smear a clean Bell distribution.',
    seed: 'scenario-decoherence',
    kind: 'pipeline',
    config: {
      sampleId: 'bell',
      shots: 2048,
      seed: 'scenario-decoherence',
      deviceId: 'linear-5',
      noiseEnabled: true,
      noise: { ...DEFAULT_NOISE, amplitudeDamping: 0.15, phaseDamping: 0.15, readoutError: 0 },
    },
    causalChain: [
      'damping fronts roll over the grid',
      'each gate exposes qubits to decay and dephasing',
      'forbidden outcomes 01/10 appear',
      'the noisy histogram diverges from the ideal one',
    ],
    healthyState: 'Ideal counts stay correlated; noisy counts leak into 01/10.',
    failureState: 'Heavier weather leaks more; zero noise matches ideal exactly.',
    comparisonMetric: 'Forbidden-outcome fraction, ideal vs noisy',
    completionText: 'Noisy run shows over 3% forbidden outcomes; ideal shows none.',
    isComplete: (trace) =>
      fractionOf(trace.results.idealCounts?.counts, (k) => k === '01' || k === '10') === 0 &&
      fractionOf(trace.results.noisyCounts?.counts, (k) => k === '01' || k === '10') > 0.03,
  },
  {
    id: 'readout-bias',
    title: 'Readout Bias',
    purpose: 'Perfect quantum evolution can still report wrong answers at the dock.',
    seed: 'scenario-readout',
    kind: 'pipeline',
    config: {
      sampleId: 'grover-2',
      shots: 2048,
      seed: 'scenario-readout',
      deviceId: 'full-5',
      noiseEnabled: true,
      noise: { ...DEFAULT_NOISE, readoutError: 0.12, depolarizing1q: 0, depolarizing2q: 0, amplitudeDamping: 0, phaseDamping: 0 },
    },
    causalChain: [
      'the algorithm reaches |11> with certainty',
      'each recorded bit flips with 12% probability at readout',
      'reported counts scatter across all outcomes',
      'the algorithm looks worse than it is',
    ],
    healthyState: 'Ideal counts: 100% |11>. Noisy counts: roughly 77% |11>, the rest single/double flips.',
    failureState: 'Trusting raw counts without readout modeling misjudges the machine.',
    comparisonMetric: 'Reported success rate vs true success rate',
    completionText: 'Noisy success drops below 90% while ideal stays at 100%.',
    isComplete: (trace) =>
      fractionOf(trace.results.idealCounts?.counts, (k) => k === '11') === 1 &&
      fractionOf(trace.results.noisyCounts?.counts, (k) => k === '11') < 0.9,
  },
  {
    id: 'shot-drought',
    title: 'Shot Drought',
    purpose: 'With too few samples, even a perfect computer gives shaky statistics.',
    seed: 'scenario-drought',
    kind: 'pipeline',
    config: { sampleId: 'bell', shots: 16, seed: 'scenario-drought', deviceId: 'linear-5', ...noNoise },
    causalChain: [
      'the exact distribution is a clean 50/50',
      'only 16 containers arrive at the harbor',
      'observed fractions wobble by ±1/sqrt(16) = ±25%',
      'conclusions drawn from few shots are unreliable',
    ],
    healthyState: 'Exact probabilities are 50/50; observed fractions visibly deviate.',
    failureState: 'Raising shots to 4096 shrinks the wobble to about ±1.6%.',
    comparisonMetric: 'Observed fraction vs exact probability as shots grow',
    completionText: 'Run completes with 16 shots; compare against the exact probabilities panel.',
    isComplete: (trace) => (trace.results.idealCounts?.shots ?? 0) <= 32,
  },
  {
    id: 'dynamic-feedforward',
    title: 'Dynamic Feed-forward',
    purpose: 'A mid-circuit measurement steers a later gate through the classical loop.',
    seed: 'scenario-feedforward',
    kind: 'pipeline',
    config: { sampleId: 'dynamic-feedforward', shots: 1024, seed: 'scenario-feedforward', deviceId: 'linear-5', ...noNoise },
    causalChain: [
      'q0 is measured mid-circuit',
      'the result races along the control conduits',
      'X fires on q1 only when the bit was 1',
      'the two classical bits always agree',
    ],
    healthyState: 'Only 00 and 11 in the counts: the copy succeeded every shot.',
    failureState: 'Removing the condition would decorrelate the bits.',
    comparisonMetric: 'Agreement rate between the two classical bits',
    completionText: 'Both bits agree on every shot.',
    isComplete: (trace) =>
      fractionOf(trace.results.idealCounts?.counts, (k) => k === '00' || k === '11') === 1,
  },
  {
    id: 'variational-gridlock',
    title: 'Variational Gridlock',
    purpose: 'A genuine quantum-classical optimization loop, iteration by iteration.',
    seed: 'scenario-vqe',
    kind: 'vqe',
    config: { shots: 512, seed: 'scenario-vqe' },
    causalChain: [
      'the classical optimizer proposes ansatz parameters',
      'the quantum evaluator estimates the energy from sampled shots',
      'the optimizer compares candidates and moves downhill',
      'shot noise makes the landscape foggy — the gridlock',
    ],
    healthyState: 'Energy descends toward the exact ground energy (-1.118) across iterations.',
    failureState: 'With few shots the optimizer wanders; the fog is the lesson.',
    comparisonMetric: 'Estimated energy vs the exact ground energy per iteration',
    completionText: 'Final energy lands within 0.15 of the exact ground energy.',
    isComplete: (trace) => {
      const completions = trace.events.filter((e) => e.eventType === 'optimizer.iteration_completed');
      if (completions.length === 0) return false;
      const last = completions[completions.length - 1]!.payload as { energy?: number };
      return typeof last.energy === 'number' && Math.abs(last.energy - -Math.sqrt(1.25)) < 0.15;
    },
  },
];

export function getScenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario: ${id}`);
  return s;
}

/**
 * Full run configuration for a scenario: defaults, scenario overrides, and
 * the sample program text resolved from the scenario's sampleId.
 */
export function scenarioRunConfig(scenario: Scenario): RunConfig {
  const config: RunConfig = { ...DEFAULT_CONFIG, ...scenario.config };
  if (scenario.config.sampleId) {
    config.qasm = getSampleCircuit(scenario.config.sampleId).qasm;
  }
  return config;
}
