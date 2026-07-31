import { describe, expect, it } from 'vitest';
import { getDevice, getSampleCircuit, hasEdge, parseQasm } from '@qsimcity/domain';
import { compile } from '@qsimcity/reference-compiler';
import { runPipeline, type PipelineConfig } from '../src/pipeline/runPipeline.js';
import { getScenario } from '../src/scenarios/scenarios.js';

/**
 * The production pipeline used to compile the circuit and then simulate the
 * *logical* one, so device topology, initial layout, routing, inserted SWAPs,
 * basis translation, and optimization changed nothing about the result and
 * nothing about the execution events. A bad layout produced output identical
 * to a good one, and the QPU Grid lit pylons for logical indices.
 *
 * These tests hold the repaired architecture in place: three separated result
 * classes, and execution events that describe the circuit that actually ran.
 */

const BELL = getSampleCircuit('bell').qasm;
const GHZ = getSampleCircuit('ghz-4').qasm;

const BASE: Omit<PipelineConfig, 'qasm'> = {
  shots: 400,
  seed: 'physical-execution',
  deviceId: 'linear-5',
  noise: null,
  layoutMethod: 'interaction',
  optimize: true,
};

/** Noise strong enough to separate distributions, weak enough to stay legible. */
const NOISE = {
  readoutError: 0,
  depolarizing1q: 0,
  depolarizing2q: 0.08,
  amplitudeDamping: 0,
  phaseDamping: 0,
};

function totalVariation(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): number {
  const sum = (c: Readonly<Record<string, number>>): number =>
    Object.values(c).reduce((x, y) => x + y, 0);
  const [sa, sb] = [sum(a), sum(b)];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let distance = 0;
  for (const key of keys) {
    distance += Math.abs((a[key] ?? 0) / (sa || 1) - (b[key] ?? 0) / (sb || 1));
  }
  return distance / 2;
}

/** Weight of outcomes the ideal distribution never produces. */
function leakage(
  observed: Readonly<Record<string, number>>,
  ideal: Readonly<Record<string, number>>,
): number {
  const total = Object.values(observed).reduce((a, b) => a + b, 0) || 1;
  let off = 0;
  for (const [outcome, count] of Object.entries(observed)) {
    if ((ideal[outcome] ?? 0) === 0) off += count;
  }
  return off / total;
}

