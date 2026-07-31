import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * Per-package coverage verification (spec §18.4).
 *
 * An aggregate number can hide a weak core package, so each scientific
 * package is measured and gated on its own, and the totals are reported
 * separately. The generated data — not a prose claim — is what the release
 * gate reads.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'release-evidence', 'coverage');

export const CORE_PACKAGE_THRESHOLDS = { lines: 95, branches: 90 } as const;
export const PROJECT_THRESHOLDS = { lines: 90, branches: 85 } as const;

export const CORE_PACKAGES = [
  'packages/domain',
  'packages/trace',
  'packages/simulator',
  'packages/reference-compiler',
] as const;

interface FileCoverage {
  lines: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
}

interface PackageResult {
  readonly package: string;
  readonly lines: number;
  readonly branches: number;
  readonly functions: number;
  readonly statements: number;
  readonly fileCount: number;
  readonly uncoveredLines: number;
  readonly passed: boolean;
  readonly failures: string[];
}

function pct(covered: number, total: number): number {
  return total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2));
}

function aggregate(summary: Record<string, FileCoverage>, prefix: string): Omit<PackageResult, 'package' | 'passed' | 'failures'> {
  const totals = {
    lines: [0, 0],
    branches: [0, 0],
    functions: [0, 0],
    statements: [0, 0],
  };
  let fileCount = 0;
  for (const [file, cov] of Object.entries(summary)) {
    if (file === 'total') continue;
    const relative = file.replace(ROOT, '').replace(/^\//, '');
    if (!relative.startsWith(prefix)) continue;
    fileCount++;
    totals.lines[0]! += cov.lines.covered;
    totals.lines[1]! += cov.lines.total;
    totals.branches[0]! += cov.branches.covered;
    totals.branches[1]! += cov.branches.total;
    totals.functions[0]! += cov.functions.covered;
    totals.functions[1]! += cov.functions.total;
    totals.statements[0]! += cov.statements.covered;
    totals.statements[1]! += cov.statements.total;
  }
  return {
    lines: pct(totals.lines[0]!, totals.lines[1]!),
    branches: pct(totals.branches[0]!, totals.branches[1]!),
    functions: pct(totals.functions[0]!, totals.functions[1]!),
    statements: pct(totals.statements[0]!, totals.statements[1]!),
    fileCount,
    uncoveredLines: totals.lines[1]! - totals.lines[0]!,
  };
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const summaryPath = join(ROOT, 'coverage', 'coverage-summary.json');
  if (!existsSync(summaryPath) || process.env['COVERAGE_REFRESH'] === '1') {
    console.log('Running coverage…');
    execFileSync(join(ROOT, 'node_modules', '.bin', 'vitest'), ['run', '--coverage'], {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 1_800_000,
    });
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as Record<string, FileCoverage> & {
    total: FileCoverage;
  };

  const packages: PackageResult[] = CORE_PACKAGES.map((pkg) => {
    const agg = aggregate(summary, `${pkg}/src`);
    const failures: string[] = [];
    if (agg.lines < CORE_PACKAGE_THRESHOLDS.lines) {
      failures.push(`lines ${agg.lines}% < ${CORE_PACKAGE_THRESHOLDS.lines}%`);
    }
    if (agg.branches < CORE_PACKAGE_THRESHOLDS.branches) {
      failures.push(`branches ${agg.branches}% < ${CORE_PACKAGE_THRESHOLDS.branches}%`);
    }
    if (agg.fileCount === 0) failures.push('no files matched — the package path may be wrong');
    return { package: pkg, ...agg, passed: failures.length === 0, failures };
  });

  const project = {
    lines: summary.total.lines.pct,
    branches: summary.total.branches.pct,
    functions: summary.total.functions.pct,
    statements: summary.total.statements.pct,
  };
  const projectFailures: string[] = [];
  if (project.lines < PROJECT_THRESHOLDS.lines) {
    projectFailures.push(`project lines ${project.lines}% < ${PROJECT_THRESHOLDS.lines}%`);
  }
  if (project.branches < PROJECT_THRESHOLDS.branches) {
    projectFailures.push(`project branches ${project.branches}% < ${PROJECT_THRESHOLDS.branches}%`);
  }

  const passed = packages.every((p) => p.passed) && projectFailures.length === 0;

  const measurements: Record<string, number> = {
    'project.lines': project.lines,
    'project.branches': project.branches,
    'project.functions': project.functions,
    'project.statements': project.statements,
  };
  for (const p of packages) {
    const key = p.package.replace('packages/', '');
    measurements[`${key}.lines`] = p.lines;
    measurements[`${key}.branches`] = p.branches;
  }

  writeEvidence('release-evidence/coverage/per-package-coverage.json', {
    tool: 'vitest-v8-coverage',
    toolVersion: '4.1.10',
    command: 'pnpm coverage:check',
    exitStatus: passed ? 0 : 1,
    inputHash: hashString(JSON.stringify(CORE_PACKAGES) + JSON.stringify(CORE_PACKAGE_THRESHOLDS)),
    thresholds: {
      coreLines: CORE_PACKAGE_THRESHOLDS.lines,
      coreBranches: CORE_PACKAGE_THRESHOLDS.branches,
      projectLines: PROJECT_THRESHOLDS.lines,
      projectBranches: PROJECT_THRESHOLDS.branches,
    },
    measurements,
    passed,
    detail: { packages, project, projectFailures },
  });

  const lines = [
    '# Coverage by Package',
    '',
    'Core scientific packages are gated individually; an aggregate number cannot',
    'hide a weak package.',
    '',
    '| Package | Lines | Branches | Functions | Files | Uncovered lines | Result |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const p of packages) {
    lines.push(
      `| \`${p.package}\` | ${p.lines}% (≥${CORE_PACKAGE_THRESHOLDS.lines}%) | ` +
        `${p.branches}% (≥${CORE_PACKAGE_THRESHOLDS.branches}%) | ${p.functions}% | ${p.fileCount} | ` +
        `${p.uncoveredLines} | ${p.passed ? 'PASS' : 'FAIL — ' + p.failures.join('; ')} |`,
    );
  }
  lines.push(
    `| **Project total** | ${project.lines}% (≥${PROJECT_THRESHOLDS.lines}%) | ` +
      `${project.branches}% (≥${PROJECT_THRESHOLDS.branches}%) | ${project.functions}% | — | — | ` +
      `${projectFailures.length === 0 ? 'PASS' : 'FAIL — ' + projectFailures.join('; ')} |`,
  );
  writeFileSync(join(OUT_DIR, 'coverage-summary.md'), lines.join('\n') + '\n');

  console.log('\nPer-package coverage:');
  for (const p of packages) {
    console.log(
      `  ${p.package.padEnd(32)} lines ${String(p.lines).padStart(6)}%  branches ${String(p.branches).padStart(6)}%  ${p.passed ? 'PASS' : 'FAIL: ' + p.failures.join('; ')}`,
    );
  }
  console.log(
    `  ${'project total'.padEnd(32)} lines ${String(project.lines).padStart(6)}%  branches ${String(project.branches).padStart(6)}%  ${projectFailures.length === 0 ? 'PASS' : 'FAIL'}`,
  );
  if (!passed) process.exit(1);
}

main();
