import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionServer } from '../serve-production.js';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * WISER frame-rate benchmark (acceptance W7.1, W7.2).
 *
 * Measures frame-time distributions of the real production build while the
 * full semantic workload runs: the Bell sample is executed and the replay
 * restarted before every segment, so the convoy, couriers, pedestrians,
 * strollers, logical banners, and count stacks are all live.
 *
 * Honesty rules this tool enforces on itself:
 *
 * - It reports frame-time percentiles (p50/p95/p99), the worst frame, and
 *   counts of long (>50 ms) and dropped (>2x the display interval) frames.
 *   A single median hides exactly the stutter a learner notices.
 * - It measures the display's own refresh interval on an idle page first,
 *   and marks any segment whose p50 sits within 15% of that interval as
 *   `refreshCapped`. A capped result proves "at least this fast" and
 *   nothing more; it is never presented as headroom.
 * - It records the environment every number depends on: browser build,
 *   renderer and vendor strings from WEBGL_debug_renderer_info, viewport,
 *   device pixel ratio, quality preset, warm-up discarded, and whether the
 *   pass is device emulation.
 * - The mobile pass is Chromium device emulation with CPU throttling on a
 *   desktop GPU. It is labelled `emulated: true` everywhere and must never
 *   be described as real-device performance.
 * - Two supplementary passes exist so the capped figures are not the only
 *   evidence: a 6x CPU-throttled pass, and an uncapped pass in a browser
 *   launched with vsync and the frame-rate limiter disabled, which is the
 *   only way to observe the renderer's true throughput ceiling.
 *
 * Thresholds are fixed here, before any run, and are not relaxed to
 * accommodate an observed result.
 *
 * The gate scores the UNCAPPED pass. That is not a detail. Every capped
 * segment on this host reads p50 8.3 ms / 120.5 fps, and so does a blank
 * document measured through the same sampler — a criterion satisfied
 * identically by an empty page cannot distinguish a 3D city from nothing,
 * so scoring the capped figures was scoring the display. The capped
 * desktop and mobile segments are still recorded and still carry floors
 * (a capped pass that falls *below* its floor is a real regression), but
 * the number with information in it is the vsync-disabled ceiling, and it
 * is the one that decides the verdict.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'release-evidence', 'wiser-fps');

export const FPS_CRITERIA = {
  minDesktopMedianFps: 50,
  minMobileMedianFps: 30,
  /** p95 frame time must stay inside a comfortable interactive budget. */
  maxDesktopP95Ms: 33,
  maxMobileP95Ms: 50,
  /** CPU slowdown applied to the emulated mobile pass. */
  mobileCpuThrottle: 4,
  /**
   * CPU slowdown applied to the stress pass. Run with vsync disabled, so
   * main-thread cost is observable: at the display cap a 6x-throttled run
   * reported p50 8.3 ms, identical to the unthrottled one, and therefore
   * demonstrated the absence of the phenomenon it exists to show.
   */
  stressCpuThrottle: 6,
  /**
   * Uncapped desktop throughput with vsync and the frame-rate limiter off.
   * This is the criterion with discriminating power: it is the renderer's
   * own ceiling, not the monitor's.
   */
  minUncappedDesktopMedianFps: 120,
  maxUncappedDesktopP95Ms: 12,
  /** Uncapped throughput under a 6x CPU slowdown. */
  minStressedMedianFps: 30,
  /** Sampling seconds per segment. */
  segmentSeconds: 5,
  /** Frames discarded at the start of each segment (compile, upload). */
  warmupFrames: 20,
  /** A frame this long is a visible hitch. */
  longFrameMs: 50,
} as const;

// Evaluate bodies are passed as strings: tsx adds an esbuild __name helper
// to transpiled closures that does not exist inside the page context.
const SAMPLER_SNIPPET = `(() => {
  // Cancel any previous loop. Overwriting the handle without cancelling
  // left one extra rAF loop running per segment, all pushing into the same
  // array: segment N reported N times as many samples as it observed
  // frames, so 'frames', the warm-up slice and every absolute count
  // (longFrames, droppedFrames) were inflated by the segment index, and the
  // aggregate weighted later segments several times more heavily.
  if (window.__fpsHandle) cancelAnimationFrame(window.__fpsHandle);
  window.__fpsSamples = [];
  let last = performance.now();
  function loop() {
    const now = performance.now();
    window.__fpsSamples.push(now - last);
    last = now;
    window.__fpsHandle = requestAnimationFrame(loop);
  }
  window.__fpsHandle = requestAnimationFrame(loop);
})()`;

