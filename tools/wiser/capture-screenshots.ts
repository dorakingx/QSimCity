import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionServer } from '../serve-production.js';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * WISER screenshot evidence (acceptance W8.1).
 *
 * Captures the production build at 1920x1080 and a mobile viewport, for
 * day, golden hour, and night, at overview and street level — twelve
 * images minimum — and writes a manifest binding each file's SHA-256 to
 * the source tree. Reviews cite these files; the goal gate verifies they
 * exist and match the manifest.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'release-evidence', 'wiser-screenshots');

const TIMES = ['day', 'golden', 'night'] as const;

interface Shot {
  readonly file: string;
  readonly viewport: string;
  readonly timeOfDay: string;
  readonly view: string;
  readonly sha256: string;
}

async function settle(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}

async function waitForCity(page: Page): Promise<void> {
  await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 30000 });
  await settle(page, 3000);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function captureForViewport(
  context: BrowserContext,
  serverUrl: string,
  viewportName: string,
  shots: Shot[],
): Promise<void> {
  for (const time of TIMES) {
    const page = await context.newPage();
    await page.addInitScript((timeOfDay) => {
      localStorage.setItem(
        'qsimcity.settings.v1',
        JSON.stringify({ timeOfDay, quality: 'high', labels: true }),
      );
    }, time);
    await page.goto(`${serverUrl}/?view=explore`);
    await waitForCity(page);

    const overviewFile = join(OUT_DIR, `${viewportName}-${time}-overview.png`);
    await page.screenshot({ path: overviewFile });
    shots.push({
      file: overviewFile.slice(ROOT.length).replace(/^\//, ''),
      viewport: viewportName,
      timeOfDay: time,
      view: 'overview',
      sha256: sha256(overviewFile),
    });

    // Street level: walk mode, a few steps forward so the camera stands in
    // a street rather than at the mode-switch point.
    await page.keyboard.press('Digit4');
    await settle(page, 600);
    await page.keyboard.down('KeyW');
    await settle(page, 1200);
    await page.keyboard.up('KeyW');
    await settle(page, 700);
    const streetFile = join(OUT_DIR, `${viewportName}-${time}-street.png`);
    await page.screenshot({ path: streetFile });
    shots.push({
      file: streetFile.slice(ROOT.length).replace(/^\//, ''),
      viewport: viewportName,
      timeOfDay: time,
      view: 'street',
      sha256: sha256(streetFile),
    });
    await page.close();
  }
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
  const shots: Shot[] = [];
  try {
    const desktop = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      bypassCSP: true,
    });
    await captureForViewport(desktop, baseUrl, 'desktop', shots);
    await desktop.close();

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      bypassCSP: true,
    });
    await captureForViewport(mobile, baseUrl, 'mobile', shots);
    await mobile.close();
  } finally {
    await browser.close();
    server.close();
  }

  const passed = shots.length >= 12;
  writeFileSync(join(OUT_DIR, 'shots.json'), JSON.stringify(shots, null, 2));
  writeEvidence(join(OUT_DIR, 'manifest.json'), {
    tool: 'wiser-screenshots',
    toolVersion: '1.0.0',
    command: 'pnpm wiser:screens',
    exitStatus: passed ? 0 : 1,
    inputHash: hashString(TIMES.join(',')),
    thresholds: { minImages: 12 },
    measurements: {
      imageCount: shots.length,
      desktopImages: shots.filter((s) => s.viewport === 'desktop').length,
      mobileImages: shots.filter((s) => s.viewport === 'mobile').length,
      timesOfDay: TIMES.length,
    },
    passed,
    detail: { shots },
  });
  console.log(`Captured ${shots.length} screenshots into ${OUT_DIR}`);
  if (!passed) process.exit(1);
}

await main();
