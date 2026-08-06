import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionServer } from '../serve-production.js';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * Fixed-count 3D/2D remount safety gate.
 *
 * A ten-minute soak drives a mixed workload and can only say "nothing blew
 * up in nine cycles". That is not proof that mounting and unmounting the
 * WebGL city is safe: the interesting failure — a disposed engine still
 * retained by its canvas, so every visit leaks a whole city — needs a
 * deterministic, fixed-count experiment with limits fixed in advance.
 *
 * This tool switches Explore <-> Accessible 2D a fixed number of times,
 * forcing garbage collection between cycles, and records:
 *
 * - the post-GC heap after each cycle, and the growth of the trailing
 *   cycles against the first settled cycle;
 * - the per-cycle mount latency, measured IN THE PAGE from a trusted input
 *   event to the incoming view appearing, and separately the latency the
 *   driver observes, because the driver's actionability protocol costs far
 *   more than the app does and conflating them hides the real number;
 * - live WebGL context count, so a context leak is caught even when the JS
 *   heap looks flat.
 *
 * Pass criteria are fixed here, before any run, and must not be relaxed to
 * accommodate an observed failure.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'release-evidence', 'remount');

export const REMOUNT_CRITERIA = {
  /** Mount/unmount pairs to perform. */
  cycles: 25,
  /** Cycles ignored while first-visit caches settle. */
  warmupCycles: 5,
  /**
   * Post-GC heap of the trailing cycles versus the first settled cycle. A
   * retained engine shows up here immediately: one leaked city is tens of
   * megabytes, so anything approaching this bound is a real leak.
   */
  maxHeapGrowthRatio: 1.25,
  /** Absolute backstop independent of the ratio. */
  maxHeapGrowthBytes: 24 * 1024 * 1024,
  /** In-page mount latency: what a user actually waits for. */
  maxMountLatencyMs: 1500,
  /** Live WebGL contexts must not accumulate across cycles. */
  maxLiveContexts: 4,
} as const;

const ARM_SNIPPET = `(() => {
  window.__remountStart = performance.now();
  window.__remountMs = null;
  const target = () => document.querySelector(SELECTOR);
  if (target()) { window.__remountMs = 0; return; }
  const observer = new MutationObserver(() => {
    if (!target()) return;
    observer.disconnect();
    window.__remountMs = Math.round(performance.now() - window.__remountStart);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})()`;

/** Count live WebGL contexts by probing how many more can be created. */
const CONTEXT_PROBE = `(() => {
  const live = [];
  for (let i = 0; i < 32; i++) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) break;
    live.push(gl);
  }
  const spare = live.length;
  for (const gl of live) {
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  }
  return spare;
})()`;

async function gcHeap(page: Page): Promise<number> {
  await page.evaluate('window.gc && window.gc()');
  await page.waitForTimeout(250);
  await page.evaluate('window.gc && window.gc()');
  return Number(await page.evaluate('performance.memory.usedJSHeapSize'));
}

/**
 * Poll a page value with plain evaluates. `waitForFunction` compiles its
 * predicate with eval, which the production CSP rightly forbids, and this
 * gate is meant to run against the real shipped headers.
 */
