import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { findBlocks, presentBlockNames, renderSummary, unknownBlockNames } from './blocks.js';
import { readFacts, productVersion } from './facts.js';

/**
 * The documentation gate.
 *
 * Everything here exists because something in this repository was wrong in
 * exactly this way and nothing noticed:
 *
 * - **Broken images.** All three screenshots in the README pointed at
 *   Playwright baselines that a project rename had moved months earlier.
 *   The landing page of a public repository was showing three broken
 *   images and no test looked at a single image path.
 * - **Stale phrases.** The README and the WISER submission still told
 *   readers the branch was "not deployed" and the live URL served some
 *   other code, after the merge made both false.
 * - **Hand-copied metrics.** The release summary described version 1.0.0
 *   and five evidence artifacts when there were fourteen.
 * - **Version drift.** The CHANGELOG announced 2.0.0 while the package
 *   metadata said 1.1.0.
 *
 * Each check below is one of those failures turned into something that
 * fails loudly. Run with `--fix-hint` for the command that repairs it.
 */

const ROOT = new URL('../..', import.meta.url).pathname;

/** Documents whose claims are gated. */
const GATED_DOCS = ['README.md', 'docs/WISER_SUBMISSION.md', 'release-evidence/summary.md'];

/**
 * Blocks each document must actually contain. Without this a document can
 * satisfy the freshness check by having no generated blocks at all, which
 * is how an empty evidence table passed once already.
 */
const REQUIRED_BLOCKS: Readonly<Record<string, readonly string[]>> = {
  'README.md': ['evidence-table', 'demo-facts'],
  'docs/WISER_SUBMISSION.md': ['evidence-list'],
};

/** Every markdown file that must not contain broken relative links. */
const LINKED_DOCS = ['README.md', 'docs/GALLERY.md', 'docs/WISER_SUBMISSION.md'];

/** Per-image and total budgets for README-facing artwork. */
const MAX_IMAGE_BYTES = 700_000;
const MAX_README_ASSET_BYTES = 3_500_000;

/**
 * Phrases that were true once and are not any more, or that this project
 * has committed to never claiming. Matching is case-insensitive.
 */
const BANNED_PHRASES: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  {
    pattern: /\bphotorealistic\b|\bphoto-realistic\b/i,
    why: 'the visual claim is "a believable stylized city"; photorealism is never claimed',
  },
  {
    pattern: /mistakab\w* for a real (?:city|place)/i,
    why: 'the visual claim is "a believable stylized city"',
  },
  {
    pattern: /\bnot deployed\b/i,
    why: 'production serves main since the release merge',
  },
  {
    pattern: /serves `main`, not this branch/i,
    why: 'production serves main since the release merge',
  },
  {
    pattern: /not uploaded anywhere/i,
    why: 'the recording is public in this repository; say where it is instead',
  },
  {
    pattern: /\bimproves? learning\b|\bproven to teach\b|\blearning gains?\b/i,
    why: 'no learning outcome has been measured; none may be claimed',
  },
];

/**
 * Sentences that deny a banned claim legitimately contain its words. A line
 * matching this is exempt, the same escape hatch the transport-misconception
 * scanner uses and for the same reason.
 */
const DENIAL = /\bnot\b|\bnever\b|\bno\b|\bwithout\b|\brather than\b|\binstead of\b|\buntil\b/i;

/** Shields-style status badges, which are chrome rather than content. */
function isBadge(target: string): boolean {
  return (
    /^https?:\/\/(img\.shields\.io|.*\/badge\.svg)/.test(target) || target.endsWith('/badge.svg')
  );
}

const failures: string[] = [];
const notes: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

// ---------------------------------------------------------- generated blocks

const facts = readFacts();

