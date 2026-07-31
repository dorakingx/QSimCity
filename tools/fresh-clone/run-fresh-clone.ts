/**
 * Fresh-clone verification evidence.
 *
 * The completion gate used to satisfy this requirement by grepping the final
 * audit for the words "fresh clone" — the same prose-as-evidence weakness that
 * let an unrun soak test coexist with a passing gate. This clones the
 * repository at HEAD into a temporary directory, installs from the committed
 * lockfile, and runs the verification suite there, so the claim is a
 * measurement rather than a sentence.
 *
 * The clone deliberately gets nothing from this working tree: no
 * `node_modules`, no build output, no `release-evidence`. Anything the
 * repository cannot produce from its own committed contents fails here.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentCommit, writeEvidence, hashString } from '../evidence.js';

const ROOT = new URL('../..', import.meta.url).pathname;

interface Step {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  /** Minutes before the step is considered hung. */
  readonly timeoutMinutes: number;
}

const STEPS: readonly Step[] = [
  { id: 'install', command: 'pnpm', args: ['install', '--frozen-lockfile'], timeoutMinutes: 20 },
  { id: 'typecheck', command: 'pnpm', args: ['typecheck'], timeoutMinutes: 15 },
  { id: 'lint', command: 'pnpm', args: ['lint'], timeoutMinutes: 15 },
  { id: 'format', command: 'pnpm', args: ['format'], timeoutMinutes: 10 },
  { id: 'policy-names', command: 'pnpm', args: ['check:names'], timeoutMinutes: 5 },
  { id: 'policy-language', command: 'pnpm', args: ['check:language'], timeoutMinutes: 5 },
  { id: 'policy-todos', command: 'pnpm', args: ['check:todos'], timeoutMinutes: 5 },
  { id: 'unit-tests', command: 'pnpm', args: ['test'], timeoutMinutes: 30 },
  // Runs the coverage gate, not just the tests: a generator that is missing
  // from the clone (ignored by a stray .gitignore rule, say) fails here rather
  // than passing because the file happens to exist on the author's machine.
  { id: 'coverage', command: 'pnpm', args: ['test:coverage'], timeoutMinutes: 30 },
  { id: 'coverage-gate', command: 'pnpm', args: ['coverage:check'], timeoutMinutes: 10 },
  { id: 'security-audit', command: 'pnpm', args: ['security:audit'], timeoutMinutes: 20 },
  { id: 'trace-reproducibility', command: 'pnpm', args: ['repro:check'], timeoutMinutes: 30 },
  // The Qiskit bridge cross-validates the browser simulator, so a clone that
  // cannot verify it is not a verified clone.
  { id: 'python-verify', command: 'pnpm', args: ['python:verify'], timeoutMinutes: 60 },
  { id: 'build', command: 'pnpm', args: ['build'], timeoutMinutes: 20 },
  { id: 'perf-budget', command: 'pnpm', args: ['check:perf'], timeoutMinutes: 10 },
  { id: 'e2e', command: 'pnpm', args: ['test:e2e'], timeoutMinutes: 45 },
];

interface StepResult {
  readonly id: string;
  readonly command: string;
  readonly exitStatus: number;
  readonly durationSeconds: number;
  readonly tail: string;
}

function main(): void {
  const commit = currentCommit();
  const workDir = mkdtempSync(join(tmpdir(), 'qsimcity-fresh-clone-'));
  const clone = join(workDir, 'qsimcity');
  process.stdout.write(`Fresh-clone verification of ${commit.slice(0, 12)}\n  into ${clone}\n`);

  const results: StepResult[] = [];
  let allPassed = true;

  try {
    execFileSync('git', ['clone', '--quiet', '--no-hardlinks', ROOT, clone], {
      encoding: 'utf8',
      timeout: 10 * 60_000,
    });
    execFileSync('git', ['checkout', '--quiet', commit], { cwd: clone, encoding: 'utf8' });

    // Nothing may leak in from this working tree.
    for (const forbidden of ['node_modules', 'apps/web/dist', 'coverage']) {
      if (existsSync(join(clone, forbidden))) {
        throw new Error(`clone unexpectedly contains ${forbidden}`);
      }
    }

    for (const step of STEPS) {
      const started = Date.now();
      const run = spawnSync(step.command, [...step.args], {
        cwd: clone,
        encoding: 'utf8',
        timeout: step.timeoutMinutes * 60_000,
        maxBuffer: 128 * 1024 * 1024,
        env: { ...process.env, CI: '1' },
      });
      const durationSeconds = Number(((Date.now() - started) / 1000).toFixed(1));
      const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
      const exitStatus = run.status ?? 1;
      results.push({
        id: step.id,
        command: `${step.command} ${step.args.join(' ')}`,
        exitStatus,
        durationSeconds,
        tail: output.trim().split('\n').slice(-8).join('\n'),
      });
      const verdict = exitStatus === 0 ? 'PASS' : 'FAIL';
      process.stdout.write(`  ${verdict} ${step.id} (${durationSeconds}s)\n`);
      if (exitStatus !== 0) {
        allPassed = false;
        process.stderr.write(`${output.trim().split('\n').slice(-25).join('\n')}\n`);
        break;
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  const totalSeconds = Number(results.reduce((sum, r) => sum + r.durationSeconds, 0).toFixed(1));

  writeEvidence('release-evidence/fresh-clone/fresh-clone.json', {
    tool: 'qsimcity-fresh-clone',
    toolVersion: process.version,
    command: 'git clone <repo> && pnpm install --frozen-lockfile && verify + build + e2e',
    exitStatus: allPassed ? 0 : 1,
    inputHash: hashString(STEPS.map((s) => `${s.command} ${s.args.join(' ')}`).join('\n')),
    thresholds: { stepsRequired: STEPS.length, failedSteps: 0 },
    measurements: {
      stepsRun: results.length,
      stepsPassed: results.filter((r) => r.exitStatus === 0).length,
      failedSteps: results.filter((r) => r.exitStatus !== 0).length,
      totalSeconds,
    },
    passed: allPassed && results.length === STEPS.length,
    detail: { commit, steps: results },
  });

  if (!allPassed) {
    process.stderr.write('Fresh-clone verification FAILED\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Fresh-clone verification PASSED in ${totalSeconds}s\n`);
}

main();
