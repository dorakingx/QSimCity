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
const CITY_SPECS = ['**/visual.spec.ts', '**/city3d.spec.ts'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
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
    },
    {
      name: 'city-mobile',
      use: { ...devices['Pixel 7'], launchOptions: { args: GPU_ARGS } },
      testMatch: CITY_SPECS,
      fullyParallel: false,
    },
  ],
});