for (const doc of GATED_DOCS) {
  if (!existsSync(join(ROOT, doc))) {
    fail(`${doc}: missing`);
    continue;
  }
  const text = read(doc);
  for (const name of unknownBlockNames(text)) {
    fail(`${doc}: <!-- docs:sync start:${name} --> names a block with no renderer`);
  }
  const present = presentBlockNames(text);
  for (const required of REQUIRED_BLOCKS[doc] ?? []) {
    if (!present.has(required)) fail(`${doc}: required generated block "${required}" is missing`);
  }
  for (const block of findBlocks(text, facts)) {
    if (block.current === '') {
      fail(`${doc}: generated block "${block.name}" is empty — run pnpm docs:sync`);
    } else if (block.current !== block.expected) {
      fail(`${doc}: generated block "${block.name}" is stale — run pnpm docs:sync`);
    }
  }
}

// ------------------------------------------------------- generated summary

{
  // Fully generated, so compared in full. Blocks cannot protect a file that
  // has none, and this one drifted for weeks while nothing looked at it.
  const path = join(ROOT, 'release-evidence', 'summary.md');
  if (!existsSync(path)) {
    fail('release-evidence/summary.md is missing — run pnpm docs:sync');
  } else if (readFileSync(path, 'utf8') !== renderSummary(facts)) {
    fail('release-evidence/summary.md is stale — run pnpm docs:sync');
  }
}

// ------------------------------------------------------------------ versions

{
  const canonical = productVersion();
  const app = JSON.parse(read('apps/web/package.json')) as { version: string };
  if (app.version !== canonical) {
    fail(`apps/web/package.json version ${app.version} !== root ${canonical}`);
  }
  const viteConfig = read('apps/web/vite.config.ts');
  const manifestVersion = /version:\s*'([^']+)'/.exec(viteConfig)?.[1];
  if (manifestVersion !== canonical) {
    fail(`PWA manifest version ${String(manifestVersion)} !== root ${canonical}`);
  }
  const changelog = read('CHANGELOG.md');
  const newest = /^## \[([0-9][^\]]*)\]/m.exec(changelog)?.[1];
  if (newest !== canonical) {
    fail(`CHANGELOG newest release ${String(newest)} !== root ${canonical}`);
  }
  notes.push(`product version ${canonical} across package, app, PWA manifest and CHANGELOG`);
}

// ------------------------------------------------------------- banned phrases

for (const doc of [...GATED_DOCS, 'docs/GALLERY.md'].filter((d) => existsSync(join(ROOT, d)))) {
  // Scanned by paragraph, not by line. Markdown prose is hard-wrapped, so
  // "not photorealistic" routinely puts the denial and the claim on
  // different lines — a line-based scan flagged the README sentence that
  // exists precisely to refuse the claim.
  const lines = read(doc).split('\n');
  let start = 0;
  const paragraphs: { readonly line: number; readonly text: string }[] = [];
  let buffer: string[] = [];
  const flush = (): void => {
    if (buffer.length > 0) paragraphs.push({ line: start + 1, text: buffer.join(' ') });
    buffer = [];
  };
  lines.forEach((line, index) => {
    if (line.trim() === '') {
      flush();
      start = index + 1;
      return;
    }
    if (buffer.length === 0) start = index;
    buffer.push(line);
  });
  flush();

  for (const paragraph of paragraphs) {
    // Prose about the rule is not a violation of it.
    if (paragraph.text.trim().startsWith('<!--')) continue;
    for (const { pattern, why } of BANNED_PHRASES) {
      if (!pattern.test(paragraph.text)) continue;
      if (DENIAL.test(paragraph.text)) continue;
      fail(`${doc}:${paragraph.line}: ${why}\n    ${paragraph.text.trim().slice(0, 140)}`);
    }
  }
}

// -------------------------------------------------- links, images, alt text