async function waitForNumber(page: Page, expression: string, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await page.evaluate(expression);
    if (typeof value === 'number') return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${expression}`);
    await page.waitForTimeout(25);
  }
}

async function armAndClick(page: Page, buttonName: string, selector: string): Promise<number> {
  const button = page.getByRole('navigation', { name: 'Modes' }).getByRole('button', {
    name: buttonName,
  });
  const box = await button.boundingBox({ timeout: 15_000 });
  if (!box) throw new Error(`mode button not laid out: ${buttonName}`);
  await page.evaluate(ARM_SNIPPET.replace('SELECTOR', JSON.stringify(selector)));
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return waitForNumber(page, 'window.__remountMs', 20_000);
}

interface CycleSample {
  readonly cycle: number;
  readonly heapBytes: number;
  readonly mountMs: number;
  readonly unmountMs: number;
  readonly driverMs: number;
  readonly spareContexts: number;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = createProductionServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const browser = await chromium.launch({
    args: [
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--js-flags=--expose-gc',
      '--enable-precise-memory-info',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon') || text.includes('Download the React DevTools')) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await page.addInitScript(() => {
    localStorage.setItem('qsimcity.progress.v1', JSON.stringify({ onboardingSeen: true }));
  });
  await page.goto(`http://localhost:${port}`);
  await page.getByRole('navigation', { name: 'Modes' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);

  const samples: CycleSample[] = [];
  let crashed = false;
  try {
    for (let cycle = 1; cycle <= REMOUNT_CRITERIA.cycles; cycle++) {
      const driverStart = Date.now();
      // Into the 3D city.
      const mountMs = await armAndClick(page, 'Explore', 'canvas.city-canvas');
      await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(500);
      // Back out to the DOM-only view.
      const unmountMs = await armAndClick(page, 'Accessible 2D', 'textarea');
      const driverMs = Date.now() - driverStart;
      await page.waitForTimeout(250);
      const heapBytes = await gcHeap(page);
      const spareContexts = Number(await page.evaluate(CONTEXT_PROBE));
      samples.push({ cycle, heapBytes, mountMs, unmountMs, driverMs, spareContexts });
      if (cycle % 5 === 0) {
        console.log(
          `  cycle ${cycle}: heap ${(heapBytes / 1048576).toFixed(1)} MiB, ` +
            `mount ${mountMs} ms, unmount ${unmountMs} ms`,
        );
      }
    }
  } catch (error) {
    crashed = true;
    console.error(`Remount run aborted: ${String(error)}`);
  }

  await context.close();
  await browser.close();
  server.close();

  const settled = samples.slice(REMOUNT_CRITERIA.warmupCycles);
  const baseline = settled[0]?.heapBytes ?? 0;
  const trailing = settled.slice(-5);
  const trailingMean =
    trailing.length > 0 ? trailing.reduce((sum, s) => sum + s.heapBytes, 0) / trailing.length : 0;
  const growthRatio = baseline > 0 ? trailingMean / baseline : 0;
  const growthBytes = Math.round(trailingMean - baseline);
  const worstMountMs = Math.max(0, ...samples.map((s) => Math.max(s.mountMs, s.unmountMs)));
  const worstDriverMs = Math.max(0, ...samples.map((s) => s.driverMs));
  // Fewer spare contexts over time means ours are not being released.
  const firstSpare = settled[0]?.spareContexts ?? 0;
  const lastSpare = settled[settled.length - 1]?.spareContexts ?? 0;
  const leakedContexts = Math.max(0, firstSpare - lastSpare);

  const passed =
    !crashed &&
    samples.length === REMOUNT_CRITERIA.cycles &&
    consoleErrors.length === 0 &&
    growthRatio <= REMOUNT_CRITERIA.maxHeapGrowthRatio &&
    growthBytes <= REMOUNT_CRITERIA.maxHeapGrowthBytes &&
    worstMountMs <= REMOUNT_CRITERIA.maxMountLatencyMs &&
    leakedContexts <= REMOUNT_CRITERIA.maxLiveContexts;

  writeEvidence(join(OUT_DIR, 'remount-report.json'), {
    tool: 'remount-safety',
    toolVersion: '1.0.0',
    command: 'pnpm remount:check',
    exitStatus: passed ? 0 : 1,
    inputHash: hashString(JSON.stringify(REMOUNT_CRITERIA)),
    thresholds: {
      cycles: REMOUNT_CRITERIA.cycles,
      maxHeapGrowthRatio: REMOUNT_CRITERIA.maxHeapGrowthRatio,
      maxHeapGrowthBytes: REMOUNT_CRITERIA.maxHeapGrowthBytes,
      maxMountLatencyMs: REMOUNT_CRITERIA.maxMountLatencyMs,
      maxLiveContexts: REMOUNT_CRITERIA.maxLiveContexts,
    },
    measurements: {
      cyclesCompleted: samples.length,
      settledBaselineHeapBytes: baseline,
      trailingMeanHeapBytes: Math.round(trailingMean),
      heapGrowthRatio: Math.round(growthRatio * 10000) / 10000,
      heapGrowthBytes: growthBytes,
      worstMountLatencyMs: worstMountMs,
      worstDriverObservedCycleMs: worstDriverMs,
      leakedWebglContexts: leakedContexts,
      consoleErrors: consoleErrors.length,
      crashed,
    },
    passed,
    detail: {
      samples,
      consoleErrors: consoleErrors.slice(0, 10),
      latencyNote:
        'worstMountLatencyMs is measured in the page from a trusted click to the incoming view appearing — what a user waits for. worstDriverObservedCycleMs is the whole cycle as the Playwright driver observes it, including its actionability protocol, which is far more expensive than the application and is reported only for transparency.',
    },
  });

  console.log(
    `Remount: ${samples.length} cycles, heap growth ratio ${growthRatio.toFixed(3)} ` +
      `(${(growthBytes / 1048576).toFixed(1)} MiB), worst in-page mount ${worstMountMs} ms, ` +
      `leaked contexts ${leakedContexts}, console errors ${consoleErrors.length}`,
  );
  if (!passed) {
    console.error('Remount safety FAILED its thresholds.');
    process.exit(1);
  }
  console.log('Remount safety PASSED.');
}

await main();
