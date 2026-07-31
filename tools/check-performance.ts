import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { hashString, writeEvidence } from './evidence.js';
import { join } from 'node:path';

/**
 * Performance budget check (spec §19): measures the compressed JavaScript a
 * first visit must download. The 3D engine and the editor are lazily loaded,
 * so they are excluded from the initial-load budget but reported separately.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'apps', 'web', 'dist');
const ASSETS = join(DIST, 'assets');

/** Initial compressed JavaScript budget for the first paint path. */
export const INITIAL_JS_GZIP_BUDGET = 320 * 1024;
/** Total compressed JavaScript budget including lazily loaded chunks. */
export const TOTAL_JS_GZIP_BUDGET = 600 * 1024;

export interface PerformanceReport {
  readonly initialJsGzipBytes: number;
  readonly totalJsGzipBytes: number;
  readonly budgetGzipBytes: number;
  readonly totalBudgetGzipBytes: number;
  readonly lazyChunks: { name: string; gzipBytes: number }[];
  readonly eagerChunks: { name: string; gzipBytes: number }[];
  readonly passed: boolean;
  readonly generatedAt: string;
}

function gzipSize(path: string): number {
  return gzipSync(readFileSync(path)).length;
}

export function measure(): PerformanceReport {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const eagerNames = new Set<string>();
  for (const match of html.matchAll(/\/assets\/([A-Za-z0-9._-]+\.js)/g)) {
    eagerNames.add(match[1]!);
  }
  // Follow static imports from the entry chunks: anything the entry pulls in
  // synchronously is part of the initial load.
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of [...eagerNames]) {
      const content = readFileSync(join(ASSETS, name), 'utf8');
      for (const m of content.matchAll(/from"\.\/([A-Za-z0-9._-]+\.js)"/g)) {
        if (!eagerNames.has(m[1]!)) {
          eagerNames.add(m[1]!);
          changed = true;
        }
      }
      for (const m of content.matchAll(/import"\.\/([A-Za-z0-9._-]+\.js)"/g)) {
        if (!eagerNames.has(m[1]!)) {
          eagerNames.add(m[1]!);
          changed = true;
        }
      }
    }
  }

  const allJs = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
  const eagerChunks = [...eagerNames]
    .filter((n) => allJs.includes(n))
    .map((name) => ({ name, gzipBytes: gzipSize(join(ASSETS, name)) }))
    .sort((a, b) => b.gzipBytes - a.gzipBytes);
  const lazyChunks = allJs
    .filter((n) => !eagerNames.has(n))
    .map((name) => ({ name, gzipBytes: gzipSize(join(ASSETS, name)) }))
    .sort((a, b) => b.gzipBytes - a.gzipBytes);

  const initialJsGzipBytes = eagerChunks.reduce((a, c) => a + c.gzipBytes, 0);
  const totalJsGzipBytes = initialJsGzipBytes + lazyChunks.reduce((a, c) => a + c.gzipBytes, 0);

  return {
    initialJsGzipBytes,
    totalJsGzipBytes,
    budgetGzipBytes: INITIAL_JS_GZIP_BUDGET,
    totalBudgetGzipBytes: TOTAL_JS_GZIP_BUDGET,
    lazyChunks,
    eagerChunks,
    passed:
      initialJsGzipBytes <= INITIAL_JS_GZIP_BUDGET && totalJsGzipBytes <= TOTAL_JS_GZIP_BUDGET,
    generatedAt: new Date().toISOString(),
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) {
  const report = measure();
  console.log('Initial-load JavaScript (gzip):');
  for (const c of report.eagerChunks)
    console.log(`  ${c.name.padEnd(44)} ${(c.gzipBytes / 1024).toFixed(1)} KiB`);
  console.log(
    `  TOTAL ${(report.initialJsGzipBytes / 1024).toFixed(1)} KiB (budget ${(INITIAL_JS_GZIP_BUDGET / 1024).toFixed(0)} KiB)`,
  );
  console.log('Lazily loaded chunks (gzip):');
  for (const c of report.lazyChunks)
    console.log(`  ${c.name.padEnd(44)} ${(c.gzipBytes / 1024).toFixed(1)} KiB`);
  console.log(
    `  TOTAL ALL JS ${(report.totalJsGzipBytes / 1024).toFixed(1)} KiB (budget ${(TOTAL_JS_GZIP_BUDGET / 1024).toFixed(0)} KiB)`,
  );
  writeEvidence('release-evidence/performance.json', {
    tool: 'qsimcity-performance-budget',
    toolVersion: '1.0.0',
    command: 'pnpm check:perf',
    exitStatus: report.passed ? 0 : 1,
    inputHash: hashString(
      [...report.eagerChunks, ...report.lazyChunks]
        .map((c) => `${c.name}:${c.gzipBytes}`)
        .join('\n'),
    ),
    thresholds: {
      initialJsGzipBytes: INITIAL_JS_GZIP_BUDGET,
      totalJsGzipBytes: TOTAL_JS_GZIP_BUDGET,
    },
    measurements: {
      initialJsGzipBytes: report.initialJsGzipBytes,
      totalJsGzipBytes: report.totalJsGzipBytes,
      eagerChunks: report.eagerChunks.length,
      lazyChunks: report.lazyChunks.length,
    },
    passed: report.passed,
    detail: report,
  });
  if (!report.passed) {
    console.error('Performance budget exceeded.');
    process.exit(1);
  }
  console.log('Performance budgets pass.');
  void statSync;
}
