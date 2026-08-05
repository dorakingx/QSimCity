import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionServer } from '../serve-production.js';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * WISER frame-rate benchmark (acceptance W7.1, W7.2).
 *
 * Drives the real production build in Chromium and measures frame times
 * with a requestAnimationFrame sampler. The scene under test is the full
 * semantic workload, not an idle city: the Bell sample is run first and
 * the replay is restarted before every segment, so the convoy, couriers,
 * pedestrians, logical banners, count stacks, and per-tick playback
 * derivations are all live while frames are sampled (adversarial
 * performance review finding — the previous version measured an empty
 * scene). Desktop runs at 1920x1080; the mobile pass emulates a
 * Pixel-class viewport with 4x CPU throttling.
 *
 * Honest-reporting notes, recorded in the envelope: the sampler is capped
 * by the host display scheduler (~120 Hz here), so medians at the cap mean
 * "at least cap fps", and both passes run on the host GPU — the mobile
 * pass emulates CPU slowness only, not mobile fill-rate. Thresholds are
 * fixed here, before any run.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'release-evidence', 'wiser-fps');

export const FPS_CRITERIA = {
  minDesktopMedianFps: 50,
  minMobileMedianFps: 30,
  /** CPU slowdown applied to the mobile emulation pass. */
  mobileCpuThrottle: 4,
  /** Sampling seconds per segment. */
  segmentSeconds: 5,
} as const;

// Evaluate bodies are passed as strings: tsx adds an esbuild __name helper
// to transpiled closures that does not exist inside the page context.
const SAMPLER_SNIPPET = `(() => {
  window.__fpsSamples = [];
  let last = performance.now();
  function loop() {
    const now = performance.now();
    window.__fpsSamples.push(now - last);
    last = now;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})()`;

const READ_SNIPPET = `(() => {
  const samples = window.__fpsSamples.slice();
  window.__fpsSamples.length = 0;
  return samples;
})()`;

async function startSampler(page: Page): Promise<void> {
  await page.evaluate(SAMPLER_SNIPPET);
}

async function readSamples(page: Page): Promise<number[]> {
  return (await page.evaluate(READ_SNIPPET)) as number[];
}

/** Frames worth keeping: warmup discarded, >1s pauses treated as artifacts. */
function cleanedFrameTimes(frameTimes: number[]): number[] {
  return frameTimes.slice(20).filter((t) => t > 0.1 && t < 1000);
}

function medianFps(frameTimes: number[]): number {
  const cleaned = cleanedFrameTimes(frameTimes);
  if (cleaned.length === 0) return 0;
  const sorted = [...cleaned].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return 1000 / median;
}

/** Median over every retained frame of a pass — no per-segment cherry-pick. */
function passMedianFps(allFrameTimes: number[][]): number {
  const cleaned = allFrameTimes.flatMap(cleanedFrameTimes);
  if (cleaned.length === 0) return 0;
  const sorted = [...cleaned].sort((a, b) => a - b);
  return 1000 / sorted[Math.floor(sorted.length / 2)]!;
}

async function waitForCity(page: Page): Promise<void> {
  await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
}

/**
 * Load the app with the Bell sample, run it, and land in Explore with the
 * replay ticking — the semantic workload the benchmark must include.
 */
async function loadWithReplay(page: Page, baseUrl: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('qsimcity.progress.v1', JSON.stringify({ onboardingSeen: true }));
  });
  await page.goto(`${baseUrl}/?view=lab&sample=bell`);
  await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('toolbar', { name: 'Replay timeline' }).waitFor({ timeout: 30000 });
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Explore' })
    .click();
  await waitForCity(page);
}

/** Rewind and replay so semantic motion spans the whole next segment. */
async function restartReplay(page: Page): Promise<void> {
  const scrubber = page.locator('.timeline-scrubber input').first();
  if (await scrubber.count()) {
    await scrubber.fill('0');
  }
  const play = page.getByRole('button', { name: 'Play replay' });
  if (await play.count()) {
    await play.click().catch(() => undefined);
  }
  const speed = page.locator('.timeline-speed select').first();
  if (await speed.count()) {
    await speed.selectOption('0.5').catch(() => undefined);
  }
}

interface SegmentResult {
  readonly name: string;
  readonly fps: number;
  readonly frames: number;
}

