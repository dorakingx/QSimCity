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

    // Show the message and measure it in a single in-page step. The toast
    // dismisses itself after five seconds, so any sequence of separate
    // round trips is racing that clock — on CI the gap between reading the
    // box and reading the computed style was enough for the element to
    // disappear, and the second call then waited out the whole test.
    const geometry = await page.evaluate(async () => {
      const hooks = (window as unknown as { __qsimcityTest: { showToast(m: string): void } })
        .__qsimcityTest;
      hooks.showToast('Run finished: geometry check.');
      // Two frames: one for React to commit, one for layout to settle.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const toast = document.querySelector('.toast');
      const toolbar = document.querySelector('[role="toolbar"]');
      if (!toast || !toolbar) return null;
      const a = toast.getBoundingClientRect();
      const b = toolbar.getBoundingClientRect();
      return {
        text: toast.textContent ?? '',
        pointerEvents: getComputedStyle(toast).pointerEvents,
        overlaps: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
      };
    });

    expect(geometry, 'toast and replay toolbar must both be present').not.toBeNull();
    // Any live status message will do. Asserting on *which* message lost a
    // race on CI: the service worker's "ready to work offline" notice can
    // land between showing this one and measuring it, and the geometry
    // contract under test is a property of the region, not of its text.
    expect(geometry!.text.trim().length, 'a status message must be showing').toBeGreaterThan(0);
    // The soak caught this as a 30-second click failure: the toast sat on
    // top of the timeline dock and swallowed presses on Play and Step. A
    // status message must never block the thing it reports on.
    expect(geometry!.overlaps, 'the status message overlaps the replay toolbar').toBe(false);
    // And even if it did overlap, it must not intercept pointer events.
    expect(geometry!.pointerEvents).toBe('none');
  });
});
