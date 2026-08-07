import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * WISER adversarial review recorder (acceptance W8.2, W8.3).
 *
 * Independent reviewer agents write their findings and scores into
 * docs/audits/wiser-reviews.json (with prose rationale in
 * docs/audits/wiser-adversarial-reviews.md). This tool validates that
 * record — four specialist stances, five category scores with rationale
 * and cited screenshots, zero open blockers or majors, every category at
 * or above 4.5 — and binds it into an evidence envelope. It never edits
 * scores; a review that does not meet the bar fails the gate.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const REVIEWS_JSON = join(ROOT, 'docs', 'audits', 'wiser-reviews.json');
const REVIEWS_DOC = join(ROOT, 'docs', 'audits', 'wiser-adversarial-reviews.md');
const OUT_DIR = join(ROOT, 'release-evidence', 'wiser-reviews');

export const REVIEW_CRITERIA = {
  minCategoryScore: 4.5,
  maxOpenBlockers: 0,
  maxOpenMajors: 0,
  requiredStances: [
    'art-direction',
    'quantum-accuracy',
    'child-ux-accessibility',
    'performance',
  ] as const,
  requiredCategories: [
    'visual-fidelity',
    'urban-coherence',
    'semantic-animation',
    'interaction-clarity',
    'scientific-honesty',
  ] as const,
} as const;

interface Finding {
  readonly severity: 'blocking' | 'major' | 'minor' | 'note';
  readonly title: string;
  readonly detail: string;
  readonly status: 'open' | 'fixed' | 'accepted';
}

interface CategoryScore {
  readonly score: number;
  readonly rationale: string;
  readonly citedScreenshots: readonly string[];
}

interface Review {
  readonly stance: string;
  readonly summary: string;
  readonly findings: readonly Finding[];
  readonly categoryScores: Readonly<Record<string, CategoryScore>>;
}

function fail(message: string): never {
  console.error(`wiser-reviews: ${message}`);
  process.exit(1);
}

function main(): void {
  if (!existsSync(REVIEWS_JSON)) fail(`missing ${REVIEWS_JSON}`);
  if (!existsSync(REVIEWS_DOC)) fail(`missing ${REVIEWS_DOC}`);
  const raw = readFileSync(REVIEWS_JSON, 'utf8');
  const reviews = JSON.parse(raw) as Review[];
  if (!Array.isArray(reviews)) fail('reviews file must be an array');

  const stances = new Set(reviews.map((r) => r.stance));
  for (const stance of REVIEW_CRITERIA.requiredStances) {
    if (!stances.has(stance)) fail(`missing required reviewer stance: ${stance}`);
  }

  let openBlockers = 0;
  let openMajors = 0;
  let totalFindings = 0;
  for (const review of reviews) {
    if (!review.summary || review.summary.length < 40) {
      fail(`review ${review.stance} lacks a written summary`);
    }
    for (const finding of review.findings) {
      totalFindings++;
      if (finding.status === 'open' && finding.severity === 'blocking') openBlockers++;
      if (finding.status === 'open' && finding.severity === 'major') openMajors++;
    }
  }

  // Category score = the MINIMUM across every reviewer who scored it: a
  // single skeptical reviewer can hold a category below the bar.
  const categoryMinimums: Record<string, number> = {};
  for (const category of REVIEW_CRITERIA.requiredCategories) {
    const scores: number[] = [];
    for (const review of reviews) {
      const entry = review.categoryScores[category];
      if (!entry) continue;
      if (typeof entry.score !== 'number' || entry.score < 1 || entry.score > 5) {
        fail(`review ${review.stance} has an invalid score for ${category}`);
      }
      if (!entry.rationale || entry.rationale.length < 40) {
        fail(`review ${review.stance} scored ${category} without written rationale`);
      }
      if (!entry.citedScreenshots || entry.citedScreenshots.length === 0) {
        fail(`review ${review.stance} scored ${category} without citing screenshots`);
      }
      for (const shot of entry.citedScreenshots) {
        if (!existsSync(join(ROOT, shot))) {
          fail(`review ${review.stance} cites a missing screenshot: ${shot}`);
        }
      }
      scores.push(entry.score);
    }
    if (scores.length === 0) fail(`no reviewer scored required category ${category}`);
    categoryMinimums[category] = Math.min(...scores);
  }

  const minScore = Math.min(...Object.values(categoryMinimums));
  const passed =
    minScore >= REVIEW_CRITERIA.minCategoryScore &&
    openBlockers <= REVIEW_CRITERIA.maxOpenBlockers &&
    openMajors <= REVIEW_CRITERIA.maxOpenMajors;

  mkdirSync(OUT_DIR, { recursive: true });
  writeEvidence(join(OUT_DIR, 'reviews.json'), {
    tool: 'wiser-reviews',
    toolVersion: '1.0.0',
    command: 'pnpm wiser:reviews',
    exitStatus: passed ? 0 : 1,
    inputHash: hashString(raw),
    thresholds: {
      minCategoryScore: REVIEW_CRITERIA.minCategoryScore,
      maxOpenBlockers: 0,
      maxOpenMajors: 0,
    },
    measurements: {
      reviewers: reviews.length,
      totalFindings,
      openBlockers,
      openMajors,
      minCategoryScore: minScore,
      ...Object.fromEntries(Object.entries(categoryMinimums).map(([k, v]) => [`score:${k}`, v])),
    },
    passed,
    detail: { reviews, categoryMinimums },
  });

  console.log('Category minimums:');
  for (const [category, score] of Object.entries(categoryMinimums)) {
    console.log(`  ${category}: ${score}`);
  }
  console.log(`Open blockers: ${openBlockers}; open majors: ${openMajors}`);
  if (!passed) fail('review record does not meet the WISER bar');
  console.log('Adversarial review record meets the WISER bar.');
}

main();