async function measureSegments(
  page: Page,
): Promise<{ segments: SegmentResult[]; allSamples: number[][] }> {
  const segments: SegmentResult[] = [];
  const allSamples: number[][] = [];
  const canvas = page.locator('canvas.city-canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Segment 1: overview with the replay running.
  await restartReplay(page);
  await startSampler(page);
  await page.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
  let samples = await readSamples(page);
  allSamples.push(samples);
  segments.push({ name: 'overview-replay', fps: medianFps(samples), frames: samples.length });

  // Segment 2: orbit drag over the replaying city.
  await restartReplay(page);
  await startSampler(page);
  const dragEnd = Date.now() + FPS_CRITERIA.segmentSeconds * 1000;
  while (Date.now() < dragEnd) {
    await page.mouse.move(cx - 200, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy, { steps: 24 });
    await page.mouse.up();
  }
  samples = await readSamples(page);
  allSamples.push(samples);
  segments.push({ name: 'orbit-drag-replay', fps: medianFps(samples), frames: samples.length });

  // Segment 3: street-level walking during the replay.
  await restartReplay(page);
  await page.keyboard.press('Digit4');
  await page.waitForTimeout(800);
  await startSampler(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
  await page.keyboard.up('KeyW');
  samples = await readSamples(page);
  allSamples.push(samples);
  segments.push({ name: 'street-walk-replay', fps: medianFps(samples), frames: samples.length });

  await page.keyboard.press('Digit1');
  return { segments, allSamples };
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
  let desktopSegments!: SegmentResult[];
  const mobileSegments: SegmentResult[] = [];
  let desktopMedian!: number;
  let mobileMedian!: number;
  let desktopDrawCalls!: number;
  let displayRefreshCapFps!: number;
  try {
    // Desktop pass: 1920x1080, replay running.
    const desktop = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      bypassCSP: true,
    });
    const desktopPage = await desktop.newPage();
    await loadWithReplay(desktopPage, baseUrl);
    const desktopRun = await measureSegments(desktopPage);
    desktopSegments = desktopRun.segments;
    desktopMedian = passMedianFps(desktopRun.allSamples);
    displayRefreshCapFps = Math.round(Math.max(...desktopRun.segments.map((s) => s.fps)));
    desktopDrawCalls = await desktopPage.evaluate(() => {
      const stats = (window as unknown as { __qsimcityStats?: () => { drawCalls: number } })
        .__qsimcityStats;
      return stats ? stats().drawCalls : 0;
    });
    await desktop.close();

    // Mobile emulation pass: Pixel-class viewport, CPU throttled, replay
    // running. Same segment shapes minus keyboard walking.
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
    const mobileAll: number[][] = [];
    await restartReplay(mobilePage);
    await startSampler(mobilePage);
    await mobilePage.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
    const staticSamples = await readSamples(mobilePage);
    mobileAll.push(staticSamples);
    mobileSegments.push({
      name: 'mobile-replay-static',
      fps: medianFps(staticSamples),
      frames: staticSamples.length,
    });
    await restartReplay(mobilePage);
    await startSampler(mobilePage);
    const canvas = mobilePage.locator('canvas.city-canvas');
    const box = (await canvas.boundingBox())!;
    const dragEnd = Date.now() + FPS_CRITERIA.segmentSeconds * 1000;
    while (Date.now() < dragEnd) {
      await mobilePage.mouse.move(box.x + 80, box.y + box.height / 2);
      await mobilePage.mouse.down();
      await mobilePage.mouse.move(box.x + box.width - 80, box.y + box.height / 2, { steps: 16 });
      await mobilePage.mouse.up();
    }
    const dragSamples = await readSamples(mobilePage);
    mobileAll.push(dragSamples);
    mobileSegments.push({
      name: 'mobile-replay-drag',
      fps: medianFps(dragSamples),
      frames: dragSamples.length,
    });
    mobileMedian = passMedianFps(mobileAll);
    await mobile.close();
  } finally {
    await browser.close();
    server.close();
  }

  const passed =
    desktopMedian >= FPS_CRITERIA.minDesktopMedianFps &&
    mobileMedian >= FPS_CRITERIA.minMobileMedianFps;

  writeEvidence(join(OUT_DIR, 'fps-report.json'), {
    tool: 'wiser-fps-benchmark',
    toolVersion: '2.0.0',
    command: 'pnpm wiser:fps',
    exitStatus: passed ? 0 : 1,
    inputHash: hashString(JSON.stringify(FPS_CRITERIA)),
    thresholds: {
      minDesktopMedianFps: FPS_CRITERIA.minDesktopMedianFps,
      minMobileMedianFps: FPS_CRITERIA.minMobileMedianFps,
    },
    measurements: {
      desktopMedianFps: Math.round(desktopMedian * 10) / 10,
      mobileMedianFps: Math.round(mobileMedian * 10) / 10,
      desktopDrawCalls,
      mobileCpuThrottle: FPS_CRITERIA.mobileCpuThrottle,
      segments: desktopSegments.length + mobileSegments.length,
    },
    passed,
    detail: {
      desktopSegments,
      mobileSegments,
      methodology: {
        workload:
          'Bell sample executed and replay restarted before every segment; convoy, couriers, pedestrians, banners, and count stacks live during sampling',
        medians: 'median over every retained frame of the pass, not the max of segment medians',
        displayRefreshCapFps,
        caveats: [
          'rAF sampling is capped by the host display scheduler; a median at the cap means "at least cap fps"',
          'both passes render on the host GPU; the mobile pass emulates CPU slowness (4x) but not mobile GPU fill-rate',
        ],
      },
    },
  });

  console.log(
    `Desktop median FPS: ${desktopMedian.toFixed(1)} (>= ${FPS_CRITERIA.minDesktopMedianFps})`,
  );
  console.log(
    `Mobile median FPS: ${mobileMedian.toFixed(1)} (>= ${FPS_CRITERIA.minMobileMedianFps})`,
  );
  for (const segment of [...desktopSegments, ...mobileSegments]) {
    console.log(`  ${segment.name}: ${segment.fps.toFixed(1)} fps over ${segment.frames} frames`);
  }
  if (!passed) {
    console.error('FPS benchmark FAILED its thresholds.');
    process.exit(1);
  }
  console.log('FPS benchmark passed.');
}

await main();
