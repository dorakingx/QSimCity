import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

/**
 * Production-equivalent static server: applies the exact headers, SPA
 * rewrite, and cache policy declared in vercel.json to the built output, so
 * the local smoke test exercises the same behavior as the hosted site.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'apps', 'web', 'dist');

interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

export interface VercelConfig {
  headers: VercelHeaderRule[];
  rewrites: { source: string; destination: string }[];
  outputDirectory: string;
  cleanUrls: boolean;
  trailingSlash: boolean;
}

export const vercelConfig = JSON.parse(
  readFileSync(join(ROOT, 'vercel.json'), 'utf8'),
) as VercelConfig;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.qasm': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Vercel source patterns are anchored regular expressions. */
function matches(source: string, pathname: string): boolean {
  return new RegExp(`^${source}$`).test(pathname);
}

export function headersFor(pathname: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of vercelConfig.headers) {
    if (matches(rule.source, pathname)) {
      for (const h of rule.headers) out[h.key] = h.value;
    }
  }
  return out;
}

/**
 * Resolves a request the way Vercel does: the filesystem is consulted first,
 * and only then are `rewrites` applied; an unmatched path is a 404.
 *
 * This previously ended with an unconditional fallback to `index.html`, which
 * made the rewrite configuration untestable — the SPA was served even when no
 * rule matched, so a `source` pattern that Vercel could not match still looked
 * correct locally. It was, and the real deployment answered 404 for every
 * route. The fallback is gone: what is served now depends on `vercel.json`.
 */
export function resolveWithConfig(
  pathname: string,
  distDir: string,
  config: VercelConfig,
): string | null {
  const clean = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const direct = join(distDir, clean);
  if (!direct.startsWith(distDir)) return null; // path traversal guard
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  // Vercel matches `source` against the pathname including its leading slash.
  for (const rule of config.rewrites) {
    if (matches(rule.source, clean)) {
      // With `cleanUrls`, `/index.html` is not a servable URL — it redirects to
      // `/` — so the SPA rewrite targets `/`, which Vercel resolves to the
      // directory's index document. Resolving a directory destination the same
      // way keeps this server's answer identical to the platform's.
      const target = join(distDir, rule.destination);
      const resolved =
        existsSync(target) && statSync(target).isDirectory() ? join(target, 'index.html') : target;
      if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
    }
  }
  return null;
}

export function resolvePath(pathname: string, distDir: string = DIST): string | null {
  return resolveWithConfig(pathname, distDir, vercelConfig);
}

export function createProductionServer(distDir: string = DIST): ReturnType<typeof createServer> {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const filePath = resolvePath(url.pathname, distDir);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = extname(filePath);
    const headers: Record<string, string> = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      ...headersFor(url.pathname),
    };
    res.writeHead(200, headers);
    res.end(readFileSync(filePath));
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) {
  const port = Number(process.env['PORT'] ?? 4180);
  createProductionServer().listen(port, () => {
    console.log(`Production-equivalent server on http://localhost:${port}`);
  });
}
