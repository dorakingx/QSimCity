import { listTextFiles, lineOf } from './scan-files.js';

/**
 * Language-policy scanner (spec §2): production v1 ships in English only.
 * Detects Japanese characters (hiragana, katakana, CJK ideographs, and
 * full-width punctuation) in first-party source and documentation. Third-party
 * license text is excluded only where preservation is legally required.
 */

const ROOT = new URL('..', import.meta.url).pathname;

// Hiragana, katakana, CJK unified ideographs, CJK punctuation, full-width
// forms. The ideographic space inside the character class is intentional —
// it is part of the detection range.
// eslint-disable-next-line no-irregular-whitespace
const JAPANESE_PATTERN = /[぀-ゟ゠-ヿ一-鿿　-〿！-｠]/u;

const EXCLUDED_PATHS: RegExp[] = [
  /^THIRD_PARTY_NOTICES\.md$/, // may quote upstream license text verbatim
  /^tools\/check-language\.ts$/, // contains the detection ranges themselves
  // The scanner's own tests must contain the characters being detected;
  // excluding only this directory keeps the fixtures from failing the scan
  // while leaving all first-party source and documentation in scope.
  /^tools\/test\//,
];

export interface LanguageViolation {
  readonly file: string;
  readonly line: number;
  readonly sample: string;
}

export function scanLanguage(root: string): LanguageViolation[] {
  const violations: LanguageViolation[] = [];
  for (const file of listTextFiles(root)) {
    if (EXCLUDED_PATHS.some((p) => p.test(file.relPath))) continue;
    const match = JAPANESE_PATTERN.exec(file.content);
    if (match && match.index !== undefined) {
      violations.push({
        file: file.relPath,
        line: lineOf(file.content, match.index),
        sample: file.content.slice(match.index, match.index + 20).split('\n')[0]!,
      });
    }
  }
  return violations;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) {
  const violations = scanLanguage(ROOT);
  if (violations.length > 0) {
    console.error(
      `Language-policy scan FAILED with ${violations.length} file(s) containing Japanese text:`,
    );
    for (const v of violations.slice(0, 50)) {
      console.error(`  ${v.file}:${v.line} near "${v.sample}"`);
    }
    process.exit(1);
  }
  console.log('Language-policy scan passed.');
}