describe('compiled physical execution', () => {
  it('separates the three result classes', async () => {
    const { trace } = await runPipeline({ ...BASE, qasm: BELL, noise: NOISE });
    const execution = trace.results.execution;
    expect(execution).toBeDefined();
    expect(execution!.logicalReference.counts).toBeDefined();
    expect(execution!.physicalIdeal).toBeDefined();
    expect(execution!.physicalNoisy).toBeDefined();
    // The noisy distribution the product compares against the ideal one is the
    // physical result: the circuit that actually ran, SWAPs included.
    expect(trace.results.noisyCounts!.counts).toEqual(execution!.physicalNoisy!.counts);
    expect(trace.results.idealCounts!.counts).toEqual(execution!.logicalReference.counts);
  });

  it('physical ideal reproduces the logical reference at zero noise', async () => {
    // Compilation may permute qubits and rewrite gates, but it must not change
    // what the program means. Classical-bit mapping has to survive too, or the
    // bitstrings would disagree even when the state does not.
    for (const qasm of [BELL, GHZ]) {
      for (const layoutMethod of ['trivial', 'interaction'] as const) {
        const { trace } = await runPipeline({ ...BASE, qasm, layoutMethod });
        const { logicalReference, physicalIdeal } = trace.results.execution!;
        expect(totalVariation(physicalIdeal!.counts, logicalReference.counts)).toBeLessThan(0.06);
      }
    }
  });

  it('every physical execution event carries physical qubits, never logical ones', async () => {
    const { trace } = await runPipeline({ ...BASE, qasm: GHZ, layoutMethod: [4, 3, 2, 1] });
    const executionEvents = trace.events.filter(
      (e) =>
        e.stage === 'execution' &&
        (e.eventType === 'gate.executed' || e.eventType === 'noise.applied'),
    );
    expect(executionEvents.length).toBeGreaterThan(0);
    for (const event of executionEvents) {
      expect(event.physicalQubits.length).toBeGreaterThan(0);
      expect(event.logicalQubits).toEqual([]);
    }
  });

  it('a non-trivial layout puts execution on the mapped physical qubits', async () => {
    // Logical 0 and 1 are pinned to physical 3 and 4, so nothing may execute
    // on physical 0 or 1 — which is exactly what the old pipeline reported.
    const { trace } = await runPipeline({ ...BASE, qasm: BELL, layoutMethod: [3, 4] });
    const touched = new Set<number>();
    for (const event of trace.events) {
      if (event.stage === 'execution' || event.stage === 'measurement') {
        for (const q of event.physicalQubits) touched.add(q);
      }
    }
    expect(touched.size).toBeGreaterThan(0);
    expect([...touched].every((q) => q >= 3)).toBe(true);
  });

  it('two-qubit execution only ever uses real device edges', async () => {
    const device = getDevice('grid-3x3');
    const { trace } = await runPipeline({ ...BASE, qasm: GHZ, deviceId: 'grid-3x3' });
    const pairs = trace.events.filter(
      (e) => e.eventType === 'gate.executed' && e.physicalQubits.length === 2,
    );
    expect(pairs.length).toBeGreaterThan(0);
    for (const event of pairs) {
      expect(hasEdge(device, event.physicalQubits[0]!, event.physicalQubits[1]!)).toBe(true);
    }
  });

  it('a bad layout inserts more SWAPs and exposes the result to more noise', async () => {
    // Pinning interacting qubits to opposite ends of a line forces routing to
    // walk them together, and every inserted SWAP is three more two-qubit
    // gates the noise model gets to act on.
    const good = await runPipeline({
      ...BASE,
      qasm: GHZ,
      layoutMethod: [0, 1, 2, 3],
      noise: NOISE,
    });
    const bad = await runPipeline({ ...BASE, qasm: GHZ, layoutMethod: [4, 0, 3, 1], noise: NOISE });

    const swapsOf = (t: typeof good.trace): number =>
      t.metrics.find((m) => m.stage === 'compiled')!.swapCount;
    expect(swapsOf(bad.trace)).toBeGreaterThan(swapsOf(good.trace));

    const goodExec = good.trace.results.execution!;
    const badExec = bad.trace.results.execution!;
    expect(
      leakage(badExec.physicalNoisy!.counts, goodExec.logicalReference.counts),
    ).toBeGreaterThan(leakage(goodExec.physicalNoisy!.counts, goodExec.logicalReference.counts));
  });

  it('routing-heavy execution degrades further from ideal than routing-light execution', async () => {
    const light = await runPipeline({
      ...BASE,
      qasm: GHZ,
      layoutMethod: [0, 1, 2, 3],
      noise: NOISE,
    });
    const heavy = await runPipeline({
      ...BASE,
      qasm: GHZ,
      layoutMethod: [4, 0, 3, 1],
      noise: NOISE,
    });
    const distanceFromIdeal = (run: typeof light): number =>
      totalVariation(
        run.trace.results.execution!.physicalNoisy!.counts,
        run.trace.results.execution!.logicalReference.counts,
      );
    expect(distanceFromIdeal(heavy)).toBeGreaterThan(distanceFromIdeal(light));
  });

  it('device topology changes the compiled physical execution', async () => {
    // GHZ-4 is a chain, which sits on a line without routing — so the layout
    // is pinned to one that scatters the chain across the device. Holding that
    // layout fixed isolates topology as the only difference: the line has to
    // route, all-to-all connectivity does not.
    const line = await runPipeline({
      ...BASE,
      qasm: GHZ,
      deviceId: 'linear-5',
      layoutMethod: [0, 2, 4, 1],
      noise: NOISE,
    });
    const full = await runPipeline({
      ...BASE,
      qasm: GHZ,
      deviceId: 'full-5',
      layoutMethod: [0, 2, 4, 1],
      noise: NOISE,
    });
    const swapsOf = (t: typeof line.trace): number =>
      t.metrics.find((m) => m.stage === 'compiled')!.swapCount;
    expect(swapsOf(full.trace)).toBe(0);
    expect(swapsOf(line.trace)).toBeGreaterThan(0);
    expect(line.trace.compiledCircuit!.instructions.length).toBeGreaterThan(
      full.trace.compiledCircuit!.instructions.length,
    );
    // The extra native operations are what the noise model then acts on.
    expect(
      totalVariation(
        line.trace.results.execution!.physicalNoisy!.counts,
        line.trace.results.execution!.logicalReference.counts,
      ),
    ).toBeGreaterThan(
      totalVariation(
        full.trace.results.execution!.physicalNoisy!.counts,
        full.trace.results.execution!.logicalReference.counts,
      ),
    );
  });

  it('optimization changes noise exposure without changing zero-noise semantics', async () => {
    const optimized = await runPipeline({ ...BASE, qasm: GHZ, optimize: true, noise: NOISE });
    const raw = await runPipeline({ ...BASE, qasm: GHZ, optimize: false, noise: NOISE });

    // Same meaning: both physical-ideal runs still reproduce the reference.
    for (const run of [optimized, raw]) {
      const exec = run.trace.results.execution!;
      expect(totalVariation(exec.physicalIdeal!.counts, exec.logicalReference.counts)).toBeLessThan(
        0.06,
      );
    }
    // Different exposure: fewer native operations for the noise to act on.
    const gatesOf = (t: typeof optimized.trace): number =>
      t.metrics.find((m) => m.stage === 'compiled')!.gateCount;
    expect(gatesOf(optimized.trace)).toBeLessThanOrEqual(gatesOf(raw.trace));
  });

  it('keeps execution deterministic under a fixed seed', async () => {
    const config: PipelineConfig = { ...BASE, qasm: GHZ, noise: NOISE, layoutMethod: [4, 0, 3, 1] };
    const a = await runPipeline(config);
    const b = await runPipeline(config);
    expect(b.trace.results.execution!.physicalNoisy!.counts).toEqual(
      a.trace.results.execution!.physicalNoisy!.counts,
    );
    expect(b.trace.results.execution!.physicalIdeal!.counts).toEqual(
      a.trace.results.execution!.physicalIdeal!.counts,
    );
  });

  it('preserves classical-bit mapping through compilation', async () => {
    // Every recorded outcome must be as wide as the program's classical
    // register, on both the reference and the physical run.
    const circuit = parseQasm(GHZ);
    const width = circuit.numClbits;
    const { trace } = await runPipeline({ ...BASE, qasm: GHZ, noise: NOISE });
    const exec = trace.results.execution!;
    for (const outcome of Object.keys(exec.logicalReference.counts)) {
      expect(outcome.length).toBe(width);
    }
    for (const outcome of Object.keys(exec.physicalNoisy!.counts)) {
      expect(outcome.length).toBe(width);
    }
  });

  it('reports a final layout consistent with the compiled circuit', async () => {
    const circuit = parseQasm(GHZ);
    const device = getDevice('linear-5');
    const result = compile(circuit, { device, layoutMethod: [4, 0, 3, 1] });
    const { trace } = await runPipeline({ ...BASE, qasm: GHZ, layoutMethod: [4, 0, 3, 1] });
    expect(trace.finalLayout).toEqual([...result.finalLayout]);
    expect(trace.initialLayout).toEqual([4, 0, 3, 1]);
    for (const physical of trace.finalLayout!) {
      expect(physical).toBeLessThan(device.numQubits);
    }
  });
});

