import { describe, expect, it } from 'vitest';
import { TraceBuilder, deriveTraceId, type Trace } from 'qsimcity-trace';
import { logicalToPhysicalAt, physicalToLogicalAt } from '../src/mapping.js';
import { maxTickOf } from '../src/playback.js';
import { compiledPipelineTrace, loadSampleTrace } from './fixtures.js';

function emptyCircuit(numQubits: number) {
  return {
    name: 'fixture',
    numQubits,
    numClbits: 0,
    cregs: [],
    instructions: [],
  } as const;
}

function builderWith(seed: string): TraceBuilder {
  return new TraceBuilder({
    traceId: deriveTraceId(seed, 'fixture'),
    seed,
    generator: 'test',
    generatorVersion: '1.0.0',
    packageVersions: {},
    programSource: 'fixture',
    deviceId: 'linear-5',
    shots: 1,
    noise: null,
  });
}

/** Hand-built trace: layout [0->2, 1->0, 2->1], then a SWAP on physical [2, 1]. */
function handBuiltTrace(): Trace {
  const builder = builderWith('mapping');
  builder.emit({
    eventType: 'layout.assigned',
    stage: 'layout',
    source: 'reference_compiler',
    logicalQubits: [0, 1, 2],
    physicalQubits: [2, 0, 1],
    payload: { layout: [2, 0, 1], method: 'trivial' },
  });
  builder.emit({
    eventType: 'routing.swap_inserted',
    stage: 'routing',
    source: 'reference_compiler',
    logicalQubits: [0, 2],
    physicalQubits: [2, 1],
    payload: { physicalQubits: [2, 1] },
  });
  return builder.build({ inputCircuit: emptyCircuit(3) });
}

describe('logical-to-physical mapping (W4.2)', () => {
  it('is empty before any layout event', () => {
    const trace = handBuiltTrace();
    expect(logicalToPhysicalAt(trace, 0).size).toBe(0);
  });

  it('matches the assigned layout at the layout tick', () => {
    const trace = handBuiltTrace();
    const layoutTick = trace.events.find((e) => e.eventType === 'layout.assigned')!.logicalTick;
    const map = logicalToPhysicalAt(trace, layoutTick);
    expect(map.get(0)).toBe(2);
    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(1);
  });

  it('exchanges the logical residents of the swapped physical qubits', () => {
    const trace = handBuiltTrace();
    const map = logicalToPhysicalAt(trace, maxTickOf(trace));
    // SWAP on physical [2, 1]: logical 0 (was on 2) moves to 1; logical 2
    // (was on 1) moves to 2; logical 1 stays on 0.
    expect(map.get(0)).toBe(1);
    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(2);
  });

  it('falls back to zipped qubit lists when payload.layout is absent', () => {
    const builder = builderWith('mapping-zip');
    builder.emit({
      eventType: 'layout.assigned',
      stage: 'layout',
      source: 'reference_compiler',
      logicalQubits: [0, 1],
      physicalQubits: [4, 3],
      payload: {},
    });
    const trace = builder.build({ inputCircuit: emptyCircuit(2) });
    const map = logicalToPhysicalAt(trace, maxTickOf(trace));
    expect(map.get(0)).toBe(4);
    expect(map.get(1)).toBe(3);
  });

  it('ignores SWAPs on physical qubits that hold no logical qubit', () => {
    const builder = builderWith('mapping-idle');
    builder.emit({
      eventType: 'layout.assigned',
      stage: 'layout',
      source: 'reference_compiler',
      logicalQubits: [0],
      physicalQubits: [0],
      payload: { layout: [0] },
    });
    builder.emit({
      eventType: 'routing.swap_inserted',
      stage: 'routing',
      source: 'reference_compiler',
      physicalQubits: [3, 4],
      payload: { physicalQubits: [3, 4] },
    });
    const trace = builder.build({ inputCircuit: emptyCircuit(1) });
    const map = logicalToPhysicalAt(trace, maxTickOf(trace));
    expect(map.get(0)).toBe(0);
    expect(map.size).toBe(1);
  });

  it('adopts the aggregate finalLayout of a Qiskit bridge summary event', () => {
    const trace = loadSampleTrace('swap-storm');
    const layoutTick = trace.events.find((e) => e.eventType === 'layout.assigned')!.logicalTick;
    const swapTick = trace.events.find((e) => e.eventType === 'routing.swap_inserted')!.logicalTick;
    const before = logicalToPhysicalAt(trace, layoutTick);
    trace.initialLayout!.forEach((physical, logical) => {
      expect(before.get(logical)).toBe(physical);
    });
    const after = logicalToPhysicalAt(trace, swapTick);
    trace.finalLayout!.forEach((physical, logical) => {
      expect(after.get(logical)).toBe(physical);
    });
  });

  it('matches the compiler-reported final layout after the last routing event', async () => {
    // Property over routing-heavy and routing-free pipelines: replaying
    // layout.assigned plus every routing.swap_inserted exchange must land on
    // exactly the final layout the real compiler reports.
    const cases = [
      { sampleId: 'swap-storm', deviceId: 'linear-5', layoutMethod: 'trivial' as const },
      { sampleId: 'swap-storm', deviceId: 'linear-5', layoutMethod: 'interaction' as const },
      { sampleId: 'qft-3', deviceId: 'linear-5', layoutMethod: 'interaction' as const },
      { sampleId: 'ghz-4', deviceId: 'grid-3x3', layoutMethod: 'trivial' as const },
      { sampleId: 'bell', deviceId: 'linear-5', layoutMethod: 'interaction' as const },
    ];
    let sawRouting = false;
    for (const options of cases) {
      const { trace, result } = await compiledPipelineTrace(options);
      if (result.swapCount > 0) sawRouting = true;
      const map = logicalToPhysicalAt(trace, maxTickOf(trace));
      result.finalLayout.forEach((physical, logical) => {
        expect(map.get(logical), `${options.sampleId} logical ${logical}`).toBe(physical);
      });
      const layoutTick = trace.events.find((e) => e.eventType === 'layout.assigned')!.logicalTick;
      const initial = logicalToPhysicalAt(trace, layoutTick);
      result.initialLayout.forEach((physical, logical) => {
        expect(initial.get(logical), `${options.sampleId} initial ${logical}`).toBe(physical);
      });
    }
    // The property is vacuous unless at least one case actually routed.
    expect(sawRouting).toBe(true);
  });

  it('inverts exactly via physicalToLogicalAt at every tick', async () => {
    const { trace } = await compiledPipelineTrace({
      sampleId: 'swap-storm',
      layoutMethod: 'trivial',
    });
    for (let tick = 0; tick <= maxTickOf(trace); tick++) {
      const forward = logicalToPhysicalAt(trace, tick);
      const inverse = physicalToLogicalAt(trace, tick);
      expect(inverse.size).toBe(forward.size);
      for (const [logical, physical] of forward) {
        expect(inverse.get(physical)).toBe(logical);
      }
    }
  });

  it('is a pure function of (trace, tick)', () => {
    const trace = handBuiltTrace();
    const tick = maxTickOf(trace);
    expect(logicalToPhysicalAt(trace, tick)).toEqual(logicalToPhysicalAt(trace, tick));
    expect(physicalToLogicalAt(trace, tick)).toEqual(physicalToLogicalAt(trace, tick));
  });
});
