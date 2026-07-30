import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Lint configuration including the architecture boundary rules from
 * ADR-0002: scientific packages must not import rendering libraries, and
 * rendering packages must not reach into scientific internals.
 */

const scientificPackages = ['domain', 'trace', 'simulator', 'reference-compiler'];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.venv/**',
      'playwright-report/**',
      'test-results/**',
      'apps/web/dev-dist/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  // Boundary: scientific packages must stay free of rendering and UI deps.
  ...scientificPackages.map((pkg) => ({
    files: [`packages/${pkg}/src/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'three', message: 'Scientific packages must not import three.js (ADR-0002).' },
            { name: 'react', message: 'Scientific packages must not import React (ADR-0002).' },
            { name: 'react-dom', message: 'Scientific packages must not import React (ADR-0002).' },
          ],
          patterns: [
            {
              group: ['@qsimcity/world', '@qsimcity/visual-engine', '@qsimcity/ui'],
              message: 'Scientific packages must not depend on presentation packages (ADR-0002).',
            },
          ],
        },
      ],
    },
  })),
  {
    files: ['packages/world/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'three', message: 'world is the pure layout module; three.js belongs in visual-engine (ADR-0002).' },
            { name: 'react', message: 'world is data-only (ADR-0002).' },
          ],
        },
      ],
    },
  },
  {
    files: ['tools/**/*.ts', 'apps/web/vite.config.ts', 'tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