const READ_SNIPPET = `(() => {
  const samples = window.__fpsSamples.slice();
  window.__fpsSamples.length = 0;
  return samples;
})()`;

/** Idle refresh interval: rAF cadence on a blank page, nothing rendering. */
const REFRESH_SNIPPET = `(() => new Promise((resolve) => {
  const times = [];
  let last = performance.now();
  function loop() {
    const now = performance.now();
    times.push(now - last);
    last = now;
    if (times.length < 90) requestAnimationFrame(loop);
    else {
      const kept = times.slice(20).sort((a, b) => a - b);
      resolve(kept[Math.floor(kept.length / 2)]);
    }
  }
  requestAnimationFrame(loop);
}))()`;

const ENVIRONMENT_SNIPPET = `(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  let renderer = 'unavailable';
  let vendor = 'unavailable';
  if (gl) {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) {
      renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      vendor = String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL));
    }
  }
  return {
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    hardwareConcurrency: navigator.hardwareConcurrency,
    webglRenderer: renderer,
    webglVendor: vendor,
  };
})()`;

interface Distribution {
  readonly frames: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly worstMs: number;
  readonly medianFps: number;
  readonly longFrames: number;
  readonly droppedFrames: number;
  /** Samples removed as tab artifacts (>= 1 s), reported so the filter is visible. */
  readonly discardedSamples: number;
}

interface SegmentResult extends Distribution {
  readonly name: string;
  readonly refreshCapped: boolean;
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[index]!;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Frames worth keeping: warm-up discarded, and intervals over a second
 * dropped as tab artifacts (a backgrounded or throttled tab stops issuing
 * rAF entirely, which is not a rendering result). How many were dropped is
 * reported, because a censoring rule whose firing you cannot see is not a
 * defensible one in a tool whose thesis is that a single median hides the
 * stutter a learner notices.
 */
const TAB_ARTIFACT_MS = 1000;

function cleanedFrameTimes(frameTimes: readonly number[]): {
  kept: number[];
  discarded: number;
} {
  const afterWarmup = frameTimes.slice(FPS_CRITERIA.warmupFrames);
  const kept = afterWarmup.filter((t) => t > 0.1 && t < TAB_ARTIFACT_MS);
  return { kept, discarded: afterWarmup.length - kept.length };
}

function describe(frameTimes: readonly number[], refreshMs: number): Distribution {
  const { kept: cleaned, discarded } = cleanedFrameTimes(frameTimes);
  if (cleaned.length === 0) {
    return {
      frames: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      worstMs: 0,
      medianFps: 0,
      longFrames: 0,
      droppedFrames: 0,
      discardedSamples: discarded,
    };
  }
  const sorted = [...cleaned].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  return {
    frames: cleaned.length,
    p50Ms: round(p50),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    worstMs: round(sorted[sorted.length - 1]!),
    medianFps: round(1000 / p50),
    longFrames: cleaned.filter((t) => t > FPS_CRITERIA.longFrameMs).length,
    // A frame that took more than two display intervals dropped at least one.
    droppedFrames: cleaned.filter((t) => t > refreshMs * 2).length,
    discardedSamples: discarded,
  };
}

async function startSampler(page: Page): Promise<void> {
  await page.evaluate(SAMPLER_SNIPPET);
}

async function stopSampler(page: Page): Promise<void> {
  await page.evaluate(
    `(() => { if (window.__fpsHandle) { cancelAnimationFrame(window.__fpsHandle); window.__fpsHandle = 0; } })()`,
  );
}

async function readSamples(page: Page): Promise<number[]> {
  return (await page.evaluate(READ_SNIPPET)) as number[];
}

async function waitForCity(page: Page): Promise<void> {
  await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 40_000 });
  await page.waitForTimeout(2500);
}

/** Load with the Bell sample run and land in Explore with the replay live. */
async function loadWithReplay(page: Page, baseUrl: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('qsimcity.progress.v1', JSON.stringify({ onboardingSeen: true }));
  });
  await page.goto(`${baseUrl}/?view=lab&sample=bell`);
  await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 40_000 });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('toolbar', { name: 'Replay timeline' }).waitFor({ timeout: 40_000 });
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Explore' })
    .click();
  await waitForCity(page);
}

/** Rewind and replay so semantic motion spans the whole next segment. */
async function restartReplay(page: Page): Promise<void> {
  const scrubber = page.locator('.timeline-scrubber input').first();
  if (await scrubber.count()) await scrubber.fill('0');
  const play = page.getByRole('button', { name: 'Play replay' });
  if (await play.count()) await play.click().catch(() => undefined);
  const speed = page.locator('.timeline-speed select').first();
  if (await speed.count()) await speed.selectOption('0.5').catch(() => undefined);
}

