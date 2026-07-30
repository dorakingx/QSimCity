import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { createProductionServer } from '../serve-production.js';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * Lighthouse audits against the production build (spec §19).
 *
 * The build is served by the same production-equivalent server used for the
 * deployment smoke tests, so routing, headers, and caching match what Vercel
 * will serve. Each target is measured three times and the median is scored,
 * because single Lighthouse runs are noisy.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'release-evidence', 'lighthouse');
const RUNS_PER_TARGET = 3;

export const THRESHOLDS = {
  accessibility: 100,
  'best-practices': 95,
  seo: 90,
  performanceDesktop: 85,
  performanceMobile: 75,
} as const;

interface TargetSpec {
  readonly id: string;
  readonly path: string;
  readonly formFactor: 'desktop' | 'mobile';
  readonly label: string;
}

const TARGETS: readonly TargetSpec[] = [
  { id: 'home-desktop', path: '/', formFactor: 'desktop', label: 'Main entry (desktop)' },
  { id: 'home-mobile', path: '/', formFactor: 'mobile', label: 'Main entry (mobile)' },
  {
    id: 'accessible2d-desktop',
    path: '/?sample=bell&view=accessible-2d',
    formFactor: 'desktop',
    label: 'Accessible 2D Mode (desktop)',
  },
  {
    id: 'accessible2d-mobile',
    path: '/?sample=bell&view=accessible-2d',
    formFactor: 'mobile',
    label: 'Accessible 2D Mode (mobile)',
  },
];

const DESKTOP_CONFIG = {
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'desktop' as const,
    screenEmulation: {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleFactor: 1,
      disabled: false,
    },
    throttling: {
      rttMs: 40,
      throughputKbps: 10 * 1024,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    },
  },
};

const MOBILE_CONFIG = { extends: 'lighthouse:default', settings: { formFactor: 'mobile' as const } };

