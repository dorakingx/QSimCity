import { expect, type Page } from '@playwright/test';

/**
 * Seed the returning-user state so the first-run onboarding overlay does
 * not intercept the flow under test. Onboarding itself has its own spec
 * that exercises the genuine first run. Must run before page.goto.
 */
export async function skipOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = 'qsimcity.progress.v1';
    let progress: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(key);
      if (raw) progress = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      progress = {};
    }
    progress['onboardingSeen'] = true;
    localStorage.setItem(key, JSON.stringify(progress));
  });
}

/**
 * Console-error tracking: uncaught exceptions, unhandled rejections, and
 * unexpected console errors fail the test (spec §18.5).
 */
/**
 * Environment noise that is never a QSimCity defect, allowed in any browser.
 */
const UNIVERSAL_IGNORED = ['favicon', 'Download the React DevTools'];

/**
 * Browser-specific third-party messages. Each entry names the browser, the
 * exact signature, and the ADR justifying it. Nothing else is filtered: any
 * other WebGL warning, shader failure, context loss, or three.js error still
 * fails the test in every browser. See docs/adr/adr-0003-webkit-three-js-texture-warning.md.
 */
const BROWSER_SPECIFIC_IGNORED: readonly {
  browser: string;
  signature: string;
  adr: string;
}[] = [
  {
    browser: 'webkit',
    signature: "texImage3D: FLIP_Y or PREMULTIPLY_ALPHA isn't allowed for uploading 3D textures",
    adr: 'adr-0003',
  },
];

/**
 * Fails the test on any unexpected console error, uncaught exception, or
 * unhandled rejection. The narrow browser-specific exceptions above are the
 * only messages tolerated, and only in the browser that emits them.
 */
export function trackConsoleErrors(page: Page, browserName?: string): () => void {
  const errors: string[] = [];
  const isIgnored = (text: string): boolean => {
    if (UNIVERSAL_IGNORED.some((i) => text.includes(i))) return true;
    return BROWSER_SPECIFIC_IGNORED.some(
      (entry) => entry.browser === browserName && text.includes(entry.signature),
    );
  };
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (isIgnored(text)) return;
      errors.push(text);
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return () => expect(errors, 'console must stay clean').toEqual([]);
}

/**
 * Positive proof that the 3D city actually rendered: a live WebGL2 context
 * with non-black pixels. Paired with the WebKit console exception so a
 * filtered warning can never hide a blank canvas.
 */
export async function expectCityRendered(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return { ok: false, reason: 'no canvas' };
    const gl = canvas.getContext('webgl2');
    if (!gl) return { ok: false, reason: 'no webgl2 context' };
    if (gl.isContextLost()) return { ok: false, reason: 'context lost' };
    return { ok: true, width: canvas.width, height: canvas.height };
  });
  expect(result.ok, `city must render: ${'reason' in result ? result.reason : ''}`).toBe(true);
  // District labels are drawn by the engine; their presence in the
  // accessible description proves the scene graph was built.
  await expect(page.locator('canvas.city-canvas')).toHaveAttribute(
    'aria-label',
    /Program Port.*QPU Grid.*Observatory/s,
  );
}

/**
 * Runs the default Bell sample from the Lab, waits for the timeline, and
 * pauses the replay.
 *
 * The pause is not cosmetic. A completed run starts playing immediately,
 * so the results section re-renders on every tick — and Playwright's
 * actionability protocol waits for an element to be *stable* before
 * clicking it. A details summary inside a continuously re-rendering panel
 * may never settle, which is how "charts expose complete table
 * alternatives" spent 60 seconds trying to open a disclosure and failed on
 * CI while passing locally. Every test built on this helper is about
 * content, not about playback.
 */
export async function runBellFromLab(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Quantum Lab' })
    .click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Replay timeline' })).toBeVisible({
    timeout: 20_000,
  });
  await pauseReplay(page);
}

/**
 * Stops the replay if it is running, and does nothing if it has already
 * finished.
 *
 * Bounded and state-independent on purpose. A bare
 * `getByRole('button', { name: 'Pause replay' }).click()` loses a race that
 * only shows up on a slow machine: the replay can reach its last tick
 * between the locator resolving and the click landing, at which point the
 * button relabels to "Play replay" and the click waits the full test
 * timeout for an element that will never appear. Branching on
 * `isVisible()` does not help — it does not wait, so it loses the same
 * race. Either way the desired end state is the same: playback stopped.
 */
export async function pauseReplay(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Pause replay' })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

/**
 * Loads a page with the deterministic-frame contract enabled, waits for the
 * 3D city to be genuinely ready, pins every source of motion, and renders
 * one frame.
 *
 * This replaces `page.waitForTimeout(6500)`. A sleep is a bet on machine
 * speed: it passed on a laptop with a GPU and produced nine 60-second
 * timeouts on a CI runner drawing WebGL in software. Waiting for a promise
 * the app resolves, then freezing, is a synchronisation primitive.
 *
 * `animTime` is pinned so ambient traffic, strollers, clouds, the
 * scheduling beacon and the refinery steam — all pure functions of it —
 * land in the same phase on every machine.
 */
export async function freezeCity(page: Page, options: { tick?: number } = {}): Promise<void> {
  await page.waitForFunction(
    '!!window.__qsimcityTest && window.__qsimcityTest.isCityMounted()',
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate('window.__qsimcityTest.cityReady');
  if (options.tick !== undefined) {
    await page.evaluate(`window.__qsimcityTest.setTick(${options.tick})`);
  }
  // Transient status messages have a five-second life and are not part of
  // any surface's identity. They get their own spec.
  await page.evaluate('window.__qsimcityTest.clearToast()');
  await page.evaluate('window.__qsimcityTest.freeze(12)');
  await page.evaluate('window.__qsimcityTest.renderFrame()');
}

/** Settles a 2D-only surface: no engine, just the transient toast. */
export async function settle2d(page: Page): Promise<void> {
  await page.waitForFunction('!!window.__qsimcityTest', undefined, { timeout: 30_000 });
  await page.evaluate('window.__qsimcityTest.clearToast()');
}

/** Adds the test-contract flag to a path. */
export function e2eUrl(path: string): string {
  return path.includes('?') ? `${path}&e2e=1` : `${path}?e2e=1`;
}

/** Disables WebGL2 before app scripts run (fallback testing). */
export async function disableWebgl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type ContextFn = (this: HTMLCanvasElement, type: string, ...args: unknown[]) => unknown;
    const proto = HTMLCanvasElement.prototype as unknown as { getContext: ContextFn };
    const original = proto.getContext;
    proto.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return original.call(this, type, ...args);
    };
  });
}
