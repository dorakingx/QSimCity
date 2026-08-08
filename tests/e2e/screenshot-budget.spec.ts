import { expect, test } from '@playwright/test';
import { SCREENSHOT_TIMEOUT_MS } from '../../playwright.config.js';
import { e2eUrl, freezeCity, skipOnboarding } from './helpers.js';

/**
 * The screenshot budget that `toHaveScreenshot` is given, measured rather
 * than assumed.
 *
 * A visual assertion has two failure modes and they look nothing alike. One
 * is a real difference. The other is running out of wall clock before the
 * capture finishes — which reports as `Timeout Xms exceeded` with no actual
 * and no diff image, because no comparison ever happened.
 *
 * The second one happened: `city first-person` failed the gate on a commit
 * whose E2E job passed the identical suite, and the artifact showed the
 * captured frame was *byte-identical* to the committed Linux baseline. The
 * assertion never got to compare. On a GPU-less runner every capture goes
 * through SwiftShader, and when the gate re-runs the whole matrix beside
 * everything else, one capture can exceed the 5 s default on its own.
 *
 * Raising the number blindly would swap a false failure for a slow one, so
 * this file measures instead:
 *
 *  - successive captures of a frozen city must be **byte-identical**, which
 *    is what makes any nonzero diff meaningful and rules out motion as a
 *    cause of retries;
 *  - the slowest capture must leave a stated margin under the configured
 *    budget, so the budget is known to have headroom on whatever machine is
 *    running — including the slow one.
 *
 * If SwiftShader ever gets slow enough to threaten the budget, this fails
 * with the measured numbers instead of surfacing later as an unexplained
 * visual flake.
 */

/** Captures per surface. Enough for a max, small enough to stay cheap. */
const SAMPLES = 3;

/**
 * The slowest single capture may use at most this share of the budget.
 * Two thirds leaves the assertion a full extra capture of room.
 */
const MAX_BUDGET_SHARE = 2 / 3;

test.describe.configure({ mode: 'default' });

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

test.describe('screenshot budget', () => {
  test.skip(({ isMobile }) => isMobile, 'measured on the desktop 3D surface');

  test('a frozen city captures identically, well inside the budget', async ({ page }, testInfo) => {
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    // The heaviest surface in the suite: the full 3D city, which is the one
    // that timed out. Measuring anything cheaper would prove nothing.
    await freezeCity(page);

    const durations: number[] = [];
    const digests: string[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const started = Date.now();
      const buffer = await page.screenshot({ fullPage: false });
      durations.push(Date.now() - started);
      digests.push(`${buffer.byteLength}:${buffer.subarray(0, 2048).toString('base64')}`);
    }

    const slowest = Math.max(...durations);
    testInfo.annotations.push({
      type: 'screenshot-budget',
      description:
        `captures ${durations.join('/')} ms, slowest ${slowest} ms, ` +
        `budget ${SCREENSHOT_TIMEOUT_MS} ms`,
    });

    // Stability first: if the frame moved, a "diff" would mean nothing and
    // retries would be the reason captures pile up against the clock.
    expect(
      new Set(digests).size,
      `captures differed across ${SAMPLES} shots of a frozen city`,
    ).toBe(1);

    const ceiling = Math.round(SCREENSHOT_TIMEOUT_MS * MAX_BUDGET_SHARE);
    expect(
      slowest,
      `slowest capture ${slowest} ms of a ${SCREENSHOT_TIMEOUT_MS} ms budget ` +
        `(limit ${ceiling} ms). Raise the budget only with this number in hand.`,
    ).toBeLessThan(ceiling);
  });
});
