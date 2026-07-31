import { circuitMetrics, getDevice, parseQasm } from '@qsimcity/domain';
import { compile } from '@qsimcity/reference-compiler';
import {
  circuitToTraceCircuit,
  emitExecutionEvents,
  simulate,
  SIMULATOR_VERSION,
  isZeroNoise,
  ZERO_NOISE,
  type NoiseModel,
} from '@qsimcity/simulator';
import { COMPILER_VERSION } from '@qsimcity/reference-compiler';
import { TraceBuilder, deriveTraceId, type Trace, type NoiseConfig } from 'qsimcity-trace';

/**
 * The full Quantum Lab pipeline: parse -> reference-compile -> execute,
 * emitting one unified trace that the whole product replays. Runs inside the
 * simulator Web Worker in production; it is a plain async function so tests
 * can call it directly.
 *
 * Execution produces three separated results, because conflating them hides
 * the entire point of compiling for a device:
 *
 *   1. **Logical reference** — the original circuit, simulated ideally. The
 *      semantic ground truth for "what should this program produce".
 *   2. **Physical ideal** — the compiled circuit at zero noise. It must agree
 *      with the logical reference; disagreement means compilation changed the
 *      program's meaning.
 *   3. **Physical noisy** — the compiled circuit with the device's noise
 *      applied to the native operations that actually run, so inserted SWAPs,
 *      added depth, and two-qubit exposure show up in the distribution.
 *
 * This pipeline previously simulated the *logical* circuit for both the ideal
 * and noisy results, which made layout, routing, translation, and
 * optimization invisible to every number and every execution event: a bad
 * layout produced identical output to a good one.
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

  const compiled = compileResult.compiled;

  // The logical qubit each physical qubit holds when execution begins. Used
  // only to annotate provenance: routing SWAPs permute this as the circuit
  // runs, so the physical identity is exact and the logical one is not.
  const logicalOrigin: (number | null)[] = Array.from({ length: compiled.numQubits }, () => null);
  compileResult.initialLayout.forEach((physical, logical) => {
    if (physical >= 0 && physical < logicalOrigin.length) logicalOrigin[physical] = logical;
  });

  builder.emit({
    eventType: 'execution.started',
    stage: 'execution',
    source: 'exact_simulation',
    certainty: 'EXACT',
    payload: {
      shots: config.shots,
      noisy: hasNoise,
      executedCircuit: 'compiled-physical',
      physicalQubits: compiled.numQubits,
      deviceId: config.deviceId,
    },
  });

  const cancel = config.shouldCancel ? { shouldCancel: config.shouldCancel } : {};
  // Three passes share the budget: reference, physical ideal, physical noisy.
  const passes = hasNoise ? 3 : 2;
  const progressFor =
    (index: number) =>
    (done: number, total: number): void =>
      config.onProgress?.((index + done / total) / passes);

  // 1. Logical reference: the program as written, simulated ideally.
  const logicalReference = await simulate(circuit, {
    shots: config.shots,
    seed: config.seed,
    noise: ZERO_NOISE,
    ...cancel,
    onProgress: progressFor(0),
  });

  // 2. Physical ideal: the compiled circuit, no noise. Semantics must survive.
  const physicalIdeal = await simulate(compiled, {
    shots: config.shots,
    seed: config.seed,
    noise: ZERO_NOISE,
    ...cancel,
    onProgress: progressFor(1),
  });

  // 3. Physical noisy: noise applied to the native operations that ran.
  let physicalNoisy: Awaited<ReturnType<typeof simulate>> | null = null;
  if (hasNoise) {
    physicalNoisy = await simulate(compiled, {
      shots: config.shots,
      seed: config.seed,
      noise: config.noise!,
      ...cancel,
      onProgress: progressFor(2),
    });
  }

  // Only physical events reach the trace, so the QPU Grid can never light a
  // pylon for a logical index that no device qubit corresponds to.
  emitExecutionEvents(builder, (physicalNoisy ?? physicalIdeal).representativeEvents, {
    phase: physicalNoisy ? 'physical-noisy' : 'physical-ideal',
    space: 'physical',
    logicalOrigin,
  });

  builder.emit({
    eventType: 'execution.completed',
    stage: 'result',
    source: hasNoise ? 'sampled_simulation' : 'exact_simulation',
    payload: {
      logicalReferenceOutcomes: Object.keys(logicalReference.counts).length,
      physicalIdealOutcomes: Object.keys(physicalIdeal.counts).length,
      physicalNoisyOutcomes: physicalNoisy ? Object.keys(physicalNoisy.counts).length : null,
    },
  });

  const sampled = (counts: Readonly<Record<string, number>>) => ({
    counts,
    shots: Object.values(counts).reduce((a, b) => a + b, 0),
    source: 'sampled_simulation' as const,
    certainty: 'SAMPLED' as const,
  });
  const referenceCounts = sampled(logicalReference.counts);
  const physicalIdealCounts = sampled(physicalIdeal.counts);
  const physicalNoisyCounts = physicalNoisy ? sampled(physicalNoisy.counts) : null;

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
    results: {
      ...(logicalReference.exactProbabilities
        ? { idealProbabilities: logicalReference.exactProbabilities }
        : {}),
      idealCounts: referenceCounts,
      // The noisy distribution users compare against the ideal one is the
      // physical result: it is the circuit that actually ran.
      ...(physicalNoisyCounts ? { noisyCounts: physicalNoisyCounts } : {}),
      execution: {
        logicalReference: referenceCounts,
        physicalIdeal: physicalIdealCounts,
        ...(physicalNoisyCounts ? { physicalNoisy: physicalNoisyCounts } : {}),
      },
    },
  });
  return { trace };
}
