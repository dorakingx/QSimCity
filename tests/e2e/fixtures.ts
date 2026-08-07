import { test as base } from '@playwright/test';
import { disableWebgl } from './helpers.js';

/**
 * Functional coverage runs without WebGL; 3D coverage has its own projects.
 *
 * This is a split by what CI can actually do. `ubuntu-latest` has no GPU,
 * so Chromium draws WebGL through SwiftShader at roughly 3 fps. Every
 * driver interaction inherits that: a `click()` on a page mounting the
 * three.js city costs seconds of actionability protocol instead of
 * milliseconds, and in one CI run that produced nine 60-second timeouts in
 * tests that were not testing 3D at all — "every mode is reachable from
 * the header", "running the Bell sample produces synchronized results in
 * 2D", "charts expose complete table alternatives".
 *
 * Raising those timeouts would have hidden the problem rather than fixed
 * it. Instead the functional projects run the product on its complete
 * non-WebGL path — which is not a degraded stand-in but a first-class
 * surface this project ships deliberately, and the one a school Chromebook
 * or a locked-down lab machine actually gets. Cross-browser functional
 * coverage is therefore both fast and representative.
 *
 * The 3D city keeps dedicated projects (`city`, `city-mobile`) that run
 * serially with WebGL enabled, including a positive WebGL2 render test, so
 * nothing about the 3D path goes unverified.
 */
const CITY_PROJECTS = new Set(['city', 'city-mobile']);

export const test = base.extend<{ webglPolicy: void }>({
  webglPolicy: [
    async ({ page }, use, testInfo) => {
      if (!CITY_PROJECTS.has(testInfo.project.name)) {
        await disableWebgl(page);
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
