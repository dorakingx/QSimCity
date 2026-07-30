import { listTextFiles, lineOf } from './scan-files.js';

/**
 * Prohibited-name scanner (spec §23). Rejects the legacy project name and
 * unrelated project names everywhere; allows the benchmark name PGSimCity
 * only in approved internal benchmark/audit material. "SimCity" may appear
 * only inside QSimCity or PGSimCity.
 */

const ROOT = new URL('..', import.meta.url).pathname;

/**
 * Legacy/unrelated project names. KetQat and Alice in Quantumland are matched
 * case-insensitively. The legacy name "Quantum City" is matched
 * case-sensitively so the generic English phrase "quantum city" (used in
 * product copy to describe the city) is not a false positive; the legacy
 * project name was always title-cased.
 */
const PROHIBITED_CI = ['KetQat', 'Alice in Quantumland'];
const PROHIBITED_CS = ['Quantum City'];

const PGSIMCITY_ALLOWED_PATHS = [
  /^docs\/reference-benchmark\.md$/,
  /^docs\/audits\//,
  /^docs\/adr\//,
  /^tools\/check-prohibited-names\.ts$/,
  /^tools\/test\//,
];

export interface NameViolation {
  readonly file: string;
  readonly line: number;
  readonly term: string;
}

export function scanProhibitedNames(root: string): NameViolation[] {
  const violations: NameViolation[] = [];
  for (const file of listTextFiles(root)) {
    // This scanner (and its tests) contain the pattern strings themselves.
    if (file.relPath === 'tools/check-prohibited-names.ts') continue;
    if (/^tools\/test\//.test(file.relPath)) continue;
    for (const term of PROHIBITED_CI) {
      const lower = file.content.toLowerCase();
      const needle = term.toLowerCase();
      let idx = lower.indexOf(needle);
      while (idx !== -1) {
        violations.push({ file: file.relPath, line: lineOf(file.content, idx), term });
        idx = lower.indexOf(needle, idx + needle.length);
      }
    }
    for (const term of PROHIBITED_CS) {
      let idx = file.content.indexOf(term);
      while (idx !== -1) {
        violations.push({ file: file.relPath, line: lineOf(file.content, idx), term });
        idx = file.content.indexOf(term, idx + term.length);
      }
    }
    // "SimCity" allowed only within QSimCity / PGSimCity.
    const simcityPattern = /simcity/gi;
    let m: RegExpExecArray | null;
    while ((m = simcityPattern.exec(file.content)) !== null) {
      const start = m.index;
      const before = file.content.slice(Math.max(0, start - 2), start).toLowerCase();
      if (before.endsWith('q')) continue; // QSimCity: allowed everywhere
      if (before === 'pg') {
        const allowed = PGSIMCITY_ALLOWED_PATHS.some((p) => p.test(file.relPath));
        if (!allowed) {
          violations.push({
            file: file.relPath,
            line: lineOf(file.content, start),
            term: 'PGSimCity outside approved benchmark/audit docs',
          });
        }
        continue;
      }
      violations.push({ file: file.relPath, line: lineOf(file.content, start), term: 'SimCity' });
    }
  }
  return violations;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) {
  const violations = scanProhibitedNames(ROOT);
  if (violations.length > 0) {
    console.error(`Prohibited-name scan FAILED with ${violations.length} violation(s):`);
    for (const v of violations.slice(0, 50)) {
      console.error(`  ${v.file}:${v.line} contains "${v.term}"`);
    }
    process.exit(1);
  }
  console.log('Prohibited-name scan passed.');
}
