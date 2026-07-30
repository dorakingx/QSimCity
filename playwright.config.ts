import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration (spec §18.5): Chromium/Firefox/WebKit smoke matrix,
 * Chromium-based visual regression and PWA checks, mobile viewports.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    toHaveScreenshot: {
      // 3D output varies slightly across GPUs/driver versions; structural
      // regressions still exceed this bound by orders of magnitude.
      maxDiffPixelRatio: 0.05,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter qsimcity-web preview',
    port: 4173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: ['**/mobile.spec.ts'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: ['**/visual.spec.ts', '**/pwa.spec.ts', '**/mobile.spec.ts'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: ['**/visual.spec.ts', '**/pwa.spec.ts', '**/mobile.spec.ts'],
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: ['**/mobile.spec.ts', '**/visual.spec.ts'],
    },
  ],
});