interface RunScores {
  performance: number;
  accessibility: number;
  'best-practices': number;
  seo: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

async function auditTarget(baseUrl: string, target: TargetSpec, port: number): Promise<{
  scores: RunScores;
  runs: RunScores[];
  audits: Record<string, { score: number | null; title: string }>;
}> {
  const runs: RunScores[] = [];
  let lastAudits: Record<string, { score: number | null; title: string }> = {};
  for (let i = 0; i < RUNS_PER_TARGET; i++) {
    const result = await lighthouse(
      `${baseUrl}${target.path}`,
      { port, output: 'json', logLevel: 'error' },
      target.formFactor === 'desktop' ? DESKTOP_CONFIG : MOBILE_CONFIG,
    );
    if (!result) throw new Error(`Lighthouse returned no result for ${target.id}`);
    const cats = result.lhr.categories;
    runs.push({
      performance: Math.round((cats['performance']?.score ?? 0) * 100),
      accessibility: Math.round((cats['accessibility']?.score ?? 0) * 100),
      'best-practices': Math.round((cats['best-practices']?.score ?? 0) * 100),
      seo: Math.round((cats['seo']?.score ?? 0) * 100),
    });
    lastAudits = Object.fromEntries(
      Object.entries(result.lhr.audits)
        .filter(([, a]) => a.score !== null && a.score < 1)
        .map(([k, a]) => [k, { score: a.score, title: a.title }]),
    );
    writeFileSync(
      join(OUT_DIR, `${target.id}-run${i + 1}.json`),
      JSON.stringify(result.lhr, null, 2),
    );
  }
  return {
    scores: {
      performance: median(runs.map((r) => r.performance)),
      accessibility: median(runs.map((r) => r.accessibility)),
      'best-practices': median(runs.map((r) => r['best-practices'])),
      seo: median(runs.map((r) => r.seo)),
    },
    runs,
    audits: lastAudits,
  };
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = createProductionServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const serverPort = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://localhost:${serverPort}`;

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });

  const results: Record<
    string,
    { label: string; formFactor: string; scores: RunScores; runs: RunScores[]; failures: string[] }
  > = {};
  let allPassed = true;

  try {
    for (const target of TARGETS) {
      console.log(`Auditing ${target.label} (${RUNS_PER_TARGET} runs)…`);
      const { scores, runs, audits } = await auditTarget(baseUrl, target, chrome.port);
      const perfThreshold =
        target.formFactor === 'desktop' ? THRESHOLDS.performanceDesktop : THRESHOLDS.performanceMobile;
      const failures: string[] = [];
      if (scores.accessibility < THRESHOLDS.accessibility) {
        failures.push(`accessibility ${scores.accessibility} < ${THRESHOLDS.accessibility}`);
      }
      if (scores['best-practices'] < THRESHOLDS['best-practices']) {
        failures.push(`best-practices ${scores['best-practices']} < ${THRESHOLDS['best-practices']}`);
      }
      if (scores.seo < THRESHOLDS.seo) failures.push(`seo ${scores.seo} < ${THRESHOLDS.seo}`);
      if (scores.performance < perfThreshold) {
        failures.push(`performance ${scores.performance} < ${perfThreshold}`);
      }
      if (failures.length > 0) {
        allPassed = false;
        console.log(`  FAIL: ${failures.join('; ')}`);
        for (const [id, a] of Object.entries(audits).slice(0, 8)) {
          console.log(`    audit ${id}: ${a.title} (score ${a.score})`);
        }
      } else {
        console.log(
          `  PASS: perf ${scores.performance}, a11y ${scores.accessibility}, ` +
            `bp ${scores['best-practices']}, seo ${scores.seo}`,
        );
      }
      results[target.id] = {
        label: target.label,
        formFactor: target.formFactor,
        scores,
        runs,
        failures,
      };
    }
  } finally {
    await chrome.kill();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const measurements: Record<string, number> = {};
  for (const [id, r] of Object.entries(results)) {
    measurements[`${id}.performance`] = r.scores.performance;
    measurements[`${id}.accessibility`] = r.scores.accessibility;
    measurements[`${id}.bestPractices`] = r.scores['best-practices'];
    measurements[`${id}.seo`] = r.scores.seo;
  }

  writeEvidence('release-evidence/lighthouse/lighthouse-report.json', {
    tool: 'lighthouse',
    toolVersion: '13.4.1',
    command: 'pnpm lighthouse',
    exitStatus: allPassed ? 0 : 1,
    inputHash: hashString(JSON.stringify(TARGETS) + JSON.stringify(THRESHOLDS)),
    thresholds: {
      accessibility: THRESHOLDS.accessibility,
      bestPractices: THRESHOLDS['best-practices'],
      seo: THRESHOLDS.seo,
      performanceDesktop: THRESHOLDS.performanceDesktop,
      performanceMobile: THRESHOLDS.performanceMobile,
      runsPerTarget: RUNS_PER_TARGET,
    },
    measurements,
    passed: allPassed,
    detail: results,
  });

  const lines = ['# Lighthouse Audit Summary', ''];
  lines.push('Median of three runs per target against the production build served with the');
  lines.push('deployment headers, routing, and caching from `vercel.json`.', '');
  lines.push('| Target | Performance | Accessibility | Best Practices | SEO | Result |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of Object.values(results)) {
    const perfThreshold =
      r.formFactor === 'desktop' ? THRESHOLDS.performanceDesktop : THRESHOLDS.performanceMobile;
    lines.push(
      `| ${r.label} | ${r.scores.performance} (≥${perfThreshold}) | ${r.scores.accessibility} (≥100) | ` +
        `${r.scores['best-practices']} (≥95) | ${r.scores.seo} (≥90) | ${r.failures.length === 0 ? 'PASS' : 'FAIL — ' + r.failures.join('; ')} |`,
    );
  }
  writeFileSync(join(OUT_DIR, 'lighthouse-summary.md'), lines.join('\n') + '\n');

  console.log(`\nLighthouse ${allPassed ? 'PASSED' : 'FAILED'}`);
  if (!allPassed) process.exit(1);
}

void main();
