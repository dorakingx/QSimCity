import { expect, test } from '@playwright/test';
import {
  e2eUrl,
  expectCityRendered,
  freezeCity,
  skipOnboarding,
  trackConsoleErrors,
} from './helpers.js';

/**
 * The 3D city, tested where 3D can actually be tested.
 *
 * These are the only specs that require a live WebGL2 context. They run
 * serially in the dedicated `city` / `city-mobile` projects so a GPU-less
 * CI runner drawing through SwiftShader pays that cost once at a time
 * rather than in parallel with everything else.
 *
 * The functional projects deliberately run without WebGL (see
 * tests/e2e/fixtures.ts). This file is what keeps that split honest: if the
 * 3D path broke entirely, the positive render test below would fail.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

test.describe('desktop city', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop city project');

  test('the 3D city renders a live WebGL2 scene', async ({ page, browserName }) => {
    const assertClean = trackConsoleErrors(page, browserName);
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await freezeCity(page);
    // Positive proof: a live, unlost WebGL2 context whose scene graph was
    // built, not merely a canvas element in the DOM.
    await expectCityRendered(page);
    assertClean();
  });

  test('the guided tour walks chapters with the city mounted', async ({ page, browserName }) => {
    const assertClean = trackConsoleErrors(page, browserName);
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Guided Tour' })
      .click();
    const tour = page.locator('.tour-overlay');
    await expect(tour).toBeVisible({ timeout: 30_000 });
    await freezeCity(page);
    await expect(tour.getByRole('heading', { name: 'Quantum Program Port' })).toBeVisible();
    await tour.getByRole('button', { name: 'Next →' }).click();
    await expect(tour.getByText('Chapter 2 of 16')).toBeVisible();
    await tour.getByRole('button', { name: '← Previous' }).click();
    await expect(tour.getByText('Chapter 1 of 16')).toBeVisible();
    await tour.getByRole('button', { name: 'Exit tour' }).click();
    await expect(tour).not.toBeVisible();
    // A filtered browser warning must never mask a blank canvas.
    await expectCityRendered(page);
    assertClean();
  });
});

test.describe('mobile city', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile city project');

  test('the 3D city loads and accepts touch input', async ({ page, browserName }) => {
    const assertClean = trackConsoleErrors(page, browserName);
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .tap();
    const canvas = page.locator('.city-canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await freezeCity(page);
    const box = (await canvas.boundingBox())!;
    // One-finger tap must not crash the app or scroll the document.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expectCityRendered(page);

    // Touch walk controls belong to the 3D city, so they are verified here
    // rather than in the WebGL-free functional mobile project.
    await page.getByRole('button', { name: /^Walk/ }).tap();
    await expect(page.getByRole('application', { name: /Movement pad/ })).toBeVisible();
    assertClean();
  });

  /**
   * The floating controls must not cover each other on a phone.
   *
   * This was a real defect that no visual baseline could have caught: the
   * only mobile screenshots are portrait *2D*, where the dock is in normal
   * flow, and landscape, which is wide enough that the phone rules never
   * apply. Portrait 3D — the common case — went unphotographed, and the
   * Scenarios button sat inside the playback dock, half-covered by the
   * speed row.
   *
   * A geometry assertion is the right shape for this rather than another
   * baseline: it states the contract, it cannot be satisfied by a stale
   * image, and it does not need a per-platform reference to compare with.
   */
  test('the floating controls do not cover each other in portrait', async ({ page }) => {
    // The playback dock only exists once a run has produced a trace, which
    // is also the only state in which the overlap could be seen. Explore
    // has no Run control on a phone, so the run starts in the lab — the
    // same route the screenshot evidence takes.
    await page.goto(e2eUrl('/?view=lab&sample=bell'));
    await page.getByRole('button', { name: 'Run', exact: true }).tap();
    await expect(page.getByRole('toolbar', { name: 'Replay timeline' }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .tap();
    await expect(page.locator('.city-canvas')).toBeVisible({ timeout: 30_000 });
    await freezeCity(page);

    const overlaps = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
      const dock = rect('.scenario-dock');
      const playback = rect('.timeline-dock');
      const pad = rect('.touch-joystick');
      const hit = (a?: DOMRect, b?: DOMRect) =>
        !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        found: !!dock && !!playback,
        scenariosOverPlayback: hit(dock, playback),
        padOverPlayback: hit(pad, playback),
        // Wholly on screen, not merely non-overlapping off the edge.
        dockOnScreen: !!dock && dock.top >= 0 && dock.bottom <= window.innerHeight,
      };
    });

    expect(overlaps.found, 'the Scenarios dock and playback dock must both exist').toBe(true);
    expect(overlaps.scenariosOverPlayback, 'Scenarios overlaps the playback dock').toBe(false);
    expect(overlaps.padOverPlayback, 'the movement pad overlaps the playback dock').toBe(false);
    expect(overlaps.dockOnScreen, 'the Scenarios dock is off screen').toBe(true);
  });
});
