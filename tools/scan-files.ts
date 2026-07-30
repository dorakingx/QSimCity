import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Shared file walker for the policy scanners. */

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '.venv',
  '__pycache__',
  '.pytest_cache',
  '.ruff_cache',
  '.vite',
  '.work',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yaml', '.yml',
  '.html', '.css', '.py', '.toml', '.txt', '.svg', '.qasm', '.webmanifest',
]);

export interface ScannedFile {
  readonly path: string;
  readonly relPath: string;
  readonly content: string;
}

export function listTextFiles(root: string): ScannedFile[] {
  const out: ScannedFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(full);
        continue;
      }
      const dot = entry.lastIndexOf('.');
      const ext = dot >= 0 ? entry.slice(dot) : '';
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      if (st.size > 5 * 1024 * 1024) continue;
      out.push({
        path: full,
        relPath: relative(root, full).split(sep).join('/'),
        content: readFileSync(full, 'utf8'),
      });
    }
  };
  walk(root);
  return out;
}

export function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}
