import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Release-evidence envelope.
 *
 * The previous completion checker accepted evidence that was stale, empty, or
 * merely asserted in prose — it reported success while the acceptance matrix
 * itself recorded an untested mandatory risk. Every artifact now carries the
 * commit it was produced from, the command that produced it, the tool
 * version, the exit status, and the thresholds it was judged against. The
 * checker verifies the envelope before trusting a single number.
 */

const ROOT = new URL('..', import.meta.url).pathname;

export interface EvidenceEnvelope<T> {
  /** Commit the evidence was generated from. */
  readonly commitSha: string;
  /** True when the worktree had uncommitted changes at generation time. */
  readonly worktreeDirty: boolean;
  readonly generatedAt: string;
  readonly tool: string;
  readonly toolVersion: string;
  readonly command: string;
  readonly exitStatus: number;
  /** Hash of the inputs or configuration the measurement depended on. */
  readonly inputHash: string;
  readonly thresholds: Readonly<Record<string, number | string>>;
  readonly measurements: Readonly<Record<string, number | string | boolean>>;
  readonly passed: boolean;
  readonly detail: T;
}

export function currentCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

export function worktreeDirty(): boolean {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  return status.length > 0;
}

/** FNV-1a 64 over a string; matches packages/trace's hashing. */
export function hashString(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of Buffer.from(text, 'utf8')) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

export function writeEvidence<T>(
  relativePath: string,
  envelope: Omit<EvidenceEnvelope<T>, 'commitSha' | 'worktreeDirty' | 'generatedAt'>,
): EvidenceEnvelope<T> {
  const full: EvidenceEnvelope<T> = {
    commitSha: currentCommit(),
    worktreeDirty: worktreeDirty(),
    generatedAt: new Date().toISOString(),
    ...envelope,
  };
  const path = join(ROOT, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(full, null, 2) + '\n');
  return full;
}

export class EvidenceError extends Error {}

/**
 * Loads an evidence envelope and refuses it unless it belongs to the current
 * commit, records a successful run, and reports the expected measurements.
 */
export function readEvidence<T>(
  relativePath: string,
  options: {
    readonly requiredMeasurements: readonly string[];
    /** Allow evidence from a dirty worktree (local iteration only). */
    readonly allowDirty?: boolean;
  },
): EvidenceEnvelope<T> {
  const path = join(ROOT, relativePath);
  if (!existsSync(path)) {
    throw new EvidenceError(`${relativePath} is missing — the measurement has not been run`);
  }
  const raw = readFileSync(path, 'utf8');
  if (raw.trim().length === 0) {
    throw new EvidenceError(`${relativePath} is empty`);
  }
  let envelope: EvidenceEnvelope<T>;
  try {
    envelope = JSON.parse(raw) as EvidenceEnvelope<T>;
  } catch {
    throw new EvidenceError(`${relativePath} is not valid JSON`);
  }
  for (const field of [
    'commitSha',
    'generatedAt',
    'tool',
    'toolVersion',
    'command',
    'exitStatus',
    'thresholds',
    'measurements',
    'passed',
  ] as const) {
    if (envelope[field] === undefined || envelope[field] === null) {
      throw new EvidenceError(`${relativePath} is missing required envelope field "${field}"`);
    }
  }
  const head = currentCommit();
  if (envelope.commitSha !== head) {
    throw new EvidenceError(
      `${relativePath} was generated from ${envelope.commitSha.slice(0, 12)} but HEAD is ` +
        `${head.slice(0, 12)} — regenerate it against the current commit`,
    );
  }
  if (envelope.worktreeDirty && options.allowDirty !== true) {
    throw new EvidenceError(
      `${relativePath} was generated from a dirty worktree; commit the changes and regenerate`,
    );
  }
  if (envelope.exitStatus !== 0) {
    throw new EvidenceError(
      `${relativePath} records a failed run (exit ${envelope.exitStatus})`,
    );
  }
  if (envelope.passed !== true) {
    throw new EvidenceError(`${relativePath} records passed=false`);
  }
  for (const key of options.requiredMeasurements) {
    if (!(key in envelope.measurements)) {
      throw new EvidenceError(`${relativePath} is missing measurement "${key}"`);
    }
  }
  return envelope;
}
