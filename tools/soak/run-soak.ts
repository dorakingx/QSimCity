import { chromium, type ConsoleMessage, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionServer } from '../serve-production.js';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * Ten-minute production soak test (spec §19).
 *
 * Runs the real production build behind a server that applies the deployment
 * headers and routing, then drives the application continuously: scenarios
 * (including the variational loop), playback, seeking, noise changes,
 * 3D/2D switching, and camera modes. It records JS heap samples, console
 * errors, exceptions, failed requests, WebGL context loss, and interaction
 * latency, and fails on crashes, hangs, unrecovered context loss, or
 * sustained unbounded memory growth.
 *
 * Pass criteria are fixed here, before any run, and must not be relaxed to
 * accommodate an observed failure.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'release-evidence', 'soak');

export const SOAK_CRITERIA = {
  /** Minimum wall-clock duration of the driven workload. */
  minDurationSeconds: 600,
  /** No uncaught exceptions, unhandled rejections, or page crashes. */
  maxUncaughtErrors: 0,
  /** No unexpected console errors (the known WebKit note does not apply to Chromium). */
  maxConsoleErrors: 0,
  /** No WebGL context loss that is not recovered. */
  maxUnrecoveredContextLoss: 0,
  /**
   * Heap growth is compared between the post-warm-up baseline and the final
   * quarter of the run. A steady-state application may fluctuate with GC, so
   * the bound is on sustained growth of the trailing minimum (which GC
   * returns to), not on peak usage.
   */
  maxTrailingMinGrowthRatio: 1.5,
  /** The UI must still respond within this budget at the end of the run. */
  maxFinalInteractionMs: 3000,
  /** Warm-up excluded from growth analysis. */
  warmupSeconds: 60,
} as const;

interface HeapSample {
  readonly elapsedSeconds: number;
  readonly usedJsHeapBytes: number;
  readonly totalJsHeapBytes: number;
  readonly cycle: number;
}

interface ConsoleEvent {
  readonly elapsedSeconds: number;
  readonly type: string;
  readonly text: string;
}

const IGNORED_CONSOLE = ['favicon', 'Download the React DevTools'];

async function readHeap(page: Page): Promise<{ used: number; total: number } | null> {
  return page.evaluate(() => {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
    };
    if (!perf.memory) return null;
    return { used: perf.memory.usedJSHeapSize, total: perf.memory.totalJSHeapSize };
  });
}

/** One full workload cycle exercising the product's real behavior. */
async function runCycle(page: Page, cycle: number): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Modes' });

  // 1. Quantum Lab: run a circuit end to end.
  await nav.getByRole('button', { name: 'Quantum Lab' }).click();
  await page.getByRole('button', { name: 'Run', exact: true }).first().click();
  await page
    .getByRole('toolbar', { name: 'Replay timeline' })
    .waitFor({ state: 'visible', timeout: 30_000 });

  // 2. Playback: pause, seek, step, change speed, resume.
  await page.getByRole('button', { name: 'Pause replay' }).click();
  const scrubber = page.locator('.timeline-scrubber input').first();
  await scrubber.fill('3');
  await page.getByRole('button', { name: 'Step forward one tick' }).click();
  await page.locator('.timeline-speed select').first().selectOption('2');
  await page.getByRole('button', { name: 'Play replay' }).click();
  await page.waitForTimeout(400);

  // 3. Camera modes (3D only).
  const walkButton = page.getByRole('button', { name: /^Walk/ });
  if (await walkButton.count()) {
    await walkButton.click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Top-down/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Orbit/ }).click();
  }

  // 4. Noise change, then rerun so the change propagates through the pipeline.
  const noiseToggle = page.getByLabel(/Enable noise model/).first();
  if (await noiseToggle.count()) {
    await noiseToggle.check();
    const readout = page.getByLabel(/Readout error/).first();
    if (await readout.count()) {
      await readout.fill(cycle % 2 === 0 ? '0.05' : '0.12');
    }
    await page.getByRole('button', { name: 'Run', exact: true }).first().click();
    await page.waitForTimeout(600);
    await noiseToggle.uncheck();
  }

  // 5. Accessible 2D Mode: the whole workflow without WebGL.
  await nav.getByRole('button', { name: 'Accessible 2D' }).click();
  await page
    .getByRole('group', { name: /Measured counts|Ideal vs noisy/ })
    .first()
    .waitFor({
      state: 'visible',
      timeout: 30_000,
    });

  // 6. Compare Mode.
  await nav.getByRole('button', { name: 'Compare' }).click();
  await page.waitForTimeout(300);

  // 7. A scenario, alternating with the variational loop.
  await nav.getByRole('button', { name: 'Explore' }).click();
  const scenarioButton = page.getByRole('button', { name: /^Scenarios/ });
  if (await scenarioButton.count()) {
    await scenarioButton.click();
    const target =
      cycle % 3 === 0
        ? 'Variational Gridlock'
        : cycle % 3 === 1
          ? 'SWAP Storm'
          : 'Decoherence Weather';
    const entry = page.getByRole('button', { name: new RegExp(target) }).first();
    if (await entry.count()) {
      await entry.click();
      await page.waitForTimeout(target === 'Variational Gridlock' ? 4000 : 1500);
    }
  }

  // 8. Guided Tour navigation.
  await nav.getByRole('button', { name: 'Guided Tour' }).click();
  const next = page.locator('.tour-overlay').getByRole('button', { name: 'Next →' });
  if (await next.count()) {
    await next.click();
    await page.waitForTimeout(250);
  }
}

