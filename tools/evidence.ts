import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

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

/**
 * Accept absolute or repo-relative paths. Joining an absolute path onto
 * ROOT used to concatenate the two, silently writing evidence into a junk
 * `<repo>/Users/...` tree that the goal gate then read back through the
 * same doubled path (adversarial performance review finding).
 */
function resolveEvidencePath(path: string): string {
  return isAbsolute(path) ? path : join(ROOT, path);
}

export interface EvidenceEnvelope<T> {
  /** Commit the evidence was generated from, for human traceability. */
  readonly commitSha: string;
  /**
   * Hash of the exact content of every tracked source file, excluding
   * `release-evidence/` itself. This — not `commitSha` — is what binds a
   * measurement to what was measured. Binding to the commit alone was
   * circular: committing the evidence moves HEAD, which would invalidate the
   * evidence that was just produced, forever. Content binding has no such
   * regress and is strictly more precise: no source byte can change without
   * invalidating every measurement, while a commit that changes no source
   * (a message edit, the evidence commit itself) correctly leaves it valid.
   */
  readonly sourceTreeHash: string;
  /** True when tracked source (outside `release-evidence/`) was modified. */
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
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

/** Paths whose modification does not invalidate a measurement. */
const NON_SOURCE_PATHSPECS = [':(exclude)release-evidence'];

/** Uncommitted source changes, one porcelain line each. */
export function dirtySourcePaths(): string[] {
  return execFileSync('git', ['status', '--porcelain', '--', '.', ...NON_SOURCE_PATHSPECS], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function worktreeDirty(): boolean {
  return dirtySourcePaths().length > 0;
}

/**
 * Content identity of the source tree: the blob id of every tracked file
 * outside `release-evidence/`, hashed in path order.
 */
export function sourceTreeHash(): string {
  const listing = execFileSync('git', ['ls-files', '-s', '--', '.', ...NON_SOURCE_PATHSPECS], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const entries = listing
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      // "<mode> <object> <stage>\t<path>"
      const [meta = '', path = ''] = line.split('\t');
      const parts = meta.split(/\s+/);
      return `${parts[1] ?? ''} ${path}`;
    })
    .sort();
  if (entries.length === 0) throw new Error('no tracked source files found');
  return hashString(entries.join('\n'));
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
  envelope: Omit<
    EvidenceEnvelope<T>,
    'commitSha' | 'sourceTreeHash' | 'worktreeDirty' | 'generatedAt'
  >,
): EvidenceEnvelope<T> {
  const full: EvidenceEnvelope<T> = {
    commitSha: currentCommit(),
    sourceTreeHash: sourceTreeHash(),
    worktreeDirty: worktreeDirty(),
    generatedAt: new Date().toISOString(),
    ...envelope,
  };
  const path = resolveEvidencePath(relativePath);
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
  const path = resolveEvidencePath(relativePath);
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
    'sourceTreeHash',
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
  const current = sourceTreeHash();
  if (envelope.sourceTreeHash !== current) {
    throw new EvidenceError(
      `${relativePath} measured source tree ${envelope.sourceTreeHash} but the tree is now ` +
        `${current} — the source changed after the measurement, so regenerate it`,
    );
  }
  if (options.allowDirty !== true) {
    if (envelope.worktreeDirty) {
      throw new EvidenceError(
        `${relativePath} was generated with uncommitted source changes; commit them and regenerate`,
      );
    }
    const dirty = dirtySourcePaths();
    if (dirty.length > 0) {
      throw new EvidenceError(
        `source has ${dirty.length} uncommitted change(s) (first: ${dirty[0]!}) that are not ` +
          `covered by ${relativePath}; commit them and regenerate the evidence`,
      );
    }
  }
  if (envelope.exitStatus !== 0) {
    throw new EvidenceError(`${relativePath} records a failed run (exit ${envelope.exitStatus})`);
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