/** Measure the display's rAF interval with nothing of ours rendering. */
async function measureRefreshMs(browser: Browser, baseUrl: string): Promise<number> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?view=home`);
  await page.waitForTimeout(800);
  const refresh = Number(await page.evaluate(REFRESH_SNIPPET));
  await context.close();
  return refresh > 0.5 ? refresh : 16.7;
}

async function sampleSegment(
  page: Page,
  name: string,
  refreshMs: number,
  drive: () => Promise<void>,
  /** Set for passes that deliberately escape the display cadence. */
  forceUncapped = false,
): Promise<{ segment: SegmentResult; raw: number[] }> {
  await restartReplay(page);
  await startSampler(page);
  await drive();
  await stopSampler(page);
  const raw = await readSamples(page);
  const distribution = describe(raw, refreshMs);
  return {
    segment: {
      name,
      ...distribution,
      // Within 15% of the display interval means the sampler, not the
      // renderer, set the pace: the true ceiling is unknown and higher.
      refreshCapped:
        !forceUncapped && distribution.p50Ms > 0 && distribution.p50Ms <= refreshMs * 1.15,
    },
    raw,
  };
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = createProductionServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://localhost:${port}`;
  const browser = await chromium.launch({
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
  });

  const desktopSegments: SegmentResult[] = [];
  const mobileSegments: SegmentResult[] = [];
  const stressSegments: SegmentResult[] = [];
  const uncappedSegments: SegmentResult[] = [];
  const desktopRaw: number[][] = [];
  const mobileRaw: number[][] = [];
  let desktopEnvironment!: unknown;
  let mobileEnvironment!: unknown;
  let desktopDrawCalls!: number;
  let desktopTriangles!: number;
  let refreshMs!: number;

  try {
    refreshMs = await measureRefreshMs(browser, baseUrl);

    // ------------------------------------------------ desktop, real GPU
    const desktop = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      bypassCSP: true,
    });
    const desktopPage = await desktop.newPage();
    await loadWithReplay(desktopPage, baseUrl);
    desktopEnvironment = await desktopPage.evaluate(ENVIRONMENT_SNIPPET);

    const canvas = desktopPage.locator('canvas.city-canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    for (const [name, drive] of [
      [
        'overview-replay',
        async (): Promise<void> => {
          await desktopPage.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
        },
      ],
      [
        'orbit-drag-replay',
        async (): Promise<void> => {
          const until = Date.now() + FPS_CRITERIA.segmentSeconds * 1000;
          while (Date.now() < until) {
            await desktopPage.mouse.move(cx - 200, cy);
            await desktopPage.mouse.down();
            await desktopPage.mouse.move(cx + 200, cy, { steps: 24 });
            await desktopPage.mouse.up();
          }
        },
      ],
      [
        'street-walk-replay',
        async (): Promise<void> => {
          await desktopPage.keyboard.press('Digit4');
          await desktopPage.waitForTimeout(700);
          await desktopPage.keyboard.down('KeyW');
          await desktopPage.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
          await desktopPage.keyboard.up('KeyW');
        },
      ],
    ] as const) {
      const { segment, raw } = await sampleSegment(desktopPage, name, refreshMs, drive);
      desktopSegments.push(segment);
      desktopRaw.push(raw);
    }
    await desktopPage.keyboard.press('Digit1');

    const stats = (await desktopPage.evaluate(`(() => {
      const read = window.__qsimcityStats;
      return read ? read() : { drawCalls: 0, triangles: 0 };
    })()`)) as { drawCalls: number; triangles: number };
    desktopDrawCalls = stats.drawCalls;
    desktopTriangles = stats.triangles;

    await desktop.close();

    // ------------------------------- emulated mobile: NOT a real device
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      bypassCSP: true,
    });
    const mobilePage = await mobile.newPage();
    const session = await mobile.newCDPSession(mobilePage);
    await session.send('Emulation.setCPUThrottlingRate', {
      rate: FPS_CRITERIA.mobileCpuThrottle,
    });
    await loadWithReplay(mobilePage, baseUrl);
    mobileEnvironment = await mobilePage.evaluate(ENVIRONMENT_SNIPPET);

    const mobileBox = (await mobilePage.locator('canvas.city-canvas').boundingBox())!;
    for (const [name, drive] of [
      [
        'mobile-replay-static',
        async (): Promise<void> => {
          await mobilePage.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
        },
      ],
      [
        'mobile-replay-drag',
        async (): Promise<void> => {
          const until = Date.now() + FPS_CRITERIA.segmentSeconds * 1000;
          while (Date.now() < until) {
            await mobilePage.mouse.move(mobileBox.x + 80, mobileBox.y + mobileBox.height / 2);
            await mobilePage.mouse.down();
            await mobilePage.mouse.move(
              mobileBox.x + mobileBox.width - 80,
              mobileBox.y + mobileBox.height / 2,
              { steps: 16 },
            );
            await mobilePage.mouse.up();
          }
        },
      ],
    ] as const) {
      const { segment, raw } = await sampleSegment(mobilePage, name, refreshMs, drive);
      mobileSegments.push(segment);
      mobileRaw.push(raw);
    }
    await mobile.close();

    // ---------------- uncapped: vsync off, so rAF is not the pacer at all
    const uncapped = await chromium.launch({
      args: [
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        '--enable-webgl',
        '--disable-gpu-vsync',
        '--disable-frame-rate-limit',
      ],
    });
    try {
      const uncappedContext = await uncapped.newContext({
        viewport: { width: 1920, height: 1080 },
        bypassCSP: true,
      });
      const uncappedPage = await uncappedContext.newPage();
      await loadWithReplay(uncappedPage, baseUrl);
      const result = await sampleSegment(
        uncappedPage,
        'desktop-overview-vsync-disabled',
        // Dropped frames stay defined against the real display interval;
        // the pass is flagged uncapped explicitly rather than by threshold.
        refreshMs,
        async () => {
          await uncappedPage.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
        },
        true,
      );
      uncappedSegments.push(result.segment);

      // The stress pass belongs here, not on the vsync-capped browser: at
      // the display cap a 6x-throttled run reported the same p50 as an
      // unthrottled one, so it demonstrated nothing. With vsync off, the
      // main thread's cost is what the frame time is made of.
      const stressSession = await uncappedContext.newCDPSession(uncappedPage);
      await stressSession.send('Emulation.setCPUThrottlingRate', {
        rate: FPS_CRITERIA.stressCpuThrottle,
      });
      const stress = await sampleSegment(
        uncappedPage,
        `desktop-cpu-throttled-${FPS_CRITERIA.stressCpuThrottle}x-vsync-disabled`,
        refreshMs,
        async () => {
          await uncappedPage.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
        },
        true,
      );
      stressSegments.push(stress.segment);
      await stressSession.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    } finally {
      await uncapped.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const desktop = describe(desktopRaw.flat(), refreshMs);
  const mobile = describe(mobileRaw.flat(), refreshMs);
  const uncappedDesktop = uncappedSegments[0];
  const stressed = stressSegments[0];
  const passed =
    // The criteria with discriminating power: the renderer's own ceiling
    // with vsync off, and its behaviour with the main thread starved.
    uncappedDesktop !== undefined &&
    uncappedDesktop.medianFps >= FPS_CRITERIA.minUncappedDesktopMedianFps &&
    uncappedDesktop.p95Ms <= FPS_CRITERIA.maxUncappedDesktopP95Ms &&
    stressed !== undefined &&
    stressed.medianFps >= FPS_CRITERIA.minStressedMedianFps &&
    // Floors on the capped passes. These cannot prove headroom — a blank
    // page satisfies them identically — but a capped pass that falls below
    // its own display cap is a genuine regression, so they stay.
    desktop.medianFps >= FPS_CRITERIA.minDesktopMedianFps &&
    mobile.medianFps >= FPS_CRITERIA.minMobileMedianFps &&
    desktop.p95Ms <= FPS_CRITERIA.maxDesktopP95Ms &&
    mobile.p95Ms <= FPS_CRITERIA.maxMobileP95Ms;

  const desktopCapped = desktopSegments.every((s) => s.refreshCapped);
  const mobileCapped = mobileSegments.every((s) => s.refreshCapped);

  writeEvidence(join(OUT_DIR, 'fps-report.json'), {
    tool: 'wiser-fps-benchmark',
    toolVersion: '4.0.0',
    command: 'pnpm wiser:fps',
    exitStatus: passed ? 0 : 1,
    inputHash: hashString(JSON.stringify(FPS_CRITERIA)),
    thresholds: {
      minDesktopMedianFps: FPS_CRITERIA.minDesktopMedianFps,
      minMobileMedianFps: FPS_CRITERIA.minMobileMedianFps,
      maxDesktopP95Ms: FPS_CRITERIA.maxDesktopP95Ms,
      maxMobileP95Ms: FPS_CRITERIA.maxMobileP95Ms,
      minUncappedDesktopMedianFps: FPS_CRITERIA.minUncappedDesktopMedianFps,
      maxUncappedDesktopP95Ms: FPS_CRITERIA.maxUncappedDesktopP95Ms,
      minStressedMedianFps: FPS_CRITERIA.minStressedMedianFps,
    },
    measurements: {
      desktopMedianFps: desktop.medianFps,
      desktopP50Ms: desktop.p50Ms,
      desktopP95Ms: desktop.p95Ms,
      desktopP99Ms: desktop.p99Ms,
      desktopWorstFrameMs: desktop.worstMs,
      desktopLongFrames: desktop.longFrames,
      desktopDroppedFrames: desktop.droppedFrames,
      desktopRefreshCapped: desktopCapped,
      mobileEmulatedMedianFps: mobile.medianFps,
      mobileEmulatedP50Ms: mobile.p50Ms,
      mobileEmulatedP95Ms: mobile.p95Ms,
      mobileEmulatedP99Ms: mobile.p99Ms,
      mobileEmulatedWorstFrameMs: mobile.worstMs,
      mobileEmulatedLongFrames: mobile.longFrames,
      mobileEmulatedDroppedFrames: mobile.droppedFrames,
      mobileEmulatedRefreshCapped: mobileCapped,
      displayRefreshIntervalMs: round(refreshMs),
      desktopDrawCalls,
      desktopTriangles,
      mobileCpuThrottle: FPS_CRITERIA.mobileCpuThrottle,
      segments:
        desktopSegments.length +
        mobileSegments.length +
        stressSegments.length +
        uncappedSegments.length,
      uncappedDesktopMedianFps: uncappedSegments[0]?.medianFps ?? 0,
      uncappedDesktopP95Ms: uncappedSegments[0]?.p95Ms ?? 0,
    },
    passed,
    detail: {
      desktopSegments,
      mobileSegments,
      stressSegments,
      uncappedSegments,
      environment: {
        desktop: desktopEnvironment,
        mobileEmulated: mobileEnvironment,
        qualityPreset: 'high (application default)',
        warmupFramesDiscarded: FPS_CRITERIA.warmupFrames,
      },
      interpretation: {
        desktop: desktopCapped
          ? 'Every desktop segment sat at the display refresh interval. The desktop figure is a floor ("at least this fast"), not a ceiling; true headroom is unmeasured on this display.'
          : 'Desktop segments ran below the display refresh interval, so the figures reflect renderer cost rather than the sampler cadence.',
        mobile:
          'Chromium device emulation at 390x844 with DPR 2 and a 4x CPU throttle, rendering on the host GPU. This is NOT real-device performance: it constrains CPU only, and a real phone GPU has far less fill rate.',
        stress: `A supplementary ${FPS_CRITERIA.stressCpuThrottle}x CPU-throttled desktop pass is recorded to show behaviour when the main thread is starved.`,
        uncapped:
          'A final pass runs in a browser launched with --disable-gpu-vsync and --disable-frame-rate-limit, so requestAnimationFrame is not paced by the display. This is the only figure here that measures the renderer ceiling rather than the display cadence.',
      },
    },
  });

  const show = (label: string, d: Distribution, capped: boolean): void => {
    console.log(
      `${label}: p50 ${d.p50Ms} ms (${d.medianFps} fps), p95 ${d.p95Ms} ms, p99 ${d.p99Ms} ms, ` +
        `worst ${d.worstMs} ms, long ${d.longFrames}, dropped ${d.droppedFrames}` +
        `${capped ? ' [refresh-capped: a floor, not a ceiling]' : ''}`,
    );
  };
  console.log(`Display refresh interval: ${round(refreshMs)} ms`);
  show('Desktop (GPU)         ', desktop, desktopCapped);
  show('Mobile (EMULATED, 4x) ', mobile, mobileCapped);
  for (const segment of [...stressSegments, ...uncappedSegments]) {
    console.log(
      `${segment.name}: p50 ${segment.p50Ms} ms (${segment.medianFps} fps), p95 ${segment.p95Ms} ms, ` +
        `long ${segment.longFrames}, dropped ${segment.droppedFrames}`,
    );
  }
  if (!passed) {
    console.error('FPS benchmark FAILED its thresholds.');
    process.exit(1);
  }
  console.log('FPS benchmark passed.');
}

await main();
