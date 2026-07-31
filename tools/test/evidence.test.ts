import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EvidenceError,
  readEvidence,
  sourceTreeHash,
  writeEvidence,
  type EvidenceEnvelope,
} from '../evidence.js';

/**
 * The evidence reader is the load-bearing part of the completion gate: every
 * mandatory verdict is whatever it agrees to return. A checker that accepts a
 * stale, failed, or malformed envelope is exactly the defect that let an unrun
 * soak test coexist with a passing gate, so each refusal path is asserted here.
 *
 * Fixtures live under `release-evidence/tmp/`, which is git-ignored, so running
 * these tests never dirties the source tree the envelopes bind to.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const TMP_REL = 'release-evidence/tmp/evidence-test';
const TMP_ABS = join(ROOT, TMP_REL);

function fixture(name: string, envelope: unknown): string {
  mkdirSync(TMP_ABS, { recursive: true });
  const rel = `${TMP_REL}/${name}`;
  writeFileSync(
    join(ROOT, rel),
    typeof envelope === 'string' ? envelope : JSON.stringify(envelope, null, 2),
  );
  return rel;
}

function validEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commitSha: 'a'.repeat(40),
    sourceTreeHash: sourceTreeHash(),
    worktreeDirty: false,
    generatedAt: new Date().toISOString(),
    tool: 'test-tool',
    toolVersion: '1.0.0',
    command: 'test',
    exitStatus: 0,
    inputHash: 'deadbeefdeadbeef',
    thresholds: { minimum: 1 },
    measurements: { score: 42 },
    passed: true,
    detail: {},
    ...overrides,
  };
}

const options = { requiredMeasurements: ['score'], allowDirty: true } as const;

afterEach(() => {
  rmSync(TMP_ABS, { recursive: true, force: true });
});

describe('readEvidence', () => {
  it('accepts a well-formed envelope for the current source tree', () => {
    const path = fixture('good.json', validEnvelope());
    const envelope = readEvidence(path, options);
    expect(envelope.measurements['score']).toBe(42);
  });

  it('refuses a missing file rather than treating absence as success', () => {
    expect(() => readEvidence(`${TMP_REL}/never-written.json`, options)).toThrow(EvidenceError);
    expect(() => readEvidence(`${TMP_REL}/never-written.json`, options)).toThrow(
      /has not been run/,
    );
  });

  it('refuses an empty file', () => {
    const path = fixture('empty.json', '');
    expect(() => readEvidence(path, options)).toThrow(/is empty/);
  });

  it('refuses a file that is not valid JSON', () => {
    const path = fixture('broken.json', '{ this is not json');
    expect(() => readEvidence(path, options)).toThrow(/not valid JSON/);
  });

  it.each([
    'commitSha',
    'sourceTreeHash',
    'generatedAt',
    'tool',
    'toolVersion',
    'command',
    'exitStatus',
    'thresholds',
    'measurements',
    'passed',
  ])('refuses an envelope missing "%s"', (field) => {
    const envelope = validEnvelope();
    delete envelope[field];
    const path = fixture(`missing-${field}.json`, envelope);
    expect(() => readEvidence(path, options)).toThrow(
      new RegExp(`missing required envelope field "${field}"`),
    );
  });

  it('refuses evidence measured against a different source tree', () => {
    const path = fixture('stale.json', validEnvelope({ sourceTreeHash: '0'.repeat(16) }));
    expect(() => readEvidence(path, options)).toThrow(/the source changed after the measurement/);
  });

  it('refuses a run that exited non-zero', () => {
    const path = fixture('failed-exit.json', validEnvelope({ exitStatus: 1 }));
    expect(() => readEvidence(path, options)).toThrow(/records a failed run/);
  });

  it('refuses a run that recorded its own failure', () => {
    const path = fixture('not-passed.json', validEnvelope({ passed: false }));
    expect(() => readEvidence(path, options)).toThrow(/records passed=false/);
  });

  it('refuses an envelope that omits a required measurement', () => {
    const path = fixture('no-measurement.json', validEnvelope());
    expect(() =>
      readEvidence(path, { requiredMeasurements: ['absent'], allowDirty: true }),
    ).toThrow(/missing measurement "absent"/);
  });

  it('refuses evidence generated from uncommitted source unless dirt is allowed', () => {
    const path = fixture('dirty.json', validEnvelope({ worktreeDirty: true }));
    expect(() => readEvidence(path, { requiredMeasurements: ['score'] })).toThrow(
      /uncommitted source changes/,
    );
    // The same envelope is acceptable for local iteration.
    expect(readEvidence(path, options).measurements['score']).toBe(42);
  });
});

describe('writeEvidence', () => {
  it('stamps the envelope with the source tree it measured', () => {
    const rel = `${TMP_REL}/written.json`;
    mkdirSync(TMP_ABS, { recursive: true });
    const written: EvidenceEnvelope<{ note: string }> = writeEvidence(rel, {
      tool: 'test-tool',
      toolVersion: '1.0.0',
      command: 'test',
      exitStatus: 0,
      inputHash: 'deadbeefdeadbeef',
      thresholds: { minimum: 1 },
      measurements: { score: 42 },
      passed: true,
      detail: { note: 'round trip' },
    });
    expect(written.sourceTreeHash).toBe(sourceTreeHash());
    expect(written.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(readEvidence<{ note: string }>(rel, options).detail.note).toBe('round trip');
  });
});
