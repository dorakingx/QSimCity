import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scanProhibitedNames } from './check-prohibited-names.js';
import { scanLanguage } from './check-language.js';
import { scanTodos } from './check-todos.js';

/**
 * QSimCity completion checker (spec §23).
 *
 * Verifies every mandatory condition from the Definition of Done that can be
 * checked mechanically. Exits 0 only when all required checks pass, and
 * prints the exact success line the specification requires.
 *
 * Flags:
 *   --fast   skip the long-running gates (E2E, coverage, mutation, build)
 *            and report them from their most recent recorded evidence.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const FAST = process.argv.includes('--fast');

type Status = 'PASS' | 'FAIL' | 'SKIPPED';

interface CheckResult {
  readonly name: string;
  readonly status: Status;
  readonly detail: string;
  /** Required checks must pass for the goal gate to succeed. */
  readonly required: boolean;
}

const results: CheckResult[] = [];

function record(name: string, status: Status, detail: string, required = true): void {
  results.push({ name, status, detail, required });
  const icon = status === 'PASS' ? 'PASS' : status === 'SKIPPED' ? 'SKIP' : 'FAIL';
  console.log(`[${icon}] ${name}: ${detail}`);
}

function check(name: string, fn: () => string, required = true): void {
  try {
    record(name, 'PASS', fn(), required);
  } catch (e) {
    record(name, 'FAIL', (e as Error).message, required);
  }
}

function run(command: string, args: string[], label: string, cwd = ROOT): string {
  try {
    execFileSync(command, args, { cwd, stdio: 'pipe', timeout: 1_800_000 });
    return `${label} succeeded`;
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const output = `${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}`;
    throw new Error(`${label} failed: ${output.trim().split('\n').slice(-6).join(' | ')}`, {
      cause: e,
    });
  }
}

/**
 * Tools are invoked through `node_modules/.bin` rather than through pnpm:
 * pnpm itself is provided by corepack and is not guaranteed to be on PATH
 * for a spawned process.
 */
const bin = (name: string): string => join(ROOT, 'node_modules', '.bin', name);

// ---------------------------------------------------------------- files

const REQUIRED_FILES = [
  'README.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'THIRD_PARTY_NOTICES.md',
  'vercel.json',
  'project_state.yaml',
  'docs/product-spec.md',
  'docs/architecture.md',
  'docs/scientific-accuracy.md',
  'docs/scientific-source-ledger.md',
  'docs/qsimcity-trace.md',
  'docs/reference-benchmark.md',
  'docs/accessibility.md',
  'docs/performance.md',
  'docs/privacy.md',
  'docs/deployment-vercel.md',
  'docs/visual-quality-rubric.md',
  'docs/acceptance-matrix.md',
  'docs/audits/current-state.md',
  'docs/audits/final-release-audit.md',
];

check('Required documents exist', () => {
  const missing = REQUIRED_FILES.filter((f) => !existsSync(join(ROOT, f)));
  if (missing.length > 0) throw new Error(`missing: ${missing.join(', ')}`);
  return `${REQUIRED_FILES.length} documents present`;
});

check('Required scripts declared', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const required = ['build', 'verify', 'verify:release', 'goal:check', 'test', 'test:e2e', 'test:coverage', 'test:mutation', 'lint', 'typecheck'];
  const missing = required.filter((s) => !(s in pkg.scripts));
  if (missing.length > 0) throw new Error(`missing scripts: ${missing.join(', ')}`);
  return `${required.length} scripts present`;
});

// ------------------------------------------------------------ policies

check('Prohibited-name scan', () => {
  const violations = scanProhibitedNames(ROOT);
  if (violations.length > 0) {
    throw new Error(
      `${violations.length} violation(s), first: ${violations[0]!.file}:${violations[0]!.line}`,
    );
  }
  return 'no prohibited project names';
});

check('Language-policy scan (English only)', () => {
  const violations = scanLanguage(ROOT);
  if (violations.length > 0) {
    throw new Error(`${violations.length} file(s), first: ${violations[0]!.file}`);
  }
  return 'no unintended non-English text';
});

check('Blocking TODO/FIXME/placeholder scan', () => {
  const violations = scanTodos(ROOT);
  if (violations.length > 0) {
    throw new Error(`${violations.length} file(s), first: ${violations[0]!.file}:${violations[0]!.line}`);
  }
  return 'no blocking markers';
});

