import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProductionServer,
  headersFor,
  resolvePath,
  resolveWithConfig,
  vercelConfig,
} from '../serve-production.js';

/**
 * Vercel configuration tests (spec §18.1, §24.7): the deployment contract
 * is verified against the real built output through a server that applies
 * the same rules the platform will.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
let server: ReturnType<typeof createProductionServer>;
let baseUrl: string;
let distDir: string;
let tempRoot: string | null = null;

/**
 * These tests assert the deployment contract against a real production build.
 * The build is produced into a temporary directory rather than into the
 * repository, so the suite has no side effects on tracked or ignored files
 * and does not depend on any other command having run first. A pre-existing
 * `apps/web/dist` is reused when present to keep the common path fast, but is
 * never created or modified here.
 */
beforeAll(async () => {
  const repoDist = join(ROOT, 'apps', 'web', 'dist');
  if (existsSync(join(repoDist, 'index.html'))) {
    distDir = repoDist;
  } else {
    tempRoot = mkdtempSync(join(tmpdir(), 'qsimcity-vercel-'));
    execFileSync(
      join(ROOT, 'node_modules', '.bin', 'vite'),
      ['build', '--outDir', join(tempRoot, 'dist'), '--emptyOutDir'],
      {
        cwd: join(ROOT, 'apps', 'web'),
        stdio: 'pipe',
        timeout: 600_000,
      },
    );
    distDir = join(tempRoot, 'dist');
  }
  server = createProductionServer(distDir);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

describe('vercel.json contract', () => {
  it('pins the build, install, and output configuration', () => {
    const raw = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(raw['buildCommand']).toBe('pnpm build');
    expect(raw['installCommand']).toBe('pnpm install --frozen-lockfile');
    expect(raw['outputDirectory']).toBe('apps/web/dist');
  });

  it('pins Node and pnpm versions in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      packageManager: string;
      engines: { node: string };
    };
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(pkg.engines.node).toMatch(/\d+/);
    const nvmrc = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim();
    expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares no Vercel runtime services', () => {
    const raw = readFileSync(join(ROOT, 'vercel.json'), 'utf8');
    for (const forbidden of ['functions', 'crons', 'edge-config', 'analytics', 'speedInsights']) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('sets a strict Content-Security-Policy with no unsafe script sources', () => {
    const csp = headersFor('/index.html')['Content-Security-Policy']!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    // Workers need blob: for bundled module workers.
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it('sets the required security headers on every route', () => {
    const headers = headersFor('/some/deep/route');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
    expect(headers['Permissions-Policy']).toContain('geolocation=()');
  });

  it('caches hashed assets immutably and HTML/service worker never', () => {
    expect(headersFor('/assets/index-abc123.js')['Cache-Control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(headersFor('/icons/icon-192.png')['Cache-Control']).toContain('immutable');
    expect(headersFor('/index.html')['Cache-Control']).toContain('must-revalidate');
    expect(headersFor('/sw.js')['Cache-Control']).toContain('must-revalidate');
  });

  it('rewrites unknown routes to index.html but serves real assets directly', () => {
    expect(resolvePath('/explore', distDir)).toMatch(/index\.html$/);
    expect(resolvePath('/lab/deep/route', distDir)).toMatch(/index\.html$/);
    expect(resolvePath('/favicon.svg', distDir)).toMatch(/favicon\.svg$/);
    expect(resolvePath('/manifest.webmanifest', distDir)).toMatch(/manifest\.webmanifest$/);
    expect(resolvePath('/sw.js', distDir)).toMatch(/sw\.js$/);
  });

  it('blocks path traversal attempts', () => {
    const resolved = resolvePath('/../../../../etc/passwd', distDir);
    expect(resolved === null || resolved.endsWith('index.html')).toBe(true);
  });

  it('runs without creating or modifying any build output in the repository', () => {
    // Regression guard for the original fresh-clone failure: the suite must
    // not depend on a prior build, and must not silently produce one.
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const touchedDist = status.split('\n').filter((l) => l.includes('apps/web/dist'));
    expect(touchedDist).toEqual([]);
    void cpSync;
  });

  it('uses a rewrite source Vercel can actually match', () => {
    // Vercel compiles `source` with path-to-regexp, not as a raw JavaScript
    // regular expression. An earlier config used a negative-lookahead pattern
    // to exclude asset paths; it read correctly, passed a RegExp-based test,
    // and matched nothing on Vercel, so every deep link 404'd in production.
    // The catch-all is the pattern Vercel documents, and it is safe because
    // rewrites are applied only after the filesystem check.
    expect(vercelConfig.rewrites).toHaveLength(1);
    const rewrite = vercelConfig.rewrites[0]!;
    expect(rewrite.source).toBe('/(.*)');
    expect(rewrite.source).not.toMatch(/\(\?!/);
    // The destination must be `/`, not `/index.html`: with `cleanUrls` the
    // latter is a redirect rather than a servable file, and Vercel answered
    // 404 for every route until this was corrected against the real platform.
    expect(rewrite.destination).toBe('/');
    expect(vercelConfig.cleanUrls).toBe(true);
  });

  it('serves real files from disk in preference to the rewrite', () => {
    // The filesystem-first order is what keeps the catch-all from shadowing
    // the service worker, the manifest, and hashed assets.
    expect(resolvePath('/sw.js', distDir)).toMatch(/sw\.js$/);
    expect(resolvePath('/manifest.webmanifest', distDir)).toMatch(/manifest\.webmanifest$/);
    expect(resolvePath('/favicon.svg', distDir)).toMatch(/favicon\.svg$/);
  });

  it('404s an unmatched path instead of silently serving the shell', () => {
    // Guards the defect this file previously hid: resolvePath fell back to
    // index.html unconditionally, so a broken or missing rewrite still looked
    // healthy locally while production returned 404.
    const noRewrites = { ...vercelConfig, rewrites: [] as typeof vercelConfig.rewrites };
    const resolved = resolveWithConfig('/explore', distDir, noRewrites);
    expect(resolved).toBeNull();
  });
});

describe('production-equivalent server behavior', () => {
  it('serves index.html with security headers', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(await res.text()).toContain('QSimCity');
  });

  it('direct route refresh returns the app shell (SPA routing)', async () => {
    const res = await fetch(`${baseUrl}/explore`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  it('serves the manifest with the correct content type', async () => {
    const res = await fetch(`${baseUrl}/manifest.webmanifest`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/manifest+json');
    const manifest = (await res.json()) as { name: string; icons: unknown[] };
    expect(manifest.name).toBe('QSimCity');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  it('serves the service worker uncached', async () => {
    const res = await fetch(`${baseUrl}/sw.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('must-revalidate');
  });

  it('serves hashed assets with immutable caching', async () => {
    const html = await (await fetch(`${baseUrl}/`)).text();
    const match = /\/assets\/[A-Za-z0-9._-]+\.js/.exec(html);
    expect(match).not.toBeNull();
    const res = await fetch(`${baseUrl}${match![0]}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });
});
