import { circuitMetrics, type Circuit } from '@qsimcity/domain';
import {
  TraceBuilder,
  deriveTraceId,
  type Trace,
  type TraceCircuit,
  type NoiseConfig,
} from 'qsimcity-trace';
import { simulate, type EngineEvent, type SimulationResult } from './engine.js';
import { isZeroNoise, ZERO_NOISE, type NoiseModel } from './noise.js';

export const SIMULATOR_VERSION = '1.0.0';

export interface ExperimentOptions {
  readonly shots: number;
  readonly seed: string;
  readonly noise?: NoiseModel | null;
  /** Original program text; hashed into the trace for provenance. */
  readonly programSource: string;
  readonly deviceId?: string | null;
  readonly onProgress?: (fraction: number) => void;
  readonly shouldCancel?: () => boolean;
}

export interface ExperimentResult {
  readonly trace: Trace;
  readonly ideal: SimulationResult;
  readonly noisy: SimulationResult | null;
}

export function circuitToTraceCircuit(circuit: Circuit): TraceCircuit {
  return {
    name: circuit.name,
    numQubits: circuit.numQubits,
    numClbits: circuit.numClbits,
    cregs: circuit.cregs.map((r) => ({ name: r.name, size: r.size })),
    instructions: circuit.instructions.map((i) => ({
      id: i.id,
      kind: i.kind,
      name: i.name,
      qubits: [...i.qubits],
      params: [...i.params],
      clbits: [...i.clbits],
      condition: i.condition ? { creg: i.condition.creg, value: i.condition.value } : null,
    })),
  };
}

function emitEngineEvents(
  builder: TraceBuilder,
  events: readonly EngineEvent[],
  phase: 'ideal' | 'noisy',
): void {
  for (const ev of events) {
    switch (ev.kind) {
      case 'gate':
        if (!ev.skipped) {
          builder.emit({
            eventType: 'gate.executed',
            stage: 'execution',
            source: 'exact_simulation',
            certainty: phase === 'ideal' ? 'EXACT' : 'SAMPLED',
            instructionId: ev.instructionId,
            logicalQubits: ev.qubits,
            payload: { gate: ev.name, params: ev.params, phase },
          });
        }
        break;
      case 'noise':
        builder.emit({
          eventType: 'noise.applied',
          stage: 'noise',
          source: 'sampled_simulation',
          instructionId: ev.instructionId,
          logicalQubits: [ev.noise.qubit],
          payload: { ...ev.noise, phase },
        });
        break;
      case 'measurement':
        builder.emit({
          eventType: 'measurement.sampled',
          stage: 'measurement',
          source: 'sampled_simulation',
          instructionId: ev.instructionId,
          logicalQubits: [ev.qubit],
          payload: {
            clbit: ev.clbit,
            outcome: ev.outcome,
            readoutFlipped: ev.readoutFlipped,
            phase,
            note: 'Representative shot outcome; aggregate counts are in results.',
          },
        });
        break;
      case 'reset':
        builder.emit({
          eventType: 'gate.executed',
          stage: 'execution',
          source: 'sampled_simulation',
          instructionId: ev.instructionId,
          logicalQubits: [ev.qubit],
          payload: { gate: 'reset', collapsedFrom: ev.outcome, phase },
        });
        break;
      case 'condition':
        builder.emit({
          eventType: 'classical.condition_evaluated',
          stage: 'classical',
          source: 'sampled_simulation',
          instructionId: ev.instructionId,
          payload: {
            creg: ev.creg,
            expected: ev.expected,
            actual: ev.actual,
            satisfied: ev.satisfied,
            phase,
          },
        });
        break;
    }
  }
}

/**
 * Runs the full experiment a user configures in the Quantum Lab: an ideal
 * pass, an optional noisy pass, and a trace capturing both for replay.
 */
export async function runExperiment(
  circuit: Circuit,
  options: ExperimentOptions,
): Promise<ExperimentResult> {
  const noise = options.noise ?? null;
  const hasNoise = noise !== null && !isZeroNoise(noise);
  const noiseConfig: NoiseConfig | null = hasNoise
    ? {
        readoutError: noise.readoutError,
        depolarizing1q: noise.depolarizing1q,
        depolarizing2q: noise.depolarizing2q,
        amplitudeDamping: noise.amplitudeDamping,
        phaseDamping: noise.phaseDamping,
      }
    : null;

  const builder = new TraceBuilder({
    traceId: deriveTraceId(options.seed, options.programSource),
    seed: options.seed,
    generator: 'qsimcity-simulator',
    generatorVersion: SIMULATOR_VERSION,
    packageVersions: { '@qsimcity/simulator': SIMULATOR_VERSION },
    programSource: options.programSource,
    deviceId: options.deviceId ?? null,
    shots: options.shots,
    noise: noiseConfig,
  });

  builder.emit({
    eventType: 'program.loaded',
    stage: 'input',
    source: 'exact_simulation',
    certainty: 'EXACT',
    payload: { numQubits: circuit.numQubits, instructions: circuit.instructions.length },
  });
  builder.emit({
    eventType: 'execution.started',
    stage: 'execution',
    source: 'exact_simulation',
    certainty: 'EXACT',
    payload: { shots: options.shots, noisy: hasNoise },
  });

  const ideal = await simulate(circuit, {
    shots: options.shots,
    seed: options.seed,
    noise: ZERO_NOISE,
    ...(options.shouldCancel ? { shouldCancel: options.shouldCancel } : {}),
    onProgress: (done, total) => options.onProgress?.((hasNoise ? 0.5 : 1) * (done / total)),
  });
  emitEngineEvents(builder, ideal.representativeEvents, 'ideal');

  let noisy: SimulationResult | null = null;
  if (hasNoise) {
    noisy = await simulate(circuit, {
      shots: options.shots,
      seed: options.seed,
      noise,
      ...(options.shouldCancel ? { shouldCancel: options.shouldCancel } : {}),
      onProgress: (done, total) => options.onProgress?.(0.5 + 0.5 * (done / total)),
    });
    emitEngineEvents(builder, noisy.representativeEvents, 'noisy');
  }

  builder.emit({
    eventType: 'execution.completed',
    stage: 'result',
    source: hasNoise ? 'sampled_simulation' : 'exact_simulation',
    payload: {
      idealDistinctOutcomes: Object.keys(ideal.counts).length,
      noisyDistinctOutcomes: noisy ? Object.keys(noisy.counts).length : null,
    },
  });

  const metrics = circuitMetrics(circuit);
  const trace = builder.build({
    inputCircuit: circuitToTraceCircuit(circuit),
    metrics: [
      {
        stage: 'input',
        gateCount: metrics.gateCount,
        twoQubitGateCount: metrics.twoQubitGateCount,
        swapCount: metrics.swapCount,
        depth: metrics.depth,
      },
    ],
    results: {
      ...(ideal.exactProbabilities ? { idealProbabilities: ideal.exactProbabilities } : {}),
      // Shots recorded as the sum of counts: a circuit with no classical
      // bits legitimately yields zero recorded outcomes.
      idealCounts: {
        counts: ideal.counts,
        shots: Object.values(ideal.counts).reduce((a, b) => a + b, 0),
        source: 'sampled_simulation',
        certainty: 'SAMPLED',
      },
      ...(noisy
        ? {
            noisyCounts: {
              counts: noisy.counts,
              shots: Object.values(noisy.counts).reduce((a, b) => a + b, 0),
              source: 'sampled_simulation',
              certainty: 'SAMPLED',
            },
          }
        : {}),
    },
  });

  return { trace, ideal, noisy };
}
