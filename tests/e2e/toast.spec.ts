import { expect, test } from './fixtures.js';
import { pauseReplay, skipOnboarding } from './helpers.js';

/**
 * Transient status messages, tested on purpose and only here.
 *
 * They are suppressed in every other visual test: a five-second message is
 * not part of a surface's identity, and letting one into a baseline makes
 * that baseline depend on timing. The service worker's "ready to work
 * offline" notice had in fact been baked into the WebGL-fallback baseline.
 *
 * Suppressing them elsewhere is only honest if they are covered somewhere,
 * which is what this file is for — including the accessibility properties
 * that make a status message reach a screen-reader user at all.
 */
test.describe('transient status messages', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test('the status region is present and polite before any message exists', async ({ page }) => {
    await page.goto('/');
    // Mounted while idle, so assistive technology has observed the region
    // before its text changes. A region that appears already containing its
    // message is the unreliable pattern.
    const region = page.locator('[role="status"][aria-live="polite"]').first();
    await expect(region).toBeAttached();
  });

  test('a status message is announced and can be dismissed', async ({ page }) => {
    await page.goto('/');
    // Driven through the test hook rather than by racing a real run's
    // five-second transient. What is under test here is the status region
    // and its geometry, not the pipeline; that a completed run calls
    // showToast is covered by packages/ui/test/accessibility-behaviour.test.tsx.
    await page.waitForFunction('!!window.__qsimcityTest');
    await page.evaluate(
      'window.__qsimcityTest.showToast("Run finished: 8 operations on the compiled circuit.")',
    );
    const toast = page.locator('.toast').filter({ hasText: 'Run finished' });
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'Dismiss message' }).click();
    await expect(toast).toHaveCount(0);
  });

  test('a status message never covers the replay controls', async ({ page }) => {
    await page.goto('/?sample=bell&shots=64&seed=toast-overlap&device=linear-5');
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Accessible 2D' })
      .click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: 'Replay timeline' }).first()).toBeVisible({
      timeout: 30_000,
    });
    // Stop playback before measuring geometry: the dock re-renders on every
    // tick and Playwright waits for stability before reporting a box.
    await pauseReplay(page);

    await page.evaluate('window.__qsimcityTest.showToast("Run finished: geometry check.")');
    const toast = page.locator('.toast').filter({ hasText: 'geometry check' });
    await expect(toast).toBeVisible();

    // The soak caught this as a 30-second click failure: the toast sat on
    // top of the timeline dock and swallowed presses on Play and Step. A
    // status message must never block the thing it reports on.
    const toastBox = (await toast.boundingBox())!;
    const timelineBox = (await page
      .getByRole('toolbar', { name: 'Replay timeline' })
      .first()
      .boundingBox())!;
    const overlaps =
      toastBox.x < timelineBox.x + timelineBox.width &&
      toastBox.x + toastBox.width > timelineBox.x &&
      toastBox.y < timelineBox.y + timelineBox.height &&
      toastBox.y + toastBox.height > timelineBox.y;
    expect(overlaps, 'the status message overlaps the replay toolbar').toBe(false);

    // And even if it did overlap, it must not intercept pointer events.
    const pointerEvents = await toast.evaluate((n) => getComputedStyle(n).pointerEvents);
    expect(pointerEvents).toBe('none');
  });
});