async function main(): Promise<void> {
  const durationSeconds = Number(process.env['SOAK_SECONDS'] ?? SOAK_CRITERIA.minDurationSeconds);
  mkdirSync(OUT_DIR, { recursive: true });

  const server = createProductionServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://localhost:${port}`;

  const browser = await chromium.launch({
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const started = Date.now();
  const elapsed = (): number => (Date.now() - started) / 1000;
  const heapSamples: HeapSample[] = [];
  const consoleEvents: ConsoleEvent[] = [];
  const uncaught: ConsoleEvent[] = [];
  const failedRequests: ConsoleEvent[] = [];
  let contextLossEvents = 0;
  let contextRestoreEvents = 0;
  let crashed = false;

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((i) => text.includes(i))) return;
    consoleEvents.push({ elapsedSeconds: elapsed(), type: 'console.error', text });
  });
  page.on('pageerror', (error) => {
    uncaught.push({ elapsedSeconds: elapsed(), type: 'pageerror', text: error.message });
  });
  page.on('crash', () => {
    crashed = true;
    uncaught.push({ elapsedSeconds: elapsed(), type: 'crash', text: 'page crashed' });
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? 'unknown';
    if (failure.includes('ERR_ABORTED')) return; // navigation cancellations
    failedRequests.push({
      elapsedSeconds: elapsed(),
      type: 'requestfailed',
      text: `${req.url()}: ${failure}`,
    });
  });

  // The soak models a returning user: onboarding must not intercept the
  // driver's clicks (first-run onboarding has its own E2E coverage).
  await page.addInitScript(() => {
    localStorage.setItem('qsimcity.progress.v1', JSON.stringify({ onboardingSeen: true }));
  });
  await page.goto(baseUrl);
  await page.addInitScript(() => {
    window.addEventListener(
      'webglcontextlost',
      () =>
        ((window as unknown as { __ctxLost: number }).__ctxLost =
          ((window as unknown as { __ctxLost?: number }).__ctxLost ?? 0) + 1),
      true,
    );
    window.addEventListener(
      'webglcontextrestored',
      () =>
        ((window as unknown as { __ctxRestored: number }).__ctxRestored =
          ((window as unknown as { __ctxRestored?: number }).__ctxRestored ?? 0) + 1),
      true,
    );
  });

  let cycle = 0;
  let lastError: Error | null = null;
  console.log(`Soak: driving the production build for ${durationSeconds}s…`);

  while (elapsed() < durationSeconds && !crashed) {
    cycle++;
    try {
      await runCycle(page, cycle);
    } catch (e) {
      lastError = e as Error;
      uncaught.push({
        elapsedSeconds: elapsed(),
        type: 'workload-error',
        text: (e as Error).message,
      });
      break;
    }
    const heap = await readHeap(page);
    if (heap) {
      heapSamples.push({
        elapsedSeconds: Number(elapsed().toFixed(1)),
        usedJsHeapBytes: heap.used,
        totalJsHeapBytes: heap.total,
        cycle,
      });
    }
    const counters = await page.evaluate(() => ({
      lost: (window as unknown as { __ctxLost?: number }).__ctxLost ?? 0,
      restored: (window as unknown as { __ctxRestored?: number }).__ctxRestored ?? 0,
    }));
    contextLossEvents = counters.lost;
    contextRestoreEvents = counters.restored;
    if (cycle % 5 === 0) {
      console.log(
        `  ${elapsed().toFixed(0)}s — cycle ${cycle}, heap ${
          heap ? (heap.used / 1048576).toFixed(1) + ' MiB' : 'n/a'
        }`,
      );
    }
  }

  const actualDuration = elapsed();

  // Final responsiveness probe: the UI must still react promptly.
  let finalInteractionMs = Number.POSITIVE_INFINITY;
  if (!crashed) {
    const t0 = Date.now();
    try {
      await page
        .getByRole('navigation', { name: 'Modes' })
        .getByRole('button', { name: 'Accessible 2D' })
        .click({ timeout: SOAK_CRITERIA.maxFinalInteractionMs });
      await page
        .getByLabel(/OpenQASM 2.0 program/)
        .first()
        .waitFor({
          state: 'visible',
          timeout: SOAK_CRITERIA.maxFinalInteractionMs,
        });
      finalInteractionMs = Date.now() - t0;
    } catch {
      finalInteractionMs = Number.POSITIVE_INFINITY;
    }
  }

  await context.close();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // Memory analysis: compare the trailing minimum against the post-warm-up
  // minimum. GC returns a healthy application to a stable floor; a leak
  // raises that floor monotonically.
  const postWarmup = heapSamples.filter((s) => s.elapsedSeconds >= SOAK_CRITERIA.warmupSeconds);
  const analysisSamples = postWarmup.length >= 4 ? postWarmup : heapSamples;
  const quarter = Math.max(1, Math.floor(analysisSamples.length / 4));
  const baselineWindow = analysisSamples.slice(0, quarter);
  const trailingWindow = analysisSamples.slice(-quarter);
  const minOf = (xs: HeapSample[]): number =>
    xs.length > 0 ? Math.min(...xs.map((s) => s.usedJsHeapBytes)) : 0;
  const baselineMin = minOf(baselineWindow);
  const trailingMin = minOf(trailingWindow);
  const growthRatio = baselineMin > 0 ? trailingMin / baselineMin : 1;

  const unrecoveredContextLoss = Math.max(0, contextLossEvents - contextRestoreEvents);
  const totalUncaught = uncaught.length;
  const totalConsoleErrors = consoleEvents.length;

  const passed =
    !crashed &&
    lastError === null &&
    actualDuration >= SOAK_CRITERIA.minDurationSeconds &&
    totalUncaught <= SOAK_CRITERIA.maxUncaughtErrors &&
    totalConsoleErrors <= SOAK_CRITERIA.maxConsoleErrors &&
    unrecoveredContextLoss <= SOAK_CRITERIA.maxUnrecoveredContextLoss &&
    failedRequests.length === 0 &&
    growthRatio <= SOAK_CRITERIA.maxTrailingMinGrowthRatio &&
    finalInteractionMs <= SOAK_CRITERIA.maxFinalInteractionMs;

  writeFileSync(
    join(OUT_DIR, 'heap-samples.csv'),
    'elapsed_seconds,cycle,used_js_heap_bytes,total_js_heap_bytes\n' +
      heapSamples
        .map((s) => `${s.elapsedSeconds},${s.cycle},${s.usedJsHeapBytes},${s.totalJsHeapBytes}`)
        .join('\n') +
      '\n',
  );
  writeFileSync(
    join(OUT_DIR, 'console-events.json'),
    JSON.stringify({ consoleErrors: consoleEvents, uncaught, failedRequests }, null, 2) + '\n',
  );

  const envelope = writeEvidence('release-evidence/soak/soak-report.json', {
    tool: 'qsimcity-soak',
    toolVersion: '1.0.0',
    command: 'pnpm soak',
    exitStatus: passed ? 0 : 1,
    inputHash: hashString(`${durationSeconds}:${JSON.stringify(SOAK_CRITERIA)}`),
    thresholds: {
      minDurationSeconds: SOAK_CRITERIA.minDurationSeconds,
      maxUncaughtErrors: SOAK_CRITERIA.maxUncaughtErrors,
      maxConsoleErrors: SOAK_CRITERIA.maxConsoleErrors,
      maxUnrecoveredContextLoss: SOAK_CRITERIA.maxUnrecoveredContextLoss,
      maxTrailingMinGrowthRatio: SOAK_CRITERIA.maxTrailingMinGrowthRatio,
      maxFinalInteractionMs: SOAK_CRITERIA.maxFinalInteractionMs,
    },
    measurements: {
      durationSeconds: Number(actualDuration.toFixed(1)),
      cycles: cycle,
      heapSampleCount: heapSamples.length,
      baselineMinHeapBytes: baselineMin,
      trailingMinHeapBytes: trailingMin,
      trailingMinGrowthRatio: Number(growthRatio.toFixed(4)),
      uncaughtErrors: totalUncaught,
      consoleErrors: totalConsoleErrors,
      failedRequests: failedRequests.length,
      contextLossEvents,
      contextRestoreEvents,
      unrecoveredContextLoss,
      finalInteractionMs: Number.isFinite(finalInteractionMs) ? finalInteractionMs : -1,
      crashed,
    },
    passed,
    detail: {
      workloadError: lastError?.message ?? null,
      heapSamples,
    },
  });

  writeFileSync(
    join(OUT_DIR, 'soak-summary.md'),
    `# Soak Test Summary\n\n` +
      `- Commit: \`${envelope.commitSha}\`\n` +
      `- Generated: ${envelope.generatedAt}\n` +
      `- Duration: **${actualDuration.toFixed(1)}s** (minimum ${SOAK_CRITERIA.minDurationSeconds}s)\n` +
      `- Workload cycles: **${cycle}**\n` +
      `- Heap samples: ${heapSamples.length}\n` +
      `- Post-warm-up baseline minimum heap: ${(baselineMin / 1048576).toFixed(1)} MiB\n` +
      `- Trailing minimum heap: ${(trailingMin / 1048576).toFixed(1)} MiB\n` +
      `- Trailing-minimum growth ratio: **${growthRatio.toFixed(3)}** (limit ${SOAK_CRITERIA.maxTrailingMinGrowthRatio})\n` +
      `- Uncaught errors: ${totalUncaught}\n` +
      `- Console errors: ${totalConsoleErrors}\n` +
      `- Failed requests: ${failedRequests.length}\n` +
      `- WebGL context loss / restore: ${contextLossEvents} / ${contextRestoreEvents}\n` +
      `- Final interaction latency: ${Number.isFinite(finalInteractionMs) ? finalInteractionMs + ' ms' : 'unresponsive'}` +
      ` (limit ${SOAK_CRITERIA.maxFinalInteractionMs} ms)\n` +
      `- Crashed: ${crashed}\n\n` +
      `Result: **${passed ? 'PASS' : 'FAIL'}**\n\n` +
      `Pass criteria were fixed before the run in \`tools/soak/run-soak.ts\` and were not\n` +
      `adjusted afterwards. Raw samples are in \`heap-samples.csv\`; all console and\n` +
      `error events are in \`console-events.json\`.\n`,
  );

  console.log(
    `\nSoak ${passed ? 'PASSED' : 'FAILED'}: ${actualDuration.toFixed(1)}s, ${cycle} cycles, ` +
      `growth ratio ${growthRatio.toFixed(3)}, ${totalUncaught} uncaught, ${totalConsoleErrors} console errors`,
  );
  if (!passed) {
    if (lastError) console.error(`Workload error: ${lastError.message}`);
    process.exit(1);
  }
}

void main();
