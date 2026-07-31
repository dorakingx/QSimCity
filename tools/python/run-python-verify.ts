/**
 * Python bridge verification evidence.
 *
 * The Qiskit bridge is what cross-validates the browser simulator and what
 * produced every committed sample trace, yet the completion gate only ever
 * *counted* its test definitions by reading files. A count is not a result: a
 * suite that fails, errors on import, or is never run counts exactly the same
 * as one that passes. This runs the suite and records what happened.
 *
 * Every step must actually run. A missing `uv`, a lockfile that no longer
 * resolves, or a type checker that cannot start is a failure, not a skip.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeEvidence, hashString } from '../evidence.js';

const ROOT = new URL('../..', import.meta.url).pathname;
const BRIDGE = join(ROOT, 'python', 'qsimcity_qiskit');

interface Step {
  readonly id: string;
  readonly args: readonly string[];
  readonly timeoutMinutes: number;
}

const REPORT_DIR = mkdtempSync(join(tmpdir(), 'qsimcity-python-verify-'));
const JUNIT_PATH = join(REPORT_DIR, 'pytest.xml');

const STEPS: readonly Step[] = [
  { id: 'sync', args: ['sync', '--frozen'], timeoutMinutes: 20 },
  { id: 'ruff-check', args: ['run', 'ruff', 'check', '.'], timeoutMinutes: 10 },
  { id: 'ruff-format', args: ['run', 'ruff', 'format', '--check', '.'], timeoutMinutes: 10 },
  { id: 'pyright', args: ['run', 'pyright'], timeoutMinutes: 20 },
  // Counts come from the JUnit report, not from stdout: the project sets
  // `addopts = "-q"`, so any additional `-q` suppresses the summary line
  // entirely and a text parser silently reads zero tests.
  { id: 'pytest', args: ['run', 'pytest', `--junit-xml=${JUNIT_PATH}`], timeoutMinutes: 60 },
];

interface StepResult {
  readonly id: string;
  readonly command: string;
  readonly exitStatus: number;
  readonly durationSeconds: number;
  readonly tail: string;
}

/** Exact counts from pytest's JUnit report. */
function parseJunit(path: string): { passed: number; failed: number; skipped: number } {
  if (!existsSync(path)) {
    throw new Error(`pytest produced no JUnit report at ${path}; the suite did not run`);
  }
  const xml = readFileSync(path, 'utf8');
  const read = (attribute: string): number => {
    const match = new RegExp(`${attribute}="(\\d+)"`).exec(xml);
    return match ? Number(match[1]) : 0;
  };
  const total = read('tests');
  const failures = read('failures');
  const errors = read('errors');
  const skipped = read('skipped');
  return { passed: total - failures - errors - skipped, failed: failures + errors, skipped };
}

/** pyright prints `N errors, M warnings, K informations`. */
function parsePyright(output: string): number {
  const match = /(\d+) errors?, \d+ warnings?/.exec(output);
  return match ? Number(match[1]) : output.includes('0 errors') ? 0 : -1;
}

/** Reads a pinned dependency version out of the lockfile. */
function lockedVersion(lock: string, name: string): string {
  const pattern = new RegExp(`name = "${name}"\\s*\\nversion = "([^"]+)"`);
  const match = pattern.exec(lock);
  return match?.[1] ?? 'unknown';
}

function main(): void {
  process.stdout.write('Python bridge verification\n');

  const probe = spawnSync('uv', ['--version'], { cwd: BRIDGE, encoding: 'utf8' });
  if (probe.error !== undefined || probe.status !== 0) {
    throw new Error(
      'uv is not available, so the Qiskit bridge cannot be verified. Install uv ' +
        '(https://docs.astral.sh/uv/) and rerun. The bridge is optional to use and ' +
        'mandatory to verify: it cross-validates the browser simulator.',
    );
  }
  const uvVersion = (probe.stdout ?? '').trim();

  const results: StepResult[] = [];
  const outputs: Record<string, string> = {};
  let allPassed = true;

  for (const step of STEPS) {
    const started = Date.now();
    const run = spawnSync('uv', [...step.args], {
      cwd: BRIDGE,
      encoding: 'utf8',
      timeout: step.timeoutMinutes * 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    outputs[step.id] = output;
    const exitStatus = run.status ?? 1;
    const durationSeconds = Number(((Date.now() - started) / 1000).toFixed(1));
    results.push({
      id: step.id,
      command: `uv ${step.args.join(' ')}`,
      exitStatus,
      durationSeconds,
      tail: output.trim().split('\n').slice(-10).join('\n'),
    });
    process.stdout.write(
      `  ${exitStatus === 0 ? 'PASS' : 'FAIL'} ${step.id} (${durationSeconds}s)\n`,
    );
    if (exitStatus !== 0) {
      allPassed = false;
      process.stderr.write(`${output.trim().split('\n').slice(-25).join('\n')}\n`);
      break;
    }
  }

  const { passed, failed, skipped } = parseJunit(JUNIT_PATH);
  const pyrightErrors = parsePyright(outputs['pyright'] ?? '');
  const lock = readFileSync(join(BRIDGE, 'uv.lock'), 'utf8');
  rmSync(REPORT_DIR, { recursive: true, force: true });

  // A suite that ran but asserted nothing is not evidence either.
  const ranTests = passed > 0 && failed === 0;
  const passedAll = allPassed && ranTests && pyrightErrors === 0;

  writeEvidence('release-evidence/python/python-verify.json', {
    tool: 'qsimcity-python-verify',
    toolVersion: uvVersion,
    command: STEPS.map((s) => `uv ${s.args.join(' ')}`).join(' && '),
    exitStatus: passedAll ? 0 : 1,
    inputHash: hashString(lock),
    thresholds: { pytestFailed: 0, pyrightErrors: 0, minimumPytestPassed: 1 },
    measurements: {
      pytestPassed: passed,
      pytestFailed: failed,
      pytestSkipped: skipped,
      pyrightErrors,
      ruffCheck: results.find((r) => r.id === 'ruff-check')?.exitStatus === 0 ? 'clean' : 'failed',
      ruffFormat:
        results.find((r) => r.id === 'ruff-format')?.exitStatus === 0 ? 'clean' : 'failed',
      stepsRun: results.length,
      stepsPassed: results.filter((r) => r.exitStatus === 0).length,
      qiskitVersion: lockedVersion(lock, 'qiskit'),
      qiskitAerVersion: lockedVersion(lock, 'qiskit-aer'),
      uvVersion,
    },
    passed: passedAll,
    detail: { steps: results },
  });

  process.stdout.write(
    `  pytest ${passed} passed / ${failed} failed, pyright ${pyrightErrors} errors, ` +
      `qiskit ${lockedVersion(lock, 'qiskit')}, aer ${lockedVersion(lock, 'qiskit-aer')}\n`,
  );

  if (!passedAll) {
    process.stderr.write('Python bridge verification FAILED\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Python bridge verification PASSED\n');
}

main();
