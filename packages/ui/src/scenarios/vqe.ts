import { makeCircuit, makeInstruction, type Circuit } from '@qsimcity/domain';
import { simulate, circuitToTraceCircuit, SIMULATOR_VERSION } from '@qsimcity/simulator';
import { TraceBuilder, deriveTraceId, type Trace } from 'qsimcity-trace';

/**
 * Variational Gridlock (spec §9): a small but genuine VQE loop.
 *
 * Hamiltonian: H = Z0 Z1 + 0.5 X0 (a minimal transverse-field pair).
 * Exact ground energy: eigenvalues of H are ±sqrt(1 + 0.25), so
 * E_min = -sqrt(1.25) ≈ -1.1180.
 * Ansatz: ry(t0) q0; ry(t1) q1; cx q0,q1  (2 parameters).
 * Optimizer: deterministic shrinking-grid coordinate search — chosen for
 * reproducibility and explainability, not performance.
 * Energy evaluation: sampled expectation values from the seeded simulator
 * (two measurement bases per evaluation), so the classical optimizer
 * genuinely consumes quantum-execution results each iteration.
 *
 * This scenario is educational: it demonstrates the hybrid loop and how
 * shot noise stalls optimization. It makes no quantum-chemistry accuracy
 * claim (spec §9).
 */

export const VQE_EXACT_GROUND_ENERGY = -Math.sqrt(1.25);
export const VQE_ITERATIONS = 10;

export interface VqeResult {
  readonly trace: Trace;
  readonly finalEnergy: number;
  readonly finalParams: readonly [number, number];
  readonly iterations: readonly { params: [number, number]; energy: number }[];
}

function ansatz(t0: number, t1: number, measureBasis: 'zz' | 'x0'): Circuit {
  const instructions = [
    makeInstruction({ name: 'ry', qubits: [0], params: [t0] }),
    makeInstruction({ name: 'ry', qubits: [1], params: [t1] }),
    makeInstruction({ name: 'cx', qubits: [0, 1] }),
  ];
  if (measureBasis === 'x0') {
    // Rotate X on q0 into the computational basis.
    instructions.push(makeInstruction({ name: 'h', qubits: [0] }));
  }
  instructions.push(
    makeInstruction({ kind: 'measure', name: 'measure', qubits: [0], clbits: [0] }),
    makeInstruction({ kind: 'measure', name: 'measure', qubits: [1], clbits: [1] }),
  );
  return makeCircuit({
    name: `vqe-ansatz-${measureBasis}`,
    numQubits: 2,
    cregs: [{ name: 'c', size: 2 }],
    instructions,
  });
}

function expectationFromCounts(
  counts: Readonly<Record<string, number>>,
  observable: 'zz' | 'z0',
): number {
  let total = 0;
  let sum = 0;
  for (const [key, count] of Object.entries(counts)) {
    // key: clbit 1 leftmost, clbit 0 rightmost.
    const b0 = key[key.length - 1] === '1' ? -1 : 1;
    const b1 = key[key.length - 2] === '1' ? -1 : 1;
    sum += (observable === 'zz' ? b0 * b1 : b0) * count;
    total += count;
  }
  return total === 0 ? 0 : sum / total;
}

async function evaluateEnergy(
  t0: number,
  t1: number,
  shots: number,
  seed: string,
): Promise<number> {
  const zz = await simulate(ansatz(t0, t1, 'zz'), { shots, seed: `${seed}/zz` });
  const x0 = await simulate(ansatz(t0, t1, 'x0'), { shots, seed: `${seed}/x0` });
  // <H> = <Z0 Z1> + 0.5 <X0>; the H rotation maps X0 onto Z0.
  return expectationFromCounts(zz.counts, 'zz') + 0.5 * expectationFromCounts(x0.counts, 'z0');
}

export async function runVqeScenario(options: {
  readonly seed: string;
  readonly shots: number;
}): Promise<VqeResult> {
  const { seed, shots } = options;
  const builder = new TraceBuilder({
    traceId: deriveTraceId(seed, 'vqe-gridlock'),
    seed,
    generator: 'qsimcity-vqe',
    generatorVersion: SIMULATOR_VERSION,
    packageVersions: { '@qsimcity/simulator': SIMULATOR_VERSION },
    programSource: `vqe-gridlock shots=${shots}`,
    deviceId: null,
    shots,
  });
  builder.emit({
    eventType: 'program.loaded',
    stage: 'input',
    source: 'exact_simulation',
    payload: {
      hamiltonian: 'Z0*Z1 + 0.5*X0',
      ansatz: 'ry(t0) q0; ry(t1) q1; cx q0,q1',
      optimizer: 'deterministic shrinking-grid coordinate search',
      exactGroundEnergy: VQE_EXACT_GROUND_ENERGY,
      iterationLimit: VQE_ITERATIONS,
      initialParams: [0, 0],
      stoppingCondition: `fixed ${VQE_ITERATIONS} iterations`,
    },
  });

  let best: { params: [number, number]; energy: number } = {
    params: [0, 0],
    energy: await evaluateEnergy(0, 0, shots, `${seed}/init`),
  };
  const iterations: { params: [number, number]; energy: number }[] = [];
  let step = Math.PI / 2;
  for (let iter = 0; iter < VQE_ITERATIONS; iter++) {
    builder.emit({
      eventType: 'optimizer.iteration_started',
      stage: 'classical',
      source: 'sampled_simulation',
      payload: { iteration: iter + 1, params: [...best.params], step },
    });
    const candidates: [number, number][] = [
      [best.params[0] + step, best.params[1]],
      [best.params[0] - step, best.params[1]],
      [best.params[0], best.params[1] + step],
      [best.params[0], best.params[1] - step],
    ];
    for (let c = 0; c < candidates.length; c++) {
      const [t0, t1] = candidates[c]!;
      const energy = await evaluateEnergy(t0, t1, shots, `${seed}/i${iter}c${c}`);
      if (energy < best.energy) best = { params: [t0, t1], energy };
    }
    step *= 0.7;
    iterations.push({ params: [...best.params], energy: best.energy });
    builder.emit({
      eventType: 'optimizer.iteration_completed',
      stage: 'classical',
      source: 'sampled_simulation',
      payload: {
        iteration: iter + 1,
        energy: best.energy,
        params: [...best.params],
        exactGroundEnergy: VQE_EXACT_GROUND_ENERGY,
      },
    });
  }

  builder.emit({
    eventType: 'execution.completed',
    stage: 'result',
    source: 'sampled_simulation',
    payload: { finalEnergy: best.energy, exactGroundEnergy: VQE_EXACT_GROUND_ENERGY },
  });

  const finalCircuit = ansatz(best.params[0], best.params[1], 'zz');
  const finalRun = await simulate(finalCircuit, { shots, seed: `${seed}/final` });
  const trace = builder.build({
    inputCircuit: circuitToTraceCircuit(finalCircuit),
    results: {
      idealCounts: {
        counts: finalRun.counts,
        shots,
        source: 'sampled_simulation',
        certainty: 'SAMPLED',
      },
    },
  });
  return { trace, finalEnergy: best.energy, finalParams: best.params, iterations };
}
