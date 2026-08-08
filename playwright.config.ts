import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration (spec §18.5).
 *
 * The suite is split by what it is actually testing, because the two halves
 * have opposite requirements:
 *
 * - **Functional/fallback** coverage runs across Chromium, Firefox, WebKit
 *   and a mobile viewport, fully parallel. None of it depends on the 3D
 *   city rendering quickly, or at all.
 *
 * - **3D and visual** coverage runs serially in one controlled Chromium
 *   project. Rendering the city is expensive, and on a CI runner it is
 *   expensive in software: `ubuntu-latest` has no GPU, so `--enable-gpu`
 *   buys nothing and SwiftShader draws the scene at roughly 3 fps. Running
 *   those tests in parallel with everything else is what produced nine
 *   60-second timeouts in one CI run. One at a time, they are affordable
 *   and, with the freeze contract in tests/e2e/helpers.ts, deterministic.
 *
 * GPU flags are still passed: on a developer machine they use the real GPU,
 * and on a GPU-less runner they are harmless. They are not, and were never,
 * a hardware-GPU benchmark — `tools/wiser/run-fps-benchmark.ts` is where
 * performance is measured, and it records the renderer it actually got.
 *
 * Retries stay at 0. A test that only passes on a second attempt is a test
 * that is telling you something.
 */
const GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'];

/** Specs that require the 3D city; excluded from the functional projects. */
const CITY_SPECS = ['**/visual.spec.ts', '**/city3d.spec.ts', '**/screenshot-budget.spec.ts'];

/**
 * Budget for a test that has to build and draw the 3D city.
 *
 * This is a deliberate, measured exception to the 60-second budget the rest
 * of the suite uses, and it deserves to be justified rather than quietly
 * set. Measured on `ubuntu-latest`, which has no GPU and therefore
 * rasterizes a roughly 400k-triangle scene on the CPU through SwiftShader,
 * one city build and render costs:
 *
 *     city day 35.1s · city night 34.9s · city golden 35.0s
 *     city first-person 38.5s · compare 38.7s · mobile landscape 30.4s
 *
 * "Quantum lab with results" builds the city *and* runs the pipeline, and
 * exceeded 60s consistently. That is not a race being papered over: the
 * frames are provably deterministic — three page loads idling 0s, 1.5s and
 * 3s before freezing produce a byte-identical frame — so a longer budget
 * buys correctness time, not a second chance at a coin flip.
 *
 * The functional projects keep 60s. Retries stay at 0 everywhere, and the
 * screenshot comparison threshold is unchanged.
 */
const CITY_TIMEOUT = 150_000;

/**
 * How long a single `toHaveScreenshot` may spend capturing and comparing.
 *
 * Separate from the test timeout on purpose, and raised from Playwright's
 * 5 s default for one measured reason. A visual assertion fails two very
 * different ways: a real pixel difference, or running out of clock before
 * any comparison happens. The second reports `Timeout 5000ms exceeded` with
 * **no actual and no diff image**, because nothing was ever compared.
 *
 * That is what hit `city first-person` in run 31227695962: the gate failed
 * while the E2E job passed the identical suite on the same commit, and the
 * uploaded artifact showed the captured frame was byte-identical to the
 * committed Linux baseline. A correct frame was reported as a failure
 * because one SwiftShader capture of a ~400k-triangle scene did not finish
 * inside five seconds on a runner that was busy with the rest of the gate.
 *
 * The number comes from measurement, not from doubling until green. On a
 * GPU-backed developer machine the three sampled captures of the frozen
 * 3D city cost 106/88/91 ms. The same scene costs roughly thirty times
 * that under SwiftShader — which is how a five-second budget ends up a
 * coin flip on a loaded runner, and why 30 s restores real headroom rather
 * than hiding a slow path.
 *
 * It is applied per assertion, at each `toHaveScreenshot` call, rather than
 * as a global `expect.timeout`. Raising the global would stretch every
 * auto-retrying assertion in the suite — `toBeVisible`, `toHaveText`, all
 * of it — and turn a targeted fix into exactly the blanket inflation that
 * hides real failures. Only the screenshot assertions needed more room.
 *
 * This is not blanket inflation: the per-test budgets, the 0 retries and
 * the 0.05 pixel-ratio threshold are all unchanged, and this bounds only
 * the capture. `tests/e2e/screenshot-budget.spec.ts` re-measures on the
 * heaviest surface every run and fails if the slowest capture climbs past
 * two thirds of this number — so the headroom is asserted on the machine
 * in front of it, including the slow one, and the value cannot quietly
 * become too small again.
 */
export const SCREENSHOT_TIMEOUT_MS = 30_000;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  /**
   * Match the worker count to the runner, not to a developer laptop.
   *
   * `ubuntu-latest` has 4 cores. Playwright's default is half the core
   * count per project, and several of these tests run a full statevector
   * simulation in a Web Worker — so a fully parallel run had multiple
   * simulations competing for the same two cores. A trace from CI showed
   * what that costs: a single `click()` on the Run button taking 17.8
   * seconds, an in-page `evaluate` taking 6.8, and the next click never
   * completing inside the 60-second budget.
   *
   * This is not a raised timeout. The work was real and the machine was
   * oversubscribed; two workers give each simulation a core to run on.
   */
  // Spread rather than `: undefined`, because the config is now imported by
  // the specs that need SCREENSHOT_TIMEOUT_MS, which pulls this file into
  // the typechecked program — and under `exactOptionalPropertyTypes` an
  // explicit `undefined` is not the same as an absent key. Locally, absent
  // means "Playwright decides", which is what was always intended.
  ...(process.env['CI'] ? { workers: 2 } : {}),
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    toHaveScreenshot: {
      // 3D output varies slightly across GPUs and driver versions;
      // structural regressions exceed this bound by orders of magnitude.
      // Baselines are per-platform, so a Linux run compares against Linux.
      maxDiffPixelRatio: 0.05,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm --filter qsimcity-web preview',
    port: 4173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    // ---------------------------------------- functional and fallback
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: GPU_ARGS } },
      testIgnore: [...CITY_SPECS, '**/mobile.spec.ts'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: [...CITY_SPECS, '**/pwa.spec.ts', '**/mobile.spec.ts'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: [...CITY_SPECS, '**/pwa.spec.ts', '**/mobile.spec.ts'],
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], launchOptions: { args: GPU_ARGS } },
      testMatch: ['**/mobile.spec.ts'],
    },
    // ------------------------------------------------ 3D and visual
    {
      name: 'city',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: GPU_ARGS } },
      testMatch: CITY_SPECS,
      fullyParallel: false,
      timeout: CITY_TIMEOUT,
    },
    {
      name: 'city-mobile',
      use: { ...devices['Pixel 7'], launchOptions: { args: GPU_ARGS } },
      testMatch: CITY_SPECS,
      fullyParallel: false,
      timeout: CITY_TIMEOUT,
    },
  ],
});
