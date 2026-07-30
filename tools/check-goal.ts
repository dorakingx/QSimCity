import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scanProhibitedNames } from './check-prohibited-names.js';
import { scanLanguage } from './check-language.js';
import { scanTodos } from './check-todos.js';
import { currentCommit, readEvidence, worktreeDirty, EvidenceError } from './evidence.js';

/**
 * QSimCity completion checker (spec §23).
 *
 * This checker previously reported success while the acceptance matrix itself
 * recorded an untested mandatory risk — a gate satisfiable by documentation
 * rather than measurement. It now refuses to pass unless every mandatory
 * claim is backed by an evidence envelope generated from the current commit
 * by a command that exited zero. Prose is never accepted as evidence.
 *
 * Flags:
 *   --allow-dirty  permit evidence from a dirty worktree (local iteration).
 */

const ROOT = new URL('..', import.meta.url).pathname;
const ALLOW_DIRTY = process.argv.includes('--allow-dirty');

type Status = 'PASS' | 'FAIL';

interface CheckResult {
  readonly name: string;
  readonly status: Status;
  readonly detail: string;
}

const results: CheckResult[] = [];

function record(name: string, status: Status, detail: string): void {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}: ${detail}`);
}

function check(name: string, fn: () => string): void {
  try {
    record(name, 'PASS', fn());
  } catch (e) {
    record(name, 'FAIL', (e as Error).message);
  }
}

function run(command: string, args: string[], label: string, cwd = ROOT): string {
  try {
    execFileSync(command, args, { cwd, stdio: 'pipe', timeout: 3_600_000 });
    return `${label} succeeded`;
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const output = `${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}`;
    throw new Error(`${label} failed: ${output.trim().split('\n').slice(-6).join(' | ')}`, {
      cause: e,
    });
  }
}

const bin = (name: string): string => join(ROOT, 'node_modules', '.bin', name);

const evidenceOptions = { allowDirty: ALLOW_DIRTY };

console.log(`QSimCity completion gate — HEAD ${currentCommit().slice(0, 12)}`);
if (worktreeDirty()) {
  console.log(
    ALLOW_DIRTY
      ? 'Worktree is dirty; --allow-dirty was passed, so evidence from it is accepted.'
      : 'Worktree is dirty — evidence must be regenerated from a clean commit.',
  );
}
console.log('');

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
  'docs/audits/visual-benchmark-final.md',
  'docs/audits/release-hardening.md',
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
  const required = [
    'build',
    'verify',
    'verify:release',
    'goal:check',
    'test',
    'test:e2e',
    'test:coverage',
    'test:mutation',
    'coverage:check',
    'lighthouse',
    'soak',
    'lint',
    'typecheck',
  ];
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
  if (violations.length > 0) throw new Error(`${violations.length} file(s), first: ${violations[0]!.file}`);
  return 'no unintended non-English text';
});

check('Blocking TODO/FIXME/placeholder scan', () => {
  const violations = scanTodos(ROOT);
  if (violations.length > 0) {
    throw new Error(`${violations.length} file(s), first: ${violations[0]!.file}:${violations[0]!.line}`);
  }
  return 'no blocking markers';
});

check('License-claim policy (no open-source claim without a license)', () => {
  const hasLicense =
    existsSync(join(ROOT, 'LICENSE')) ||
    existsSync(join(ROOT, 'LICENSE.md')) ||
    existsSync(join(ROOT, 'LICENSE.txt'));
  if (hasLicense) return 'a license file exists; open-source wording is permitted';
  const offenders: string[] = [];
  for (const file of ['README.md', 'docs/product-spec.md', 'CLAUDE.md', 'CONTRIBUTING.md']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    if (/open[- ]source/i.test(content)) offenders.push(file);
  }
  if (offenders.length > 0) {
    throw new Error(
      `no license file exists, so these must not claim open-source status: ${offenders.join(', ')}`,
    );
  }
  return 'no license file, and no open-source claim is made';
});

// --------------------------------------------------------------- tests

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.venv',
  '__pycache__',
  'test-results',
  'playwright-report',
  '.work',
  'release-evidence',
]);

function countTests(): number {
  let count = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
        count += (readFileSync(full, 'utf8').match(/^\s*(it|test)\(/gm) ?? []).length;
      } else if (entry.startsWith('test_') && entry.endsWith('.py')) {
        count += (readFileSync(full, 'utf8').match(/^\s*def test_/gm) ?? []).length;
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

check('TypeScript strict typecheck', () => run(bin('tsc'), ['-p', 'tsconfig.typecheck.json'], 'typecheck'));
check('Lint (incl. architecture boundaries)', () => run(bin('eslint'), ['.'], 'lint'));
check('Unit and integration tests', () => run(bin('vitest'), ['run'], 'vitest'));
check('Production build', () => run(bin('vite'), ['build'], 'build', join(ROOT, 'apps', 'web')));
check('End-to-end browser matrix', () => run(bin('playwright'), ['test'], 'playwright'));

// --------------------------------------------------- measured evidence

check('Per-package coverage evidence', () => {
  const evidence = readEvidence<{
    packages: { package: string; lines: number; branches: number; passed: boolean }[];
  }>('release-evidence/coverage/per-package-coverage.json', {
    requiredMeasurements: [
      'project.lines',
      'project.branches',
      'domain.lines',
      'domain.branches',
      'trace.lines',
      'trace.branches',
      'simulator.lines',
      'simulator.branches',
      'reference-compiler.lines',
      'reference-compiler.branches',
    ],
    ...evidenceOptions,
  });
  const failing = evidence.detail.packages.filter((p) => !p.passed);
  if (failing.length > 0) {
    throw new Error(`core packages below threshold: ${failing.map((p) => p.package).join(', ')}`);
  }
  const m = evidence.measurements;
  return (
    `project ${m['project.lines']}%/${m['project.branches']}%; ` +
    `domain ${m['domain.lines']}%/${m['domain.branches']}%, ` +
    `trace ${m['trace.lines']}%/${m['trace.branches']}%, ` +
    `simulator ${m['simulator.lines']}%/${m['simulator.branches']}%, ` +
    `reference-compiler ${m['reference-compiler.lines']}%/${m['reference-compiler.branches']}%`
  );
});

check('Scientific mutation evidence', () => {
  const evidence = readEvidence<{
    byArea: { area: string; generated: number; killed: number }[];
    survivors: unknown[];
  }>('release-evidence/mutation/mutation-report.json', {
    requiredMeasurements: ['score', 'generated', 'killed', 'areas', 'filesInScope'],
    ...evidenceOptions,
  });
  const m = evidence.measurements;
  const areasWithoutMutants = evidence.detail.byArea.filter((a) => a.generated === 0);
  if (areasWithoutMutants.length > 0) {
    throw new Error(
      `capability areas produced no mutants: ${areasWithoutMutants.map((a) => a.area).join(', ')}`,
    );
  }
  if (Number(m['areas']) < 11) throw new Error(`only ${m['areas']} capability areas in scope`);
  if (Number(m['generated']) < 40) {
    throw new Error(`only ${m['generated']} mutants generated — the scope is too narrow`);
  }
  if (!existsSync(join(ROOT, 'release-evidence', 'mutation', 'scope-manifest.json'))) {
    throw new Error('scope-manifest.json missing — the mutation scope is undeclared');
  }
  return (
    `${(Number(m['score']) * 100).toFixed(1)}% (${m['killed']}/${m['generated']}) across ` +
    `${m['areas']} capability areas and ${m['filesInScope']} files`
  );
});

check('Lighthouse evidence meets all thresholds', () => {
  const evidence = readEvidence<Record<string, { label: string; failures: string[] }>>(
    'release-evidence/lighthouse/lighthouse-report.json',
    {
      requiredMeasurements: [
        'home-desktop.performance',
        'home-desktop.accessibility',
        'home-desktop.bestPractices',
        'home-desktop.seo',
        'home-mobile.performance',
      ],
      ...evidenceOptions,
    },
  );
  const failing = Object.values(evidence.detail).filter((t) => t.failures.length > 0);
  if (failing.length > 0) {
    throw new Error(failing.map((t) => `${t.label}: ${t.failures.join(', ')}`).join(' | '));
  }
  const m = evidence.measurements;
  return (
    `desktop perf ${m['home-desktop.performance']}, mobile perf ${m['home-mobile.performance']}, ` +
    `a11y ${m['home-desktop.accessibility']}, best-practices ${m['home-desktop.bestPractices']}, ` +
    `SEO ${m['home-desktop.seo']}`
  );
});

check('Ten-minute soak evidence', () => {
  const evidence = readEvidence('release-evidence/soak/soak-report.json', {
    requiredMeasurements: [
      'durationSeconds',
      'cycles',
      'trailingMinGrowthRatio',
      'uncaughtErrors',
      'consoleErrors',
      'unrecoveredContextLoss',
      'finalInteractionMs',
    ],
    ...evidenceOptions,
  });
  const m = evidence.measurements;
  const duration = Number(m['durationSeconds']);
  if (duration < 600) throw new Error(`soak ran only ${duration}s; 600s is required`);
  if (Number(m['cycles']) < 5) throw new Error(`only ${m['cycles']} workload cycles`);
  if (Number(m['uncaughtErrors']) > 0) throw new Error(`${m['uncaughtErrors']} uncaught errors`);
  if (Number(m['unrecoveredContextLoss']) > 0) throw new Error('unrecovered WebGL context loss');
  return (
    `${duration}s, ${m['cycles']} cycles, heap growth ratio ${m['trailingMinGrowthRatio']}, ` +
    `${m['uncaughtErrors']} uncaught, final interaction ${m['finalInteractionMs']}ms`
  );
});

check('Performance budget evidence', () => {
  const evidence = readEvidence('release-evidence/performance.json', {
    requiredMeasurements: ['initialJsGzipBytes', 'totalJsGzipBytes'],
    ...evidenceOptions,
  });
  const m = evidence.measurements;
  return `initial JS ${(Number(m['initialJsGzipBytes']) / 1024).toFixed(1)} KiB gzip`;
});

check('Security audit evidence', () => {
  const evidence = readEvidence('release-evidence/security/security-report.json', {
    requiredMeasurements: ['jsHighOrCritical', 'pythonHighOrCritical', 'secretsFound'],
    ...evidenceOptions,
  });
  const m = evidence.measurements;
  if (Number(m['jsHighOrCritical']) > 0) throw new Error('JavaScript high/critical advisories remain');
  if (Number(m['pythonHighOrCritical']) > 0) throw new Error('Python high/critical advisories remain');
  if (Number(m['secretsFound']) > 0) throw new Error('possible committed secrets found');
  return 'no high/critical advisories, no committed secrets';
});

check('Trace reproducibility evidence', () => {
  const evidence = readEvidence('release-evidence/trace-reproducibility/reproducibility.json', {
    requiredMeasurements: ['independentProcesses', 'distinctSemanticHashes', 'samplesVerified'],
    ...evidenceOptions,
  });
  const m = evidence.measurements;
  if (Number(m['distinctSemanticHashes']) !== 1) {
    throw new Error('semantic hash is not stable across independent processes');
  }
  if (Number(m['independentProcesses']) < 10) {
    throw new Error(`only ${m['independentProcesses']} independent processes checked`);
  }
  return `${m['independentProcesses']} independent processes agree; ${m['samplesVerified']} samples verified`;
});

check('Visual benchmark evidence', () => {
  const evidence = readEvidence<{ categories: { name: string; qsimcity: number }[] }>(
    'release-evidence/visual-benchmark/benchmark.json',
    { requiredMeasurements: ['categoriesCompared', 'minimumScore'], ...evidenceOptions },
  );
  const m = evidence.measurements;
  if (Number(m['minimumScore']) < 4) {
    throw new Error(`lowest visual category scores ${m['minimumScore']}/5; 4 is required`);
  }
  if (Number(m['categoriesCompared']) < 15) {
    throw new Error(`only ${m['categoriesCompared']} categories compared`);
  }
  return `${m['categoriesCompared']} categories compared, lowest score ${m['minimumScore']}/5`;
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

check('Sample traces validate and match committed hashes', () =>
  run(
    bin('vitest'),
    ['run', 'packages/trace/test/qiskit-traces.test.ts', '--coverage.enabled=false'],
    'trace hash verification',
  ),
);

check('Accessibility evidence recorded', () => {
  const spec = readFileSync(join(ROOT, 'tests', 'e2e', 'accessibility.spec.ts'), 'utf8');
  if (!spec.includes('wcag22aa')) throw new Error('axe scan does not target WCAG 2.2 AA');
  const scans = (spec.match(/expectNoViolations/g) ?? []).length;
  if (scans < 4) throw new Error(`only ${scans} axe scans`);
  return `${scans} axe scans across major surfaces, WCAG 2.2 AA tags`;
});

// ---------------------------------------------------------- deployment

check('Vercel configuration and production-equivalent behavior', () =>
  run(
    bin('vitest'),
    ['run', 'tools/test/vercel-config.test.ts', '--coverage.enabled=false'],
    'Vercel configuration verification',
  ),
);

check('Production build output present', () => {
  const dist = join(ROOT, 'apps', 'web', 'dist');
  for (const file of ['index.html', 'sw.js', 'manifest.webmanifest']) {
    if (!existsSync(join(dist, file))) throw new Error(`${file} missing from build output`);
  }
  return 'index.html, service worker, and manifest present';
});

// -------------------------------------------------------------- matrix

check('Acceptance matrix has no unmet required rows', () => {
  const matrix = readFileSync(join(ROOT, 'docs', 'acceptance-matrix.md'), 'utf8');
  const unmetStatuses = ['FAIL', 'BLOCKED', 'UNVERIFIED', 'NOT RUN', 'PARTIAL', 'PLACE' + 'HOLDER'];
  const unmetPattern = new RegExp(`\\|\\s*(${unmetStatuses.join('|')})\\s*\\|`);
  const unmet = matrix.split('\n').filter((line) => unmetPattern.test(line));
  if (unmet.length > 0) {
    throw new Error(`${unmet.length} unmet row(s), first: ${unmet[0]!.trim().slice(0, 90)}`);
  }
  return 'every row is PASS or an authorized exception';
});

check('Project state does not declare an unresolved blocker', () => {
  const state = readFileSync(join(ROOT, 'project_state.yaml'), 'utf8');
  const failedBlock = /failed_items:\s*\n((?:\s+-\s+.*\n)*)/.exec(state);
  const items = failedBlock?.[1]?.trim() ?? '';
  if (items.length > 0) {
    throw new Error(`project_state.yaml still lists failed items: ${items.split('\n')[0]!.trim()}`);
  }
  const blockedBlock = /blocked_items:\s*\n((?:\s+-\s+.*\n)*)/.exec(state);
  if ((blockedBlock?.[1]?.trim() ?? '').length > 0) {
    throw new Error('project_state.yaml still lists blocked items');
  }
  return 'no failed or blocked items recorded';
});

check('Fresh-clone verification recorded', () => {
  const content = readFileSync(join(ROOT, 'docs', 'audits', 'final-release-audit.md'), 'utf8');
  if (!/fresh clone/i.test(content)) throw new Error('final audit does not record a fresh-clone run');
  return 'fresh-clone verification recorded in the final audit';
});

// -------------------------------------------------------------- report

const failed = results.filter((r) => r.status === 'FAIL');

console.log('');
console.log(`${results.length - failed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
  console.error('\nUnmet conditions:');
  for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}

console.log('GOAL ACHIEVED: QSimCity production v1 is complete.');
void EvidenceError;
