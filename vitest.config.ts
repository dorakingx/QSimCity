import { defineConfig } from 'vitest/config';

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
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx', 'apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
      exclude: ['**/*.d.ts', '**/index.ts'],
      reporter: ['text-summary', 'json-summary', 'json'],
      reportsDirectory: 'coverage',
    },
  },
});
