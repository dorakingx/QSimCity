import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every functional spec must take `test` from ./fixtures.js.
 *
 * The fixture is what disables WebGL for the functional projects and
 * installs the deterministic-frame hooks. A spec that imports `test`
 * straight from @playwright/test silently opts out of both: it mounts the
 * full three.js city on a GPU-less runner and loses the hook that stops
 * playback.
 *
 * That is not hypothetical. `accessibility.spec.ts` opted out by accident —
 * a refactor rewrote `import { expect, test } from '@playwright/test'` and
 * missed the variant carrying `type Page`. The result was four rounds of CI
 * failures whose visible symptoms were a 17.8-second click, a 6.8-second
 * evaluate, and a view that took 45 seconds to render, none of which
 * pointed at the import.
 *
 * The city projects are exempt: they need WebGL, and they opt into the
 * hooks through `e2eUrl`.
 */
const CITY_SPECS = new Set(['visual.spec.ts', 'city3d.spec.ts', 'screenshot-budget.spec.ts']);

describe('e2e fixture contract', () => {
  const dir = resolve(process.cwd(), 'tests/e2e');
  const specs = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));

  it('finds the specs', () => {
    expect(specs.length).toBeGreaterThan(4);
  });

  it('every functional spec imports test from the fixture', () => {
    const offenders: string[] = [];
    for (const spec of specs) {
      if (CITY_SPECS.has(spec)) continue;
      const text = readFileSync(join(dir, spec), 'utf8');
      // The `test` binding specifically — a `type` import is harmless.
      const importsTestFromPlaywright =
        /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*'@playwright\/test'/.test(
          text.replace(/import type[^;]+;/g, ''),
        );
      const importsTestFromFixtures =
        /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*'\.\/fixtures\.js'/.test(text);
      if (importsTestFromPlaywright || !importsTestFromFixtures) offenders.push(spec);
    }
    expect(
      offenders,
      `these functional specs bypass the fixture (no WebGL policy, no test hooks): ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
