import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Targeted mutation testing for the scientific core (spec §18.4).
 *
 * A deliberately small, dependency-free harness: it applies one source
 * mutation at a time to the highest-risk scientific modules, runs the tests
 * that cover them, and reports the fraction of mutants the suite kills.
 * Using a bespoke runner (rather than Stryker) keeps the toolchain small and
 * makes the mutation catalogue explicit and reviewable.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const WORK = join(ROOT, 'tools', 'mutation', '.work');

export interface MutationSpec {
  /** Source file, relative to the repository root. */
  readonly file: string;
  /** Exact text to replace (must occur exactly once). */
  readonly find: string;
  /** Replacement that changes behavior. */
  readonly replace: string;
  /** Test paths to run for this mutant. */
  readonly tests: readonly string[];
  readonly description: string;
}

/**
 * Mutations chosen to target scientific invariants: gate arithmetic,
 * measurement sampling, noise probabilities, routing legality, layout
 * bookkeeping, hashing, and validation bounds.
 */
export const MUTATIONS: readonly MutationSpec[] = [
  {
    file: 'packages/simulator/src/statevector.ts',
    find: 're[j] = m10r * ar - m10i * ai + m11r * br - m11i * bi;',
    replace: 're[j] = m10r * ar + m10i * ai + m11r * br - m11i * bi;',
    tests: ['packages/simulator', 'packages/reference-compiler'],
    description: 'flip a sign in single-qubit gate application',
  },
  {
    file: 'packages/simulator/src/statevector.ts',
    find: 'if ((outcome === 1) !== isOne) {',
    replace: 'if ((outcome === 1) === isOne) {',
    tests: ['packages/simulator'],
    description: 'invert measurement collapse projection',
  },
  {
    file: 'packages/simulator/src/statevector.ts',
    find: 'if ((i & bit) !== 0) p += state.re[i]! * state.re[i]! + state.im[i]! * state.im[i]!;',
    replace: 'if ((i & bit) === 0) p += state.re[i]! * state.re[i]! + state.im[i]! * state.im[i]!;',
    tests: ['packages/simulator'],
    description: 'invert P(qubit = 1) selection',
  },
  {
    file: 'packages/simulator/src/noise.ts',
    find: 'if (rng.next() >= p) return null;',
    replace: 'if (rng.next() >= p / 2) return null;',
    tests: ['packages/simulator'],
    description: 'halve the depolarizing firing rate',
  },
  {
    file: 'packages/simulator/src/noise.ts',
    find: 'const pDecay = gamma * p1;',
    replace: 'const pDecay = gamma;',
    tests: ['packages/simulator'],
    description: 'ignore excited population in amplitude damping',
  },
  {
    file: 'packages/simulator/src/noise.ts',
    find: 'const factor = Math.sqrt(1 - gamma);',
    replace: 'const factor = 1 - gamma;',
    tests: ['packages/simulator'],
    description: 'wrong Kraus amplitude scaling in amplitude damping',
  },
  {
    file: 'packages/simulator/src/engine.ts',
    find: 'const trueOutcome: 0 | 1 = rng.next() < p1 ? 1 : 0;',
    replace: 'const trueOutcome: 0 | 1 = rng.next() < p1 ? 0 : 1;',
    tests: ['packages/simulator', 'packages/ui/test/scenarios.test.ts'],
    description: 'invert measurement sampling outcome',
  },
  {
    file: 'packages/simulator/src/engine.ts',
    find: 'const satisfied = actual === instr.condition.value;',
    replace: 'const satisfied = actual !== instr.condition.value;',
    tests: ['packages/simulator', 'packages/ui/test/scenarios.test.ts'],
    description: 'invert classical condition evaluation',
  },
  {
    file: 'packages/domain/src/gates.ts',
    find: 'return mat([[c, 0], [0, -s], [0, -s], [c, 0]]);',
    replace: 'return mat([[c, 0], [0, s], [0, -s], [c, 0]]);',
    tests: ['packages/domain', 'packages/reference-compiler'],
    description: 'break RX matrix symmetry',
  },
  {
    file: 'packages/domain/src/topology.ts',
    find: 'if (dist[s]![v] === Infinity) {',
    replace: 'if (dist[s]![v] !== Infinity) {',
    tests: ['packages/domain', 'packages/reference-compiler'],
    description: 'break BFS visited check in distance matrix',
  },
  {
    file: 'packages/reference-compiler/src/passes.ts',
    find: 'if (!hasEdge(device, pa, pb)) {',
    replace: 'if (hasEdge(device, pa, pb)) {',
    tests: ['packages/reference-compiler'],
    description: 'route only when qubits are already adjacent',
  },
  {
    file: 'packages/reference-compiler/src/passes.ts',
    find: 'for (let i = 0; i + 2 < path.length; i++) {',
    replace: 'for (let i = 0; i + 1 < path.length; i++) {',
    tests: ['packages/reference-compiler'],
    description: 'insert one SWAP too many while routing',
  },
  {
    file: 'packages/reference-compiler/src/euler.ts',
    find: 'const theta = 2 * Math.atan2(absC, absA);',
    replace: 'const theta = Math.atan2(absC, absA);',
    tests: ['packages/reference-compiler'],
    description: 'drop the factor of two in the ZYZ polar angle',
  },
  {
    file: 'packages/trace/src/hash.ts',
    find: 'hash = (hash * FNV_PRIME) & MASK64;',
    replace: 'hash = (hash + FNV_PRIME) & MASK64;',
    tests: ['packages/trace'],
    description: 'break FNV-1a multiplication step',
  },
  {
    file: 'packages/trace/src/validate.ts',
    find: 'if (total !== counts.shots) {',
    replace: 'if (total < 0) {',
    tests: ['packages/trace'],
    description: 'stop validating that counts sum to shots',
  },
  {
    file: 'packages/domain/src/circuit.ts',
    find: 'const level = Math.max(0, ...wires) + (instr.kind === \'barrier\' ? 0 : 1);',
    replace: 'const level = Math.max(0, ...wires) + 1;',
    tests: ['packages/domain'],
    description: 'count barriers toward circuit depth',
  },
];

