import { listTextFiles, lineOf } from './scan-files.js';

/**
 * Blocking-marker scanner (spec §23): production source must not ship
 * unfinished work.
 *
 * The patterns are deliberately precise so the scan flags real markers
 * rather than ordinary English. A marker counts when it appears as a code
 * annotation — after a comment opener, or followed by `:` or `(` in the
 * conventional `TODO:` / `TODO(owner)` form — or as an explicit
 * not-implemented throw. The word "placeholder" in prose, and the HTML
 * `placeholder` attribute, are not markers and must not be flagged: a
 * scanner that forces good code to be degraded is a broken scanner.
 */

const ROOT = new URL('..', import.meta.url).pathname;

const PATTERNS: readonly { readonly label: string; readonly regex: RegExp }[] = [
  {
    label: 'comment marker',
    regex: /(?:\/\/|\/\*|\*|#|<!--)\s*(TODO|FIXME|XXX|HACK)\b/,
  },
  {
    label: 'annotated marker',
    regex: /\b(TODO|FIXME|XXX|HACK)\s*[:(]/,
  },
  {
    label: 'placeholder marker',
    regex: /\b(PLACEHOLDER|NOT_IMPLEMENTED|NOTIMPLEMENTED)\b/,
  },
  {
    label: 'not-implemented throw',
    regex: /throw new (?:Error|TypeError)\(\s*['"`][^'"`]*not implemented/i,
  },
  {
    label: 'unimplemented raise',
    regex: /raise NotImplementedError/,
  },
];

const EXCLUDED_PATHS: RegExp[] = [
  /^tools\/check-todos\.ts$/, // defines the patterns
  /^tools\/test\//, // fixtures for this scanner
  /^pnpm-lock\.yaml$/, // generated; may contain package names
  /^python\/qsimcity_qiskit\/uv\.lock$/, // generated
  // Documents that state the no-marker policy necessarily name the markers.
  /^CLAUDE\.md$/,
  /^CONTRIBUTING\.md$/,
  /^docs\/acceptance-matrix\.md$/,
  /^docs\/visual-quality-rubric\.md$/,
  /^docs\/audits\//,
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
    for (const { label, regex } of PATTERNS) {
      const match = regex.exec(file.content);
      if (match && match.index !== undefined) {
        violations.push({
          file: file.relPath,
          line: lineOf(file.content, match.index),
          marker: `${label}: ${match[0].trim().slice(0, 40)}`,
        });
        break;
      }
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
      console.error(`  ${v.file}:${v.line} — ${v.marker}`);
    }
    process.exit(1);
  }
  console.log('Blocking-marker scan passed.');
}
