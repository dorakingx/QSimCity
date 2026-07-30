import { listTextFiles, lineOf } from './scan-files.js';

/**
 * Blocking-marker scanner (spec §23): production source must not ship
 * TODO/FIXME/placeholder/stub markers. Documentation that legitimately
 * discusses the concept (e.g. this scanner) is excluded.
 */

const ROOT = new URL('..', import.meta.url).pathname;

const MARKERS = /\b(TODO|FIXME|XXX|HACK|PLACEHOLDER|NOT[ _-]IMPLEMENTED|STUB)\b/i;

const EXCLUDED_PATHS: RegExp[] = [
  /^tools\/check-todos\.ts$/,
  /^tools\/test\//,
  /^docs\/acceptance-matrix\.md$/, // records status of the scan itself
];

export interface TodoViolation {
  readonly file: string;
  readonly line: number;
  readonly marker: string;
}

export function scanTodos(root: string): TodoViolation[] {
  const violations: TodoViolation[] = [];
  for (const file of listTextFiles(root)) {
    if (EXCLUDED_PATHS.some((p) => p.test(file.relPath))) continue;
    const match = MARKERS.exec(file.content);
    if (match && match.index !== undefined) {
      violations.push({
        file: file.relPath,
        line: lineOf(file.content, match.index),
        marker: match[0]!,
      });
    }
  }
  return violations;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) {
  const violations = scanTodos(ROOT);
  if (violations.length > 0) {
    console.error(`Blocking-marker scan FAILED with ${violations.length} file(s):`);
    for (const v of violations.slice(0, 50)) {
      console.error(`  ${v.file}:${v.line} contains "${v.marker}"`);
    }
    process.exit(1);
  }
  console.log('Blocking-marker scan passed.');
}