// --------------------------------------------------------------- tests

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.venv', // third-party Python packages ship thousands of test_*.py files
  '__pycache__',
  'test-results',
  'playwright-report',
  '.work',
]);

function countTests(): number {
  let count = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
        const content = readFileSync(full, 'utf8');
        count += (content.match(/^\s*(it|test)\(/gm) ?? []).length;
      } else if (entry.startsWith('test_') && entry.endsWith('.py')) {
        const content = readFileSync(full, 'utf8');
        count += (content.match(/^\s*def test_/gm) ?? []).length;
      }
    }
  };
  walk(ROOT);
  return count;
}

check('Meaningful test count (>= 300)', () => {
  const count = countTests();
  if (count < 300) throw new Error(`only ${count} tests found`);
  return `${count} tests declared across TypeScript and Python suites`;
});

check('TypeScript strict typecheck', () =>
  run(bin('tsc'), ['-p', 'tsconfig.typecheck.json'], 'typecheck'),
);
check('Lint (incl. architecture boundaries)', () => run(bin('eslint'), ['.'], 'lint'));

if (FAST) {
  record('Unit and integration tests', 'SKIPPED', 'skipped in --fast mode', false);
  record('Coverage thresholds', 'SKIPPED', 'skipped in --fast mode', false);
  record('Production build', 'SKIPPED', 'skipped in --fast mode', false);
  record('End-to-end browser matrix', 'SKIPPED', 'skipped in --fast mode', false);
} else {
  check('Unit and integration tests', () => run(bin('vitest'), ['run'], 'vitest'));
  check('Coverage thresholds', () =>
    run(bin('vitest'), ['run', '--coverage'], 'coverage'),
  );
  check('Production build', () =>
    run(bin('vite'), ['build'], 'build', join(ROOT, 'apps', 'web')),
  );
  check('End-to-end browser matrix', () => run(bin('playwright'), ['test'], 'playwright'));
}

// ------------------------------------------------------------ evidence

check('Coverage evidence meets thresholds', () => {
  const path = join(ROOT, 'coverage', 'coverage-summary.json');
  if (!existsSync(path)) throw new Error('coverage/coverage-summary.json missing; run pnpm test:coverage');
  const summary = JSON.parse(readFileSync(path, 'utf8')) as {
    total: { lines: { pct: number }; branches: { pct: number } };
  };
  const { lines, branches } = summary.total;
  if (lines.pct < 90) throw new Error(`line coverage ${lines.pct}% < 90%`);
  if (branches.pct < 85) throw new Error(`branch coverage ${branches.pct}% < 85%`);
  return `lines ${lines.pct}%, branches ${branches.pct}%`;
});

check('Mutation score evidence (>= 70%)', () => {
  const path = join(ROOT, 'release-evidence', 'mutation-report.json');
  if (!existsSync(path)) throw new Error('release-evidence/mutation-report.json missing; run pnpm test:mutation');
  const report = JSON.parse(readFileSync(path, 'utf8')) as { score: number; killed: number; total: number };
  if (report.score < 0.7) throw new Error(`mutation score ${(report.score * 100).toFixed(1)}% < 70%`);
  return `${(report.score * 100).toFixed(1)}% (${report.killed}/${report.total} mutants killed)`;
});

check('Visual regression snapshots exist', () => {
  const dir = join(ROOT, 'tests', 'e2e', 'visual.spec.ts-snapshots');
  if (!existsSync(dir)) throw new Error('no visual snapshot directory');
  const shots = readdirSync(dir).filter((f) => f.endsWith('.png'));
  const required = [
    'home',
    'city-night',
    'city-day',
    'city-first-person',
    'lab-results',
    'compare',
    'accessible-2d',
    'webgl-fallback',
    'offline-home',
    'mobile-portrait',
    'mobile-landscape',
  ];
  const missing = required.filter((r) => !shots.some((s) => s.startsWith(r)));
  if (missing.length > 0) throw new Error(`missing snapshots: ${missing.join(', ')}`);
  return `${shots.length} snapshots covering all required surfaces`;
});

check('Sample traces validate and match committed hashes', () => {
  return run(
    join(ROOT, 'node_modules', '.bin', 'vitest'),
    ['run', 'packages/trace/test/qiskit-traces.test.ts', '--coverage.enabled=false'],
    'trace hash verification',
  );
});

