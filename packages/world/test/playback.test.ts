import { describe, expect, it } from 'vitest';
import { getSampleCircuit, parseQasm } from '@qsimcity/domain';
import { runExperiment } from '@qsimcity/simulator';
import { TraceBuilder, deriveTraceId, type Trace } from 'qsimcity-trace';
import {
  activityAtTick,
  countsAtTick,
  eventsAt,
  eventsUpTo,
  maxTickOf,
  swapExchangesAt,
  tickDurationMs,
  BASE_TICK_MS,
} from '../src/playback.js';
import { convoyAt, couriersAt, districtActivityAt } from '../src/agents.js';
import { logicalToPhysicalAt } from '../src/mapping.js';
import { weatherAt } from '../src/weather.js';
import { compiledPipelineTrace, loadSampleTrace } from './fixtures.js';

async function bellTrace() {
  const qasm = getSampleCircuit('bell').qasm;
  const { trace } = await runExperiment(parseQasm(qasm), {
    shots: 100,
    seed: 'world-playback',
    programSource: qasm,
  });
  return trace;
}

/**
 * A trace whose execution events are physical, as the production pipeline
 * emits them: the compiled circuit ran on device qubits 3 and 4.
 */
function physicalTrace() {
  const builder = new TraceBuilder({
    traceId: deriveTraceId('physical', 'fixture'),
    seed: 'physical',
    generator: 'test',
    generatorVersion: '1.0.0',
    packageVersions: {},
    programSource: 'fixture',
    deviceId: 'linear-5',
    shots: 8,
    noise: null,
  });
  builder.emit({
    eventType: 'gate.executed',
    stage: 'execution',
    source: 'exact_simulation',
    certainty: 'EXACT',
    physicalQubits: [3, 4],
    instructionId: 'c0',
    payload: { gate: 'cx', phase: 'physical-ideal' },
  });
  return builder.build({
    inputCircuit: {
      name: 'fixture',
      numQubits: 2,
      numClbits: 0,
      cregs: [],
      instructions: [],
    },
    metrics: [],
    results: {},
  });
}

