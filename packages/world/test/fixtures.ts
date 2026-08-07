import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDevice, getSampleCircuit, parseQasm } from '@qsimcity/domain';
import { compile, type CompileResult } from '@qsimcity/reference-compiler';
import {
  ZERO_NOISE,
  circuitToTraceCircuit,
  emitExecutionEvents,
  simulate,
} from '@qsimcity/simulator';
import { TraceBuilder, deriveTraceId, parseTraceJson, type Trace } from 'qsimcity-trace';

/**
 * Test fixtures shared by the semantic world layer tests: realistic traces
 * built through the real reference compiler and simulator (mirroring the
 * production pipeline, without depending on the ui package), plus committed
 * Qiskit bridge sample traces loaded from examples/traces.
 */

const ROOT = new URL('../../..', import.meta.url).pathname;

/** Load and validate a committed sample trace, e.g. `swap-storm`. */
export function loadSampleTrace(id: string): Trace {
  const file = join(ROOT, 'examples', 'traces', `${id}.qsimcity.json`);
  return parseTraceJson(readFileSync(file, 'utf8'));
}

export interface PipelineFixture {
  readonly trace: Trace;
  readonly result: CompileResult;
}

/**
 * Parse a bundled sample circuit, compile it for a device with trace events,
 * execute the compiled circuit, and build the trace — the same event stream
 * the production pipeline emits (parse, compile passes, physical execution).
 */
export async function compiledPipelineTrace(options: {
  readonly sampleId: string;
  readonly deviceId?: string;
  readonly layoutMethod?: 'trivial' | 'interaction' | readonly number[];
  readonly shots?: number;
  readonly seed?: string;
}): Promise<PipelineFixture> {
  const qasm = getSampleCircuit(options.sampleId).qasm;
  const circuit = parseQasm(qasm);
  const device = getDevice(options.deviceId ?? 'linear-5');
  const shots = options.shots ?? 64;
  const seed = options.seed ?? `world-fixture-${options.sampleId}`;
  const builder = new TraceBuilder({
    traceId: deriveTraceId(seed, qasm),
    seed,
    generator: 'world-test-pipeline',
    generatorVersion: '1.0.0',
    packageVersions: {},
    programSource: qasm,
    deviceId: device.id,
    shots,
    noise: null,
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
  const result = compile(circuit, {
    device,
    layoutMethod: options.layoutMethod ?? 'interaction',
    traceBuilder: builder,
  });
  builder.emit({
    eventType: 'execution.started',
    stage: 'execution',
    source: 'exact_simulation',
    certainty: 'EXACT',
    payload: { shots, executedCircuit: 'compiled-physical', deviceId: device.id },
  });
  const sim = await simulate(result.compiled, { shots, seed, noise: ZERO_NOISE });
  emitExecutionEvents(builder, sim.representativeEvents, {
    phase: 'physical-ideal',
    space: 'physical',
    noisy: false,
  });
  builder.emit({
    eventType: 'execution.completed',
    stage: 'result',
    source: 'exact_simulation',
    payload: { idealDistinctOutcomes: Object.keys(sim.counts).length },
  });
  const trace = builder.build({
    inputCircuit: circuitToTraceCircuit(circuit),
    compiledCircuit: circuitToTraceCircuit(result.compiled),
    initialLayout: result.initialLayout,
    finalLayout: result.finalLayout,
    results: {
      idealCounts: {
        counts: sim.counts,
        shots: Object.values(sim.counts).reduce((a, b) => a + b, 0),
        source: 'sampled_simulation',
        certainty: 'SAMPLED',
      },
    },
  });
  return { trace, result };
}