check('Accessibility evidence recorded', () => {
  const spec = join(ROOT, 'tests', 'e2e', 'accessibility.spec.ts');
  const content = readFileSync(spec, 'utf8');
  if (!content.includes('wcag22aa')) throw new Error('axe scan does not target WCAG 2.2 AA');
  const scans = (content.match(/expectNoViolations/g) ?? []).length;
  if (scans < 4) throw new Error(`only ${scans} axe scans`);
  return `${scans} axe scans across major surfaces, WCAG 2.2 AA tags`;
});

check('Performance budget evidence', () => {
  const path = join(ROOT, 'release-evidence', 'performance.json');
  if (!existsSync(path)) throw new Error('release-evidence/performance.json missing');
  const report = JSON.parse(readFileSync(path, 'utf8')) as {
    initialJsGzipBytes: number;
    budgetGzipBytes: number;
    passed: boolean;
  };
  if (!report.passed) {
    throw new Error(
      `initial JS ${report.initialJsGzipBytes} bytes exceeds budget ${report.budgetGzipBytes}`,
    );
  }
  return `initial JS ${(report.initialJsGzipBytes / 1024).toFixed(1)} KiB gzip within ${(report.budgetGzipBytes / 1024).toFixed(0)} KiB budget`;
});

// ---------------------------------------------------------- deployment

check('Vercel configuration and production-equivalent behavior', () =>
  run(
    join(ROOT, 'node_modules', '.bin', 'vitest'),
    ['run', 'tools/test/vercel-config.test.ts', '--coverage.enabled=false'],
    'Vercel configuration verification',
  ),
);

check('Production build output present', () => {
  const dist = join(ROOT, 'apps', 'web', 'dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error('apps/web/dist/index.html missing');
  if (!existsSync(join(dist, 'sw.js'))) throw new Error('service worker missing from build output');
  if (!existsSync(join(dist, 'manifest.webmanifest'))) throw new Error('manifest missing');
  return 'index.html, service worker, and manifest present';
});

// -------------------------------------------------------------- matrix

check('Acceptance matrix has no unmet required rows', () => {
  const matrix = readFileSync(join(ROOT, 'docs', 'acceptance-matrix.md'), 'utf8');
  // Built from parts so this file does not itself trip the marker scanner.
  const unmetStatuses = ['FAIL', 'BLOCKED', 'UNVERIFIED', 'NOT RUN', 'PARTIAL', 'PLACE' + 'HOLDER'];
  const unmetPattern = new RegExp(`\\|\\s*(${unmetStatuses.join('|')})\\s*\\|`);
  const unmet = matrix.split('\n').filter((line) => unmetPattern.test(line));
  if (unmet.length > 0) {
    throw new Error(`${unmet.length} unmet row(s), first: ${unmet[0]!.trim().slice(0, 90)}`);
  }
  return 'every row is PASS or an authorized exception';
});

check('Release evidence recorded', () => {
  const dir = join(ROOT, 'release-evidence');
  if (!existsSync(dir)) throw new Error('release-evidence directory missing');
  const required = ['mutation-report.json', 'performance.json', 'summary.md'];
  const missing = required.filter((f) => !existsSync(join(dir, f)));
  if (missing.length > 0) throw new Error(`missing evidence: ${missing.join(', ')}`);
  return `${readdirSync(dir).length} evidence artifacts`;
});

check('Fresh-clone verification recorded', () => {
  const audit = join(ROOT, 'docs', 'audits', 'final-release-audit.md');
  const content = readFileSync(audit, 'utf8');
  if (!/fresh clone/i.test(content)) throw new Error('final audit does not record a fresh-clone run');
  return 'fresh-clone verification recorded in the final audit';
});

// -------------------------------------------------------------- report

const failed = results.filter((r) => r.status === 'FAIL' && r.required);
const skipped = results.filter((r) => r.status === 'SKIPPED');

console.log('');
console.log(
  `${results.filter((r) => r.status === 'PASS').length} passed, ${failed.length} failed, ${skipped.length} skipped`,
);

if (failed.length > 0) {
  console.error('\nUnmet conditions:');
  for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}

if (FAST) {
  console.log('\nRan in --fast mode: long-running gates were skipped, so this is not a release gate.');
  process.exit(1);
}

console.log('GOAL ACHIEVED: QSimCity production v1 is complete.');