for (const doc of LINKED_DOCS) {
  if (!existsSync(join(ROOT, doc))) {
    fail(`${doc}: missing`);
    continue;
  }
  const text = read(doc);
  const base = dirname(join(ROOT, doc));

  // Images: must exist, must carry alt text, must respect the byte budget.
  for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const alt = (match[1] ?? '').trim();
    const target = match[2] ?? '';
    // Status badges are not content. They still need a label, but "CI" is
    // the correct label for a CI badge and the eight-character minimum is
    // about describing a picture.
    if (isBadge(target)) {
      if (alt.length === 0) fail(`${doc}: badge ${target} has no alt text`);
      continue;
    }
    if (alt.length < 8) {
      fail(`${doc}: image ${target} has ${alt ? 'too short' : 'no'} alt text ("${alt}")`);
    }
    if (/^https?:/.test(target)) continue;
    const resolved = resolve(base, target.split('#')[0] ?? '');
    if (!existsSync(resolved)) {
      fail(`${doc}: image ${target} does not exist`);
      continue;
    }
    // The byte budget governs curated landing-page artwork, not evidence.
    // The WISER captures are 1920x1080 review material and some run past a
    // megabyte on purpose; shrinking evidence to fit a presentation budget
    // would be the wrong trade. They still have to exist and be described.
    const isCuratedAsset = relative(ROOT, resolved).startsWith(join('docs', 'assets'));
    if (!isCuratedAsset) continue;
    const bytes = statSync(resolved).size;
    if (bytes > MAX_IMAGE_BYTES) {
      fail(
        `${doc}: image ${target} is ${(bytes / 1024).toFixed(0)} KiB, over the ` +
          `${(MAX_IMAGE_BYTES / 1024).toFixed(0)} KiB per-image budget`,
      );
    }
  }

  // Relative links: must resolve to something in the tree.
  for (const match of text.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1] ?? '';
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const [path = ''] = target.split('#');
    if (path === '') continue;
    const resolved = resolve(base, path);
    if (!existsSync(resolved)) fail(`${doc}: link ${target} does not resolve`);
  }
}

// ------------------------------------------------------- README asset budget

{
  const dir = join(ROOT, 'docs', 'assets', 'readme');
  if (existsSync(dir)) {
    // Read from disk, not from the index: an image that is present but not
    // yet staged still ships in the next commit, and a budget that only
    // sees tracked files reports zero right when it matters.
    const listed = readdirSync(dir).filter((name) => name !== 'manifest.json');
    let total = 0;
    for (const file of listed) total += statSync(join(dir, file)).size;
    if (total > MAX_README_ASSET_BYTES) {
      fail(
        `docs/assets/readme is ${(total / 1024 / 1024).toFixed(2)} MiB, over the ` +
          `${(MAX_README_ASSET_BYTES / 1024 / 1024).toFixed(2)} MiB total budget`,
      );
    }
    notes.push(
      `README assets: ${listed.length} files, ${(total / 1024).toFixed(0)} KiB of a ` +
        `${(MAX_README_ASSET_BYTES / 1024).toFixed(0)} KiB budget`,
    );
  }
}

// ------------------------------------------------------------ README shape

{
  const readme = read('README.md');
  const headings = [...readme.matchAll(/^##\s+(.+)$/gm)].map((m) => (m[1] ?? '').trim());
  const REQUIRED_ORDER = [
    'Why it exists',
    'How the pipeline becomes a city',
    'Learning modes',
    'Scientific honesty',
    'Evidence',
    'Try it',
    'Docs',
    'Limitations and AI disclosure',
  ];
  const positions = REQUIRED_ORDER.map((title) => headings.indexOf(title));
  positions.forEach((position, index) => {
    if (position === -1) fail(`README.md: missing required section "${REQUIRED_ORDER[index]}"`);
  });
  const present = positions.filter((p) => p !== -1);
  const sorted = [...present].sort((a, b) => a - b);
  if (present.join(',') !== sorted.join(',')) {
    fail(`README.md: required sections are out of order (expected ${REQUIRED_ORDER.join(' → ')})`);
  }

  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].filter(
    (match) => !isBadge(match[1] ?? ''),
  ).length;
  if (images < 6 || images > 8) {
    fail(
      `README.md shows ${images} images; the spec allows 6 to 8 (the rest belong in docs/GALLERY.md)`,
    );
  }
  notes.push(`README: ${headings.length} sections, ${images} images`);
}

// ----------------------------------------------------------------- report

for (const note of notes) console.log(`  ${note}`);

if (failures.length > 0) {
  console.error(`\ndocs:check failed with ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nMost of these are fixed by: pnpm docs:sync');
  process.exit(1);
}

console.log(`\ndocs:check passed (${GATED_DOCS.length} gated documents).`);
