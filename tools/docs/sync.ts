import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyBlocks, renderSummary } from './blocks.js';
import { readFacts } from './facts.js';

/**
 * Writes measured values into the documentation's generated regions.
 *
 * The counterpart to `pnpm docs:check`. Both read the same facts, so a
 * document is either in sync or the check fails; there is no third state in
 * which a number is merely "probably still right".
 *
 * `release-evidence/summary.md` is regenerated in full rather than patched,
 * because it is a report about a release rather than prose about the
 * project — the previous hand-written one still described version 1.0.0 and
 * five evidence artifacts when there were fourteen.
 */

const ROOT = new URL('../..', import.meta.url).pathname;

const TARGETS = ['README.md', 'docs/WISER_SUBMISSION.md'];

const facts = readFacts();
let changed = 0;

for (const target of TARGETS) {
  const path = join(ROOT, target);
  if (!existsSync(path)) continue;
  const before = readFileSync(path, 'utf8');
  const after = applyBlocks(before, facts);
  if (after !== before) {
    writeFileSync(path, after);
    changed += 1;
    console.log(`  updated ${target}`);
  }
}

// ------------------------------------------------------------- summary.md

const summaryPath = join(ROOT, 'release-evidence', 'summary.md');
const summary = renderSummary(facts);
const previousSummary = existsSync(summaryPath) ? readFileSync(summaryPath, 'utf8') : '';
if (previousSummary !== summary) {
  writeFileSync(summaryPath, summary);
  changed += 1;
  console.log('  updated release-evidence/summary.md');
}

console.log(
  changed === 0 ? 'docs:sync: already in sync.' : `docs:sync: updated ${changed} file(s).`,
);