describe('playback model', () => {
  it('maxTickOf matches the last event tick', async () => {
    const trace = await bellTrace();
    expect(maxTickOf(trace)).toBe(trace.events.at(-1)!.logicalTick);
    expect(maxTickOf(trace)).toBeGreaterThan(3);
  });

  it('eventsAt returns only events with the exact tick', async () => {
    const trace = await bellTrace();
    for (const ev of eventsAt(trace, 3)) expect(ev.logicalTick).toBe(3);
  });

  it('eventsUpTo accumulates monotonically', async () => {
    const trace = await bellTrace();
    let prev = 0;
    for (let t = 0; t <= maxTickOf(trace); t++) {
      const n = eventsUpTo(trace, t).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBe(trace.events.length);
  });

  it('activity clamps ticks to the valid range', async () => {
    const trace = await bellTrace();
    expect(activityAtTick(trace, -5).tick).toBe(0);
    expect(activityAtTick(trace, 10_000).tick).toBe(maxTickOf(trace));
  });

  it('maps gate events to the qpu-grid district', async () => {
    const trace = await bellTrace();
    const gateEvent = trace.events.find((e) => e.eventType === 'gate.executed')!;
    const activity = activityAtTick(trace, gateEvent.logicalTick);
    expect(activity.districts.some((d) => d.districtId === 'qpu-grid')).toBe(true);
  });

  it('accumulates measured bits from representative outcomes', async () => {
    const trace = await bellTrace();
    const final = activityAtTick(trace, maxTickOf(trace));
    expect(final.measuredBits.size).toBe(2);
    const b0 = final.measuredBits.get(0)!;
    const b1 = final.measuredBits.get(1)!;
    // Bell state: the representative shot is perfectly correlated.
    expect(b0).toBe(b1);
  });

  it('tracks executed instructions cumulatively', async () => {
    const trace = await bellTrace();
    const early = activityAtTick(trace, 1);
    const late = activityAtTick(trace, maxTickOf(trace));
    expect(late.executedInstructionIds.size).toBeGreaterThanOrEqual(
      early.executedInstructionIds.size,
    );
    expect(late.executedInstructionIds.size).toBeGreaterThanOrEqual(4);
  });

  it('reports active couplings from the physical qubits that ran', () => {
    // The QPU Grid draws device qubits and device edges, so its activity has
    // to come from physical identities. A layout that maps logical 0 and 1
    // onto physical 3 and 4 must light 3 and 4.
    const trace = physicalTrace();
    const twoQubitEvent = trace.events.find(
      (e) => e.eventType === 'gate.executed' && e.physicalQubits.length === 2,
    )!;
    expect(twoQubitEvent).toBeDefined();
    const activity = activityAtTick(trace, twoQubitEvent.logicalTick);
    expect(activity.activeCouplings).toContainEqual([3, 4]);
    expect(activity.activeQubits).toEqual([3, 4]);
  });

  it('never lights the QPU Grid from logical qubit indices', async () => {
    // A logical-only trace describes no device qubits. Lighting pylon N for
    // logical qubit N would be a different qubit under any real layout, and a
    // coupling edge that may not exist on the device at all.
    const trace = await bellTrace();
    const gateEvent = trace.events.find((e) => e.eventType === 'gate.executed')!;
    expect(gateEvent.logicalQubits.length).toBeGreaterThan(0);
    expect(gateEvent.physicalQubits).toEqual([]);
    const activity = activityAtTick(trace, gateEvent.logicalTick);
    expect(activity.activeQubits).toEqual([]);
    expect(activity.activeCouplings).toEqual([]);
  });

  it('tick duration scales inversely with speed and clamps to 0.1x..5x', () => {
    expect(tickDurationMs(1)).toBe(BASE_TICK_MS);
    expect(tickDurationMs(2)).toBe(BASE_TICK_MS / 2);
    expect(tickDurationMs(0.01)).toBe(BASE_TICK_MS / 0.1);
    expect(tickDurationMs(50)).toBe(BASE_TICK_MS / 5);
  });
});

function measurementBuilder(seed: string): TraceBuilder {
  return new TraceBuilder({
    traceId: deriveTraceId(seed, 'fixture'),
    seed,
    generator: 'test',
    generatorVersion: '1.0.0',
    packageVersions: {},
    programSource: 'fixture',
    deviceId: null,
    shots: 4,
    noise: null,
  });
}

function measure(builder: TraceBuilder, clbit: number, outcome: 0 | 1, phase: string): void {
  builder.emit({
    eventType: 'measurement.sampled',
    stage: 'measurement',
    source: 'sampled_simulation',
    logicalQubits: [clbit],
    payload: { clbit, outcome, phase },
  });
}

function buildMeasurementTrace(builder: TraceBuilder, numClbits: number): Trace {
  return builder.build({
    inputCircuit: {
      name: 'fixture',
      numQubits: numClbits,
      numClbits,
      cregs: [],
      instructions: [],
    },
  });
}

describe('countsAtTick (W4.4)', () => {
  it('accumulates the representative record bit by bit, then per phase', () => {
    // Ideal phase measures c0=1, c1=0; noisy phase measures c0=0, c1=1.
    const builder = measurementBuilder('counts');
    measure(builder, 0, 1, 'ideal');
    measure(builder, 1, 0, 'ideal');
    measure(builder, 0, 0, 'noisy');
    measure(builder, 1, 1, 'noisy');
    const trace = buildMeasurementTrace(builder, 2);
    // clbit 0 is rightmost; positions not yet measured render as '?'.
    expect(countsAtTick(trace, 0)).toEqual(new Map());
    expect(countsAtTick(trace, 1)).toEqual(new Map([['?1', 1]]));
    expect(countsAtTick(trace, 2)).toEqual(new Map([['01', 1]]));
    expect(countsAtTick(trace, 3)).toEqual(
      new Map([
        ['01', 1],
        ['?0', 1],
      ]),
    );
    expect(countsAtTick(trace, 4)).toEqual(
      new Map([
        ['01', 1],
        ['10', 1],
      ]),
    );
  });

  it('starts a new record when a clbit is measured again in the same phase', () => {
    const builder = measurementBuilder('counts-mid-circuit');
    measure(builder, 0, 1, 'ideal');
    measure(builder, 0, 0, 'ideal');
    const trace = buildMeasurementTrace(builder, 1);
    expect(countsAtTick(trace, maxTickOf(trace))).toEqual(
      new Map([
        ['1', 1],
        ['0', 1],
      ]),
    );
  });

  it('counts identical records into the same bitstring', () => {
    const builder = measurementBuilder('counts-equal');
    measure(builder, 0, 1, 'ideal');
    measure(builder, 0, 1, 'ideal');
    const trace = buildMeasurementTrace(builder, 1);
    expect(countsAtTick(trace, maxTickOf(trace))).toEqual(new Map([['1', 2]]));
  });

  it('matches the representative outcomes of a real simulator run at the final tick', async () => {
    const qasm = getSampleCircuit('bell').qasm;
    const { trace } = await runExperiment(parseQasm(qasm), {
      shots: 50,
      seed: 'world-counts',
      programSource: qasm,
    });
    const counts = countsAtTick(trace, maxTickOf(trace));
    // One representative record per pass (ideal only: noise is off), fully
    // measured, and its bitstring must be one the aggregate results contain.
    let total = 0;
    for (const [bits, count] of counts) {
      total += count;
      expect(bits).not.toContain('?');
      expect(trace.results.idealCounts!.counts[bits]).toBeGreaterThan(0);
    }
    expect(total).toBe(1);
  });
});

describe('swapExchangesAt', () => {
  it('reports exactly the pairwise SWAP events at the tick', () => {
    const builder = measurementBuilder('swaps');
    builder.emit({
      eventType: 'routing.swap_inserted',
      stage: 'routing',
      source: 'reference_compiler',
      physicalQubits: [1, 2],
      payload: { physicalQubits: [1, 2] },
    });
    builder.emit({
      eventType: 'routing.swap_inserted',
      stage: 'routing',
      source: 'reference_compiler',
      physicalQubits: [0, 1],
      payload: { physicalQubits: [0, 1] },
    });
    const trace = buildMeasurementTrace(builder, 1);
    const [first, second] = trace.events;
    expect(swapExchangesAt(trace, first!.logicalTick)).toEqual([[1, 2]]);
    expect(swapExchangesAt(trace, second!.logicalTick)).toEqual([[0, 1]]);
    expect(swapExchangesAt(trace, second!.logicalTick + 1)).toEqual([]);
  });

  it('excludes the Qiskit bridge aggregate permutation summary', () => {
    const trace = loadSampleTrace('swap-storm');
    const summary = trace.events.find((e) => e.eventType === 'routing.swap_inserted')!;
    expect(Array.isArray(summary.payload['finalLayout'])).toBe(true);
    expect(swapExchangesAt(trace, summary.logicalTick)).toEqual([]);
  });
});

describe('scrub determinism (W4.5)', () => {
  /** Every semantic derivation the city renders from, evaluated at a tick. */
  function citySnapshot(trace: Trace, tick: number) {
    return {
      activity: activityAtTick(trace, tick),
      counts: countsAtTick(trace, tick),
      swaps: swapExchangesAt(trace, tick),
      mapping: logicalToPhysicalAt(trace, tick),
      weather: weatherAt(trace, tick),
      convoy: convoyAt(trace, tick),
      couriers: couriersAt(trace, tick),
      districtActivity: districtActivityAt(trace, tick),
    };
  }

  it('reproduces identical state after scrubbing away and back', async () => {
    const traces = [
      loadSampleTrace('swap-storm'),
      loadSampleTrace('bell'),
      (await compiledPipelineTrace({ sampleId: 'swap-storm', layoutMethod: 'trivial' })).trace,
    ];
    for (const trace of traces) {
      const maxTick = maxTickOf(trace);
      for (const tick of [0, Math.floor(maxTick / 2), maxTick]) {
        const before = citySnapshot(trace, tick);
        // Scrub elsewhere, including out-of-range ticks, then return.
        for (const elsewhere of [maxTick, 0, -3, maxTick + 10, Math.floor(maxTick / 3)]) {
          citySnapshot(trace, elsewhere);
        }
        expect(citySnapshot(trace, tick)).toEqual(before);
      }
    }
  });
});
