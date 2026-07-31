import { circuitMetrics, getDevice, parseQasm } from '@qsimcity/domain';
import { compile } from '@qsimcity/reference-compiler';
import {
  circuitToTraceCircuit,
  runExperiment,
  SIMULATOR_VERSION,
  isZeroNoise,
  type NoiseModel,
} from '@qsimcity/simulator';
import { COMPILER_VERSION } from '@qsimcity/reference-compiler';
import { TraceBuilder, deriveTraceId, type Trace, type NoiseConfig } from 'qsimcity-trace';

/**
 * The full Quantum Lab pipeline: parse -> reference-compile -> simulate
 * (ideal, and noisy when configured), emitting one unified trace that the
 * whole product replays. Runs inside the simulator Web Worker in
 * production; it is a plain async function so tests can call it directly.
 */

export interface PipelineConfig {
  readonly qasm: string;
  readonly shots: number;
  readonly seed: string;
  readonly deviceId: string;
  readonly noise: NoiseModel | null;
  readonly layoutMethod: 'trivial' | 'interaction' | readonly number[];
  readonly optimize: boolean;
  readonly onProgress?: (fraction: number) => void;
  readonly shouldCancel?: () => boolean;
}

export interface PipelineOutput {
  readonly trace: Trace;
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineOutput> {
  const circuit = parseQasm(config.qasm);
  const device = getDevice(config.deviceId);
  const hasNoise = config.noise !== null && !isZeroNoise(config.noise);
  const noiseConfig: NoiseConfig | null = hasNoise
    ? {
        readoutError: config.noise!.readoutError,
        depolarizing1q: config.noise!.depolarizing1q,
        depolarizing2q: config.noise!.depolarizing2q,
        amplitudeDamping: config.noise!.amplitudeDamping,
        phaseDamping: config.noise!.phaseDamping,
      }
    : null;

  const builder = new TraceBuilder({
    traceId: deriveTraceId(config.seed, config.qasm),
    seed: config.seed,
    generator: 'qsimcity-web',
    generatorVersion: SIMULATOR_VERSION,
    packageVersions: {
      '@qsimcity/simulator': SIMULATOR_VERSION,
      '@qsimcity/reference-compiler': COMPILER_VERSION,
    },
    programSource: config.qasm,
    deviceId: config.deviceId,
    shots: config.shots,
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
    eventType: 'program.parsed',
    stage: 'parse',
    source: 'exact_simulation',
    certainty: 'EXACT',
    payload: { cregs: circuit.cregs.map((r) => r.name) },
  });

  // Reference compilation with trace events.
  const compileResult = compile(circuit, {
    device,
    layoutMethod: config.layoutMethod,
    optimize: config.optimize,
    traceBuilder: builder,
  });

  // Simulation of the logical circuit (the scientific ground truth).
  const { trace: execTrace } = await runExperiment(circuit, {
    shots: config.shots,
    seed: config.seed,
    noise: config.noise,
    programSource: config.qasm,
    ...(config.onProgress ? { onProgress: config.onProgress } : {}),
    ...(config.shouldCancel ? { shouldCancel: config.shouldCancel } : {}),
  });

  // Merge execution events into the unified builder (compiler events came
  // first; execution follows in tick order).
  for (const ev of execTrace.events) {
    if (ev.eventType === 'program.loaded') continue; // already emitted
    builder.emit({
      eventType: ev.eventType,
      stage: ev.stage,
      source: ev.source,
      certainty: ev.certainty,
      logicalQubits: ev.logicalQubits,
      physicalQubits: ev.physicalQubits,
      instructionId: ev.instructionId,
      payload: ev.payload,
      ...(ev.sourceDurationNs !== undefined ? { sourceDurationNs: ev.sourceDurationNs } : {}),
    });
  }

  const inputMetrics = circuitMetrics(circuit);
  const trace = builder.build({
    inputCircuit: circuitToTraceCircuit(circuit),
    compiledCircuit: circuitToTraceCircuit(compileResult.compiled),
    initialLayout: compileResult.initialLayout,
    finalLayout: compileResult.finalLayout,
    metrics: [
      {
        stage: 'input',
        gateCount: inputMetrics.gateCount,
        twoQubitGateCount: inputMetrics.twoQubitGateCount,
        swapCount: inputMetrics.swapCount,
        depth: inputMetrics.depth,
      },
      {
        stage: 'compiled',
        gateCount: compileResult.compiledMetrics.gateCount,
        twoQubitGateCount: compileResult.compiledMetrics.twoQubitGateCount,
        swapCount: compileResult.swapCount,
        depth: compileResult.compiledMetrics.depth,
      },
    ],
    results: execTrace.results,
  });
  return { trace };
}
