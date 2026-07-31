import { describe, expect, it } from 'vitest';
import { TraceBuilder, deriveTraceId } from '../src/builder.js';
import {
  serializeTrace,
  deserializeTrace,
  traceContentHash,
  traceFileName,
} from '../src/serialize.js';
import { parseTraceJson, validateTrace, TraceValidationError } from '../src/validate.js';
import { migrateTraceData, TraceMigrationError } from '../src/migrate.js';
import { eventContext, TRACE_SCHEMA_VERSION, type Trace, type TraceCircuit } from '../src/types.js';

const bellCircuit: TraceCircuit = {
  name: 'bell',
  numQubits: 2,
  numClbits: 2,
  cregs: [{ name: 'c', size: 2 }],
  instructions: [
    { id: 'i0', kind: 'gate', name: 'h', qubits: [0], params: [], clbits: [], condition: null },
    { id: 'i1', kind: 'gate', name: 'cx', qubits: [0, 1], params: [], clbits: [], condition: null },
    {
      id: 'i2',
      kind: 'measure',
      name: 'measure',
      qubits: [0],
      params: [],
      clbits: [0],
      condition: null,
    },
    {
      id: 'i3',
      kind: 'measure',
      name: 'measure',
      qubits: [1],
      params: [],
      clbits: [1],
      condition: null,
    },
  ],
};

function buildSampleTrace(): Trace {
  const builder = new TraceBuilder({
    traceId: deriveTraceId('seed-1', 'bell-source'),
    seed: 'seed-1',
    generator: 'qsimcity-simulator',
    generatorVersion: '1.0.0',
    packageVersions: { '@qsimcity/simulator': '1.0.0' },
    programSource: 'bell-source',
    deviceId: 'linear-5',
    shots: 100,
  });
  builder.emit({
    eventType: 'program.loaded',
    stage: 'input',
    source: 'exact_simulation',
    payload: { sampleId: 'bell' },
  });
  builder.emit({
    eventType: 'gate.executed',
    stage: 'execution',
    source: 'exact_simulation',
    instructionId: 'i0',
    logicalQubits: [0],
    sourceDurationNs: 35,
  });
  builder.emit({
    eventType: 'execution.completed',
    stage: 'result',
    source: 'exact_simulation',
  });
  return builder.build({
    inputCircuit: bellCircuit,
    metrics: [{ stage: 'input', gateCount: 2, twoQubitGateCount: 1, swapCount: 0, depth: 3 }],
    results: {
      idealProbabilities: { '00': 0.5, '11': 0.5 },
      idealCounts: {
        counts: { '00': 52, '11': 48 },
        shots: 100,
        source: 'sampled_simulation',
        certainty: 'SAMPLED',
      },
    },
  });
}

