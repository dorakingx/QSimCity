import { describe, expect, it } from 'vitest';
import { TraceBuilder, deriveTraceId } from '../src/builder.js';
import { traceFileName, canonicalTraceJson, TRACE_FILE_EXTENSION } from '../src/serialize.js';
import { migrateTraceData } from '../src/migrate.js';
import { DEFAULT_CERTAINTY, SOURCE_CLASSIFICATIONS, eventContext } from '../src/types.js';
import { validateTrace } from '../src/validate.js';

function minimalTrace(overrides: Record<string, unknown> = {}) {
  const builder = new TraceBuilder({
    traceId: 't-cov',
    seed: 'cov',
    generator: 'test',
    generatorVersion: '1.0.0',
    packageVersions: {},
    programSource: 'src',
    generatorDetails: { backend: 'model', calibrated: true, qubits: 5 },
  });
  builder.emit({ eventType: 'program.loaded', stage: 'input', source: 'exact_simulation' });
  return {
    ...builder.build({
      inputCircuit: {
        name: 'x',
        numQubits: 1,
        numClbits: 0,
        cregs: [],
        instructions: [],
      },
    }),
    ...overrides,
  };
}

describe('builder details and defaults', () => {
  it('carries generator details into every event', () => {
    const trace = minimalTrace();
    expect(trace.generator.details).toEqual({ backend: 'model', calibrated: true, qubits: 5 });
    expect(trace.events[0]!.provenance.details).toEqual(trace.generator.details);
    expect(() => validateTrace(trace)).not.toThrow();
  });

  it('maps every source classification to a default certainty', () => {
    for (const source of SOURCE_CLASSIFICATIONS) {
      expect(DEFAULT_CERTAINTY[source]).toBeTruthy();
    }
  });

  it('exposes the running tick', () => {
    const builder = new TraceBuilder({
      traceId: 't',
      seed: 's',
      generator: 'g',
      generatorVersion: '1',
      packageVersions: {},
      programSource: 'p',
    });
    expect(builder.currentTick).toBe(0);
    builder.emit({ eventType: 'program.loaded', stage: 'input', source: 'exact_simulation' });
    expect(builder.currentTick).toBe(1);
  });

  it('defaults shots and noise when unspecified', () => {
    const trace = minimalTrace();
    expect(trace.shots).toBe(0);
    expect(trace.noise).toBeNull();
    expect(trace.deviceId).toBeNull();
  });

  it('deriveTraceId is stable and prefixed', () => {
    expect(deriveTraceId('a', 'b')).toMatch(/^t-[0-9a-f]{16}$/);
  });
});

describe('serialization helpers', () => {
  it('canonicalTraceJson sorts keys deterministically', () => {
    const json = canonicalTraceJson(minimalTrace());
    expect(json.indexOf('"createdAt"')).toBeLessThan(json.indexOf('"seed"'));
    expect(json).not.toContain('\n');
  });

  it('traceFileName falls back when the circuit name is unusable', () => {
    const trace = minimalTrace();
    const named = { ...trace, inputCircuit: { ...trace.inputCircuit, name: '///' } };
    expect(traceFileName(named)).toBe(`trace-${trace.traceId.slice(0, 8)}${TRACE_FILE_EXTENSION}`);
  });

  it('traceFileName truncates very long circuit names', () => {
    const trace = minimalTrace();
    const named = { ...trace, inputCircuit: { ...trace.inputCircuit, name: 'a'.repeat(120) } };
    expect(traceFileName(named).length).toBeLessThan(80);
  });

  it('eventContext merges trace-level identity into an event', () => {
    const trace = minimalTrace();
    const ctx = eventContext(trace, trace.events[0]!);
    expect(ctx.traceId).toBe('t-cov');
    expect(ctx.packageVersions).toEqual({});
  });
});

describe('migration edge paths', () => {
  it('keeps an already-current version untouched', () => {
    const data = { schemaVersion: '1.0.0', value: 1 };
    expect(migrateTraceData(data)).toEqual(data);
  });

  it('rejects an older unsupported major version', () => {
    expect(() => migrateTraceData({ schemaVersion: '0.1.0' })).toThrow(/Unsupported trace schema/);
  });

  it('ignores objects with a non-string schemaVersion', () => {
    const data = { schemaVersion: 7 };
    expect(migrateTraceData(data)).toEqual(data);
  });

  it('leaves 0.9.0 traces that already have the new field names', () => {
    const trace = minimalTrace();
    const legacy = { ...trace, schemaVersion: '0.9.0' };
    const migrated = migrateTraceData(legacy) as Record<string, unknown>;
    expect(migrated['schemaVersion']).toBe('1.0.0');
    expect(migrated['seed']).toBe('cov');
  });
});