interface MutantResult {
  readonly spec: MutationSpec;
  readonly killed: boolean;
}

function runTests(paths: readonly string[]): boolean {
  try {
    execFileSync(
      'node',
      [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...paths, '--coverage.enabled=false'],
      { cwd: ROOT, stdio: 'pipe', timeout: 300_000 },
    );
    return true; // tests passed => mutant survived
  } catch {
    return false; // tests failed => mutant killed
  }
}

export function runMutationTesting(): { score: number; results: MutantResult[] } {
  mkdirSync(WORK, { recursive: true });
  const results: MutantResult[] = [];
  for (const [index, spec] of MUTATIONS.entries()) {
    const target = join(ROOT, spec.file);
    const backup = join(WORK, `backup-${index}`);
    const original = readFileSync(target, 'utf8');
    const occurrences = original.split(spec.find).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `Mutation ${index} (${spec.description}) matched ${occurrences} times in ${spec.file}; ` +
          'the source changed and the mutation catalogue needs updating.',
      );
    }
    copyFileSync(target, backup);
    try {
      writeFileSync(target, original.replace(spec.find, spec.replace));
      const passed = runTests(spec.tests);
      const killed = !passed;
      results.push({ spec, killed });
      console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} ${spec.file}: ${spec.description}`);
    } finally {
      copyFileSync(backup, target);
      rmSync(backup, { force: true });
    }
  }
  const killedCount = results.filter((r) => r.killed).length;
  return { score: killedCount / results.length, results };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) {
  const threshold = Number(process.env['MUTATION_THRESHOLD'] ?? '0.7');
  const { score, results } = runMutationTesting();
  const survived = results.filter((r) => !r.killed);
  console.log(
    `\nMutation score: ${(score * 100).toFixed(1)}% (${results.length - survived.length}/${results.length} killed), threshold ${(threshold * 100).toFixed(0)}%`,
  );
  writeFileSync(
    join(ROOT, 'release-evidence', 'mutation-report.json'),
    JSON.stringify(
      {
        score,
        threshold,
        total: results.length,
        killed: results.length - survived.length,
        survivors: survived.map((r) => ({ file: r.spec.file, description: r.spec.description })),
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
  if (score < threshold) {
    console.error('Mutation score below threshold.');
    process.exit(1);
  }
}