describe('TraceBuilder', () => {
  it('produces a schema-valid trace', () => {
    const trace = buildSampleTrace();
    expect(() => validateTrace(trace)).not.toThrow();
  });

  it('assigns monotonically increasing ticks and unique event ids', () => {
    const trace = buildSampleTrace();
    const ticks = trace.events.map((e) => e.logicalTick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    expect(new Set(trace.events.map((e) => e.eventId)).size).toBe(trace.events.length);
  });

  it('derives certainty from source when not overridden', () => {
    const trace = buildSampleTrace();
    expect(trace.events[0]!.certainty).toBe('EXACT');
  });

  it('supports emitting without advancing the tick', () => {
    const builder = new TraceBuilder({
      traceId: 't-1',
      seed: 's',
      generator: 'g',
      generatorVersion: '1',
      packageVersions: {},
      programSource: 'p',
    });
    const a = builder.emit({
      eventType: 'program.loaded',
      stage: 'input',
      source: 'exact_simulation',
    });
    const b = builder.emit({
      eventType: 'program.parsed',
      stage: 'parse',
      source: 'exact_simulation',
      advanceTick: false,
    });
    expect(b.logicalTick).toBe(a.logicalTick);
  });

  it('records the input hash of the program source', () => {
    const trace = buildSampleTrace();
    expect(trace.inputHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('deriveTraceId is stable', () => {
    expect(deriveTraceId('a', 'b')).toBe(deriveTraceId('a', 'b'));
    expect(deriveTraceId('a', 'b')).not.toBe(deriveTraceId('a', 'c'));
  });

  it('eventContext exposes trace-level fields per event', () => {
    const trace = buildSampleTrace();
    const ctx = eventContext(trace, trace.events[1]!);
    expect(ctx.schemaVersion).toBe(TRACE_SCHEMA_VERSION);
    expect(ctx.seed).toBe('seed-1');
    expect(ctx.inputHash).toBe(trace.inputHash);
    expect(ctx.eventType).toBe('gate.executed');
  });
});

describe('serialization round-trip', () => {
  it('serialize -> deserialize preserves content', () => {
    const trace = buildSampleTrace();
    const restored = deserializeTrace(serializeTrace(trace));
    expect(restored).toEqual(trace);
  });

  it('content hash ignores traceId and createdAt', () => {
    const a = buildSampleTrace();
    const b: Trace = {
      ...buildSampleTrace(),
      traceId: 'different',
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    expect(traceContentHash(a)).toBe(traceContentHash(b));
  });

  it('content hash changes when results change', () => {
    const a = buildSampleTrace();
    const b: Trace = {
      ...a,
      results: { ...a.results, idealProbabilities: { '00': 1 } },
    };
    expect(traceContentHash(a)).not.toBe(traceContentHash(b));
  });

  it('traceFileName sanitizes the circuit name', () => {
    const trace = buildSampleTrace();
    expect(traceFileName(trace)).toMatch(/^bell-[a-z0-9-]+\.qsimcity\.json$/);
  });
});

describe('validateTrace invariants', () => {
  it('rejects counts that do not sum to shots', () => {
    const trace = buildSampleTrace();
    const bad = {
      ...trace,
      results: {
        idealCounts: {
          counts: { '00': 1 },
          shots: 100,
          source: 'sampled_simulation',
          certainty: 'SAMPLED',
        },
      },
    };
    expect(() => validateTrace(bad)).toThrow(TraceValidationError);
  });

  it('rejects unnormalized probabilities', () => {
    const trace = buildSampleTrace();
    const bad = { ...trace, results: { idealProbabilities: { '00': 0.9 } } };
    expect(() => validateTrace(bad)).toThrow(/idealProbabilities/);
  });

  it('rejects events referencing unknown instructions', () => {
    const trace = buildSampleTrace();
    const bad = {
      ...trace,
      events: trace.events.map((e) => (e.instructionId ? { ...e, instructionId: 'ghost' } : e)),
    };
    expect(() => validateTrace(bad)).toThrow(/unknown instruction/);
  });

  it('rejects decreasing logical ticks', () => {
    const trace = buildSampleTrace();
    const events = [...trace.events];
    events[2] = { ...events[2]!, logicalTick: 0 };
    expect(() => validateTrace({ ...trace, events })).toThrow(/decreases/);
  });

  it('rejects duplicate event ids', () => {
    const trace = buildSampleTrace();
    const events = [...trace.events];
    events[1] = { ...events[1]!, eventId: events[0]!.eventId };
    expect(() => validateTrace({ ...trace, events })).toThrow(/duplicate eventId/);
  });

  it('rejects layouts with repeated physical qubits', () => {
    const trace = buildSampleTrace();
    expect(() => validateTrace({ ...trace, initialLayout: [1, 1] })).toThrow(/distinct/);
  });

  it('rejects layouts of the wrong length', () => {
    const trace = buildSampleTrace();
    expect(() => validateTrace({ ...trace, initialLayout: [0] })).toThrow(/length/);
  });

  it('rejects circuits whose instructions exceed qubit bounds', () => {
    const trace = buildSampleTrace();
    const bad = {
      ...trace,
      inputCircuit: {
        ...trace.inputCircuit,
        instructions: [
          {
            id: 'i0',
            kind: 'gate',
            name: 'h',
            qubits: [5],
            params: [],
            clbits: [],
            condition: null,
          },
        ],
      },
    };
    expect(() => validateTrace(bad)).toThrow(/references qubit/);
  });

  it('rejects structurally invalid data with readable issues', () => {
    try {
      validateTrace({ schemaVersion: '1.0.0', nonsense: true });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(TraceValidationError);
      expect((e as TraceValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects wrong-type payloads deep in events', () => {
    const trace = buildSampleTrace();
    const bad = {
      ...trace,
      events: [{ ...trace.events[0]!, logicalTick: 'one' }],
    };
    expect(() => validateTrace(bad)).toThrow(TraceValidationError);
  });
});

describe('parseTraceJson', () => {
  it('parses serialized traces', () => {
    const trace = buildSampleTrace();
    expect(parseTraceJson(serializeTrace(trace)).traceId).toBe(trace.traceId);
  });

  it('rejects non-JSON input', () => {
    expect(() => parseTraceJson('not json {')).toThrow(/not valid JSON/);
  });

  it('rejects oversized input before parsing', () => {
    const big = `{"pad":"${'x'.repeat(33 * 1024 * 1024)}"}`;
    expect(() => parseTraceJson(big)).toThrow(/import limit/);
  });
});

describe('schema migration', () => {
  it('migrates 0.9.0 traces onto the compatible 1.x line', () => {
    const legacy = {
      ...buildSampleTrace(),
      schemaVersion: '0.9.0',
      randomSeed: 'old-seed',
    } as Record<string, unknown>;
    delete legacy['seed'];
    delete legacy['finalLayout'];
    const migrated = migrateTraceData(legacy) as Record<string, unknown>;
    // 0.9.0 is migrated structurally to 1.0.0. It is deliberately not
    // rewritten to the current 1.1.0: 1.1.0 only adds optional fields, so a
    // 1.x document is already valid, and rewriting its version string would
    // change the content hash of every committed trace on load.
    const [major] = String(migrated['schemaVersion']).split('.');
    expect(major).toBe(TRACE_SCHEMA_VERSION.split('.')[0]);
    expect(migrated['seed']).toBe('old-seed');
    expect(migrated['finalLayout']).toBeNull();
    expect(() => validateTrace(legacy)).not.toThrow();
  });

  it('accepts same-major newer versions untouched', () => {
    const data = { schemaVersion: '1.2.0', foo: 1 };
    expect(migrateTraceData(data)).toEqual(data);
  });

  it('rejects unknown major versions', () => {
    expect(() => migrateTraceData({ schemaVersion: '3.0.0' })).toThrow(TraceMigrationError);
  });

  it('passes through non-object data for the schema to reject', () => {
    expect(migrateTraceData(null)).toBeNull();
    expect(migrateTraceData([1])).toEqual([1]);
    expect(() => validateTrace(null)).toThrow(TraceValidationError);
  });
});

describe('TraceValidationError message formatting', () => {
  it('omits the separator when there are no issues', () => {
    expect(new TraceValidationError('Something failed').message).toBe('Something failed');
  });

  it('appends issues when present', () => {
    const error = new TraceValidationError('Failed', ['a: bad', 'b: worse']);
    expect(error.message).toBe('Failed: a: bad; b: worse');
    expect(error.issues).toHaveLength(2);
  });
});