describe('routing scenarios exercise a real causal chain', () => {
  /**
   * Both scenarios previously ran with noise disabled, so their story ended at
   * a metric: SWAPs were counted but never executed, and the measured result
   * was identical whether routing had inserted three SWAPs or none. Their
   * completion conditions now depend on the compiled circuit having actually
   * run.
   */
  it('SWAP Storm routes, executes the routed circuit, and shows the cost', async () => {
    const scenario = getScenario('swap-storm');
    const { trace } = await runPipeline({
      qasm: getSampleCircuit(scenario.config.sampleId!).qasm,
      shots: scenario.config.shots!,
      seed: scenario.config.seed!,
      deviceId: scenario.config.deviceId!,
      noise: scenario.config.noiseEnabled ? scenario.config.noise! : null,
      layoutMethod: scenario.config.layoutMethod!,
      optimize: true,
    });

    expect(trace.metrics.find((m) => m.stage === 'compiled')!.swapCount).toBeGreaterThanOrEqual(3);
    const execution = trace.results.execution!;
    // The routed circuit ran: its noisy result is not its ideal result.
    expect(execution.physicalNoisy!.counts).not.toEqual(execution.physicalIdeal!.counts);
    // And it ran on device qubits.
    expect(trace.events.some((e) => e.stage === 'execution' && e.physicalQubits.length > 0)).toBe(
      true,
    );
    expect(scenario.isComplete(trace)).toBe(true);
  });

  it('Bad Initial Layout pays for its seats in the measured result', async () => {
    const scenario = getScenario('bad-initial-layout');
    const run = (layoutMethod: 'trivial' | 'interaction') =>
      runPipeline({
        qasm: getSampleCircuit(scenario.config.sampleId!).qasm,
        shots: scenario.config.shots!,
        seed: scenario.config.seed!,
        deviceId: scenario.config.deviceId!,
        noise: scenario.config.noise!,
        layoutMethod,
        optimize: true,
      });

    const trivial = await run('trivial');
    const automatic = await run('interaction');
    expect(scenario.isComplete(trivial.trace)).toBe(true);

    const swapsOf = (t: typeof trivial.trace): number =>
      t.metrics.find((m) => m.stage === 'compiled')!.swapCount;
    // The scenario's whole claim is that better seats cost less routing.
    expect(swapsOf(automatic.trace)).toBeLessThanOrEqual(swapsOf(trivial.trace));

    const drift = (run: typeof trivial): number =>
      totalVariation(
        run.trace.results.execution!.physicalNoisy!.counts,
        run.trace.results.execution!.logicalReference.counts,
      );
    expect(drift(automatic)).toBeLessThanOrEqual(drift(trivial));
  });
});
