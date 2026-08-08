import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCKS, renderSummary } from '../docs/blocks.js';
import type { DocsFacts } from '../docs/facts.js';

/**
 * Generated blocks may only carry values that a documentation edit cannot
 * move.
 *
 * The README and the WISER submission live inside the hashed source tree,
 * and every evidence envelope binds the tree it measured. So a block that
 * quotes the tree hash, the demo checksum, the gate's pass count or the
 * soak's elapsed seconds creates a loop: regenerating evidence rewrites the
 * document, which changes the tree, which invalidates the evidence that was
 * just produced. `pnpm docs:sync` never reaches a fixed point and the demo
 * binding breaks on every re-record. That happened three times while this
 * tooling was being written, once per value.
 *
 * `release-evidence/summary.md` sits outside the hashed tree, so it is
 * allowed — and expected — to state all of them.
 */

const ROOT = resolve(process.cwd(), '..', '..');
const root = (relativePath: string): string => {
  try {
    readFileSync(join(process.cwd(), 'package.json'));
    return join(process.cwd(), relativePath);
  } catch {
    return join(ROOT, relativePath);
  }
};

/** Two runs of the same tree, differing only where measurement is noisy. */
const RUN_A: DocsFacts = {
  sourceTreeHash: 'aaaaaaaaaaaaaaaa',
  productVersion: '2.0.0',
  unitTests: 957,
  e2eTests: 109,
  coverageLines: '96.11',
  coverageBranches: '85.40',
  mutationScore: '0.9643',
  mutantsGenerated: 84,
  mutantsKilled: 81,
  mutantsSurvived: 3,
  pytestPassed: 76,
  qiskitVersion: '2.5.1',
  aerVersion: '0.17.2',
  reproProcesses: 12,
  reproDistinctSemanticHashes: 1,
  soakSeconds: 601.6,
  soakCycles: 105,
  soakConsoleErrors: 0,
  soakUncaughtErrors: 0,
  soakFailedRequests: 0,
  remountCycles: 60,
  remountHeapSlopeKib: '89.5',
  remountPeakContexts: 0,
  initialJsKib: '159.0',
  totalJsKib: '350.2',
  freshCloneSteps: 16,
  freshCloneFailed: 0,
  demoSeconds: 315,
  demoCaptions: 38,
  demoSha256: 'a'.repeat(64),
  goalChecksPassed: 35,
  goalChecksFailed: 0,
};

/** Same tree, second run: noisy measurements land slightly differently. */
const RUN_B: DocsFacts = {
  ...RUN_A,
  sourceTreeHash: 'bbbbbbbbbbbbbbbb',
  soakSeconds: 601.0,
  soakCycles: 104,
  demoSeconds: 314,
  demoSha256: 'b'.repeat(64),
  goalChecksPassed: 36,
};

describe('generated blocks are stable across runs of the same tree', () => {
  for (const [name, render] of Object.entries(BLOCKS)) {
    it(`${name} renders identically for two runs`, () => {
      expect(
        render(RUN_B),
        `block "${name}" changed between two runs of the same tree. It is quoting a ` +
          'value that varies per run or is produced after the tree closes — the tree ' +
          'hash, the demo checksum, the gate count, or a soak/demo duration. Those ' +
          'belong in release-evidence/, which is outside the hashed tree.',
      ).toBe(render(RUN_A));
    });
  }

  it('the release summary is allowed to state all of them', () => {
    // The counterpart assertion: summary.md is outside the hashed tree, so
    // it should carry exactly the values the blocks may not.
    const summary = renderSummary(RUN_A);
    expect(summary).toContain(RUN_A.sourceTreeHash);
    expect(summary).toContain(String(RUN_A.goalChecksPassed));
    expect(renderSummary(RUN_B)).not.toBe(summary);
  });
});

describe('the documents commit to that', () => {
  it('README and the WISER submission quote no per-run value', () => {
    const readme = readFileSync(root('README.md'), 'utf8');
    const wiser = readFileSync(root('docs/WISER_SUBMISSION.md'), 'utf8');
    const manifest = JSON.parse(
      readFileSync(root('release-evidence/demo/demo-manifest.json'), 'utf8'),
    ) as { sha256: string; sourceTreeHash: string };

    for (const [label, text] of [
      ['README.md', readme],
      ['docs/WISER_SUBMISSION.md', wiser],
    ] as const) {
      expect(text, `${label} quotes the demo checksum`).not.toContain(manifest.sha256);
      expect(text, `${label} quotes the source tree hash`).not.toContain(manifest.sourceTreeHash);
    }
  });
});
