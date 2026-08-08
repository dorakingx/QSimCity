import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every number the documentation is allowed to state, read from evidence.
 *
 * The README, the WISER submission and the release summary all used to
 * carry hand-copied metrics. They drifted, as hand-copied metrics do: the
 * release summary still described version 1.0.0 and five artifacts long
 * after there were fourteen, and the README quoted a bundle figure against
 * the wrong budget. Prose cannot be trusted to track measurement, so the
 * prose no longer holds the measurements — this module does, and
 * `pnpm docs:sync` writes them into marked blocks that `pnpm docs:check`
 * refuses to let go stale.
 *
 * Nothing here computes anything. Every field is read from an envelope
 * under `release-evidence/`, which is itself bound to the source tree it
 * measured, so a number can only reach a document by having been measured.
 */

const ROOT = new URL('../..', import.meta.url).pathname;

const bin = (name: string): string => join(ROOT, 'node_modules', '.bin', name);

interface Envelope {
  readonly sourceTreeHash: string;
  readonly commitSha: string;
  readonly generatedAt: string;
  readonly worktreeDirty: boolean;
  readonly passed: boolean;
  readonly measurements: Record<string, unknown>;
}

function envelope(relative: string): Envelope {
  const path = join(ROOT, 'release-evidence', relative);
  if (!existsSync(path)) {
    throw new Error(
      `missing evidence envelope: release-evidence/${relative} — run pnpm evidence:all`,
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Envelope;
}

function num(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`evidence key ${key} is not a finite number (got ${String(value)})`);
  }
  return value;
}

function str(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`evidence key ${key} is not a non-empty string`);
  }
  return value;
}

const kib = (bytes: number): string => (bytes / 1024).toFixed(1);

export interface DocsFacts {
  readonly sourceTreeHash: string;
  readonly productVersion: string;
  readonly unitTests: number;
  readonly e2eTests: number;
  readonly coverageLines: string;
  readonly coverageBranches: string;
  readonly mutationScore: string;
  readonly mutantsGenerated: number;
  readonly mutantsKilled: number;
  readonly mutantsSurvived: number;
  readonly pytestPassed: number;
  readonly qiskitVersion: string;
  readonly aerVersion: string;
  readonly reproProcesses: number;
  readonly reproDistinctSemanticHashes: number;
  readonly soakSeconds: number;
  readonly soakCycles: number;
  readonly soakConsoleErrors: number;
  readonly remountCycles: number;
  readonly remountHeapSlopeKib: string;
  readonly remountPeakContexts: number;
  readonly initialJsKib: string;
  readonly totalJsKib: string;
  readonly freshCloneSteps: number;
  readonly freshCloneFailed: number;
  readonly demoSeconds: number;
  readonly demoCaptions: number;
  readonly demoSha256: string;
  readonly goalChecksPassed: number;
  readonly goalChecksFailed: number;
}

/** Product version, canonical across package, app, PWA manifest and docs. */
export function productVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

/** Counts the `[PASS]`/`[FAIL]` lines in the recorded gate output. */
function goalCheckTotals(): { passed: number; failed: number } {
  const path = join(ROOT, 'release-evidence', 'goal-check.txt');
  if (!existsSync(path)) throw new Error('missing release-evidence/goal-check.txt');
  const text = readFileSync(path, 'utf8');
  const match = /^(\d+) passed, (\d+) failed$/m.exec(text);
  if (!match) throw new Error('release-evidence/goal-check.txt has no "N passed, M failed" line');
  return { passed: Number(match[1]), failed: Number(match[2]) };
}

export function readFacts(): DocsFacts {
  const coverage = envelope('coverage/per-package-coverage.json');
  const mutation = envelope('mutation/mutation-report.json');
  const python = envelope('python/python-verify.json');
  const repro = envelope('trace-reproducibility/reproducibility.json');
  const soak = envelope('soak/soak-report.json');
  const remount = envelope('remount/remount-report.json');
  const perf = envelope('performance.json');
  const clone = envelope('fresh-clone/fresh-clone.json');

  const demoPath = join(ROOT, 'release-evidence', 'demo', 'demo-manifest.json');
  if (!existsSync(demoPath)) throw new Error('missing release-evidence/demo/demo-manifest.json');
  const demo = JSON.parse(readFileSync(demoPath, 'utf8')) as {
    recordedDurationMs: number;
    captionCount: number;
    sha256: string;
    sourceTreeHash: string;
  };

  const totals = goalCheckTotals();

  return {
    sourceTreeHash: coverage.sourceTreeHash,
    productVersion: productVersion(),
    unitTests: countVitestTests(),
    e2eTests: countPlaywrightTests(),
    coverageLines: num(coverage.measurements, 'project.lines').toFixed(2),
    coverageBranches: num(coverage.measurements, 'project.branches').toFixed(2),
    mutationScore: num(mutation.measurements, 'score').toFixed(4),
    mutantsGenerated: num(mutation.measurements, 'generated'),
    mutantsKilled: num(mutation.measurements, 'killed'),
    mutantsSurvived: num(mutation.measurements, 'survived'),
    pytestPassed: num(python.measurements, 'pytestPassed'),
    qiskitVersion: str(python.measurements, 'qiskitVersion'),
    aerVersion: str(python.measurements, 'qiskitAerVersion'),
    reproProcesses: num(repro.measurements, 'independentProcesses'),
    reproDistinctSemanticHashes: num(repro.measurements, 'distinctSemanticHashes'),
    soakSeconds: num(soak.measurements, 'durationSeconds'),
    soakCycles: num(soak.measurements, 'cycles'),
    soakConsoleErrors: num(soak.measurements, 'consoleErrors'),
    remountCycles: num(remount.measurements, 'cyclesCompleted'),
    remountHeapSlopeKib: kib(num(remount.measurements, 'heapSlopeBytesPerCycle')),
    remountPeakContexts: num(remount.measurements, 'peakLiveWebglContexts'),
    initialJsKib: kib(num(perf.measurements, 'initialJsGzipBytes')),
    totalJsKib: kib(num(perf.measurements, 'totalJsGzipBytes')),
    freshCloneSteps: num(clone.measurements, 'stepsPassed'),
    freshCloneFailed: num(clone.measurements, 'failedSteps'),
    demoSeconds: Math.round(demo.recordedDurationMs / 1000),
    demoCaptions: demo.captionCount,
    demoSha256: demo.sha256,
    goalChecksPassed: totals.passed,
    goalChecksFailed: totals.failed,
  };
}

/**
 * Test counts come from the suites themselves, not from a stored number.
 *
 * "How many tests are there" is a property of the tree, and the README has
 * been wrong about it twice — once claiming 942/94 when the suites held
 * 952/105. Both listers are cheap enough (about one and three seconds) to
 * run in `docs:check` as well as `docs:sync`, so the count in the document
 * is compared against the suites on every check rather than against a
 * cached figure that can rot the same way the prose did.
 */
function countVitestTests(): number {
  const listed = execFileSync(bin('vitest'), ['list'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // One `file > suite > test name` line per test case.
  return listed.split('\n').filter((line) => line.includes(' > ')).length;
}

function countPlaywrightTests(): number {
  const listed = execFileSync(bin('playwright'), ['test', '--list', '--reporter=json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const report = JSON.parse(listed) as { suites?: PlaywrightSuite[] };
  let total = 0;
  const walk = (suite: PlaywrightSuite): void => {
    for (const spec of suite.specs ?? []) total += (spec.tests ?? []).length;
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return total;
}

interface PlaywrightSuite {
  readonly specs?: { readonly tests?: unknown[] }[];
  readonly suites?: PlaywrightSuite[];
}
