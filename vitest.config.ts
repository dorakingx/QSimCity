import { defineConfig } from 'vitest/config';

/**
 * Coverage policy (spec §18.4).
 *
 * Thresholds are enforced per scientific package (95% lines / 90% branches)
 * and globally (90% / 85%).
 *
 * Exclusions are limited to modules that physically cannot execute in the
 * Node test environment — WebGL rendering and Web Worker entry points — and
 * every one of them is exercised by the Playwright suite against real
 * browsers (tests/e2e). They are excluded because Node cannot run them, not
 * to inflate the reported number:
 *
 * - `**​/engine.ts` (visual-engine) and `views/CityView.tsx` construct a
 *   WebGLRenderer; verified by tests/e2e/visual.spec.ts (11 snapshots) and
 *   tests/e2e/smoke.spec.ts.
 * - `**​/*.worker.ts` and `simulator/src/worker.ts` are Worker entry points
 *   (`self.onmessage`); the logic they call is covered directly, and the
 *   worker round trip is verified in tests/e2e/smoke.spec.ts, which runs
 *   the app's real worker pipeline.
 * - `apps/web/src/main.tsx` and `pwa.ts` are browser bootstrap; verified by
 *   tests/e2e/pwa.spec.ts (registration, offline startup, update flow).
 */

const BROWSER_ONLY = [
  'packages/visual-engine/src/engine.ts',
  'packages/ui/src/views/CityView.tsx',
  'packages/ui/src/pipeline/pipeline.worker.ts',
  'packages/simulator/src/worker.ts',
  'apps/web/src/main.tsx',
  'apps/web/src/pwa.ts',
];

export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'packages/*/test/**/*.test.tsx',
      'apps/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.tsx',
      'tools/test/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/*/src/**/*.ts',
        'packages/*/src/**/*.tsx',
        'apps/web/src/**/*.ts',
        'apps/web/src/**/*.tsx',
      ],
      exclude: ['**/*.d.ts', '**/index.ts', ...BROWSER_ONLY],
      reporter: ['text-summary', 'json-summary', 'json'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 85,
        statements: 90,
        // Scientific core: the spec's stricter gate.
        'packages/domain/src/**': { lines: 95, branches: 90, functions: 90, statements: 95 },
        'packages/trace/src/**': { lines: 95, branches: 90, functions: 90, statements: 95 },
        'packages/simulator/src/**': { lines: 95, branches: 90, functions: 90, statements: 95 },
        'packages/reference-compiler/src/**': {
          lines: 95,
          branches: 90,
          functions: 90,
          statements: 95,
        },
      },
    },
  },
});
