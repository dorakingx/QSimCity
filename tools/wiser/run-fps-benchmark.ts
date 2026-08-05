import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionServer } from '../serve-production.js';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * WISER frame-rate benchmark (acceptance W7.1, W7.2).
 *
 * Drives the real production build in Chromium and measures frame times
 * with a requestAnimationFrame sampler across three representative
 * segments: static overview, orbit drag, and street-level walking. Desktop
 * runs at 1920x1080; the mobile pass emulates a Pixel-class viewport with
 * 4x CPU throttling. Thresholds are fixed here, before any run.
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

function medianFps(frameTimes: number[]): number {
  // Drop the first frames (compilation, texture upload) and any pauses
  // over a second (tab-hidden artifacts, not rendering performance).
  const cleaned = frameTimes.slice(20).filter((t) => t > 0.1 && t < 1000);
  if (cleaned.length === 0) return 0;
  const sorted = [...cleaned].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return 1000 / median;
}

async function waitForCity(page: Page): Promise<void> {
  await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
}

interface SegmentResult {
  readonly name: string;
  readonly fps: number;
  readonly frames: number;
}

async function measureSegments(page: Page): Promise<SegmentResult[]> {
  const results: SegmentResult[] = [];
  const canvas = page.locator('canvas.city-canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Segment 1: static overview.
  await startSampler(page);
  await page.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
  let samples = await readSamples(page);
  results.push({ name: 'overview-static', fps: medianFps(samples), frames: samples.length });

  // Segment 2: orbit drag, continuous rotation.
  await startSampler(page);
  const dragEnd = Date.now() + FPS_CRITERIA.segmentSeconds * 1000;
  while (Date.now() < dragEnd) {
    await page.mouse.move(cx - 200, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy, { steps: 24 });
    await page.mouse.up();
  }
  samples = await readSamples(page);
  results.push({ name: 'orbit-drag', fps: medianFps(samples), frames: samples.length });

  // Segment 3: street-level walking.
  await page.keyboard.press('Digit4');
  await page.waitForTimeout(800);
  await startSampler(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
  await page.keyboard.up('KeyW');
  samples = await readSamples(page);
  results.push({ name: 'street-walk', fps: medianFps(samples), frames: samples.length });

  await page.keyboard.press('Digit1');
  return results;
}

function overallMedian(segments: SegmentResult[]): number {
  const sorted = segments.map((s) => s.fps).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
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
  let desktopDrawCalls = 0;
  void desktopDrawCalls;
  try {
    // Desktop pass: 1920x1080.
    const desktop = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      bypassCSP: true,
    });
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(`${baseUrl}/?view=explore`);
    await waitForCity(desktopPage);
    desktopSegments.push(...(await measureSegments(desktopPage)));
    desktopDrawCalls = await desktopPage.evaluate(() => {
      const stats = (window as unknown as { __qsimcityStats?: () => { drawCalls: number } })
        .__qsimcityStats;
      return stats ? stats().drawCalls : 0;
    });
    await desktop.close();

    // Mobile emulation pass: Pixel-class viewport, CPU throttled.
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
    await mobilePage.goto(`${baseUrl}/?view=explore`);
    await waitForCity(mobilePage);
    // Mobile: static + a touch-drag orbit segment.
    await startSampler(mobilePage);
    await mobilePage.waitForTimeout(FPS_CRITERIA.segmentSeconds * 1000);
    const staticSamples = await readSamples(mobilePage);
    mobileSegments.push({
      name: 'mobile-static',
      fps: medianFps(staticSamples),
      frames: staticSamples.length,
    });
    await startSampler(mobilePage);
    const canvas = mobilePage.locator('canvas.city-canvas');
    const box = (await canvas.boundingBox())!;
    const dragEnd = Date.now() + FPS_CRITERIA.segmentSeconds * 1000;
    while (Date.now() < dragEnd) {
      await mobilePage.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await mobilePage.mouse.move(box.x + 80, box.y + box.height / 2);
      await mobilePage.mouse.down();
      await mobilePage.mouse.move(box.x + box.width - 80, box.y + box.height / 2, { steps: 16 });
      await mobilePage.mouse.up();
    }
    const dragSamples = await readSamples(mobilePage);
    mobileSegments.push({
      name: 'mobile-drag',
      fps: medianFps(dragSamples),
      frames: dragSamples.length,
    });
    await mobile.close();
  } finally {
    await browser.close();
    server.close();
  }

  const desktopMedian = overallMedian(desktopSegments);
  const mobileMedian = overallMedian(mobileSegments);
  const passed =
    desktopMedian >= FPS_CRITERIA.minDesktopMedianFps &&
    mobileMedian >= FPS_CRITERIA.minMobileMedianFps;

  writeEvidence(join(OUT_DIR, 'fps-report.json'), {
    tool: 'wiser-fps-benchmark',
    toolVersion: '1.0.0',
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
    detail: { desktopSegments, mobileSegments },
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
