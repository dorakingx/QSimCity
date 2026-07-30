import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProductionServer, headersFor, resolvePath, vercelConfig } from '../serve-production.js';

/**
 * Vercel configuration tests (spec §18.1, §24.7): the deployment contract
 * is verified against the real built output through a server that applies
 * the same rules the platform will.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
let server: ReturnType<typeof createProductionServer>;
let baseUrl: string;

beforeAll(async () => {
  server = createProductionServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('vercel.json contract', () => {
  it('pins the build, install, and output configuration', () => {
    const raw = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as Record<string, unknown>;
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
    expect(resolvePath('/explore')).toMatch(/index\.html$/);
    expect(resolvePath('/lab/deep/route')).toMatch(/index\.html$/);
    expect(resolvePath('/favicon.svg')).toMatch(/favicon\.svg$/);
    expect(resolvePath('/manifest.webmanifest')).toMatch(/manifest\.webmanifest$/);
    expect(resolvePath('/sw.js')).toMatch(/sw\.js$/);
  });

  it('blocks path traversal attempts', () => {
    const resolved = resolvePath('/../../../../etc/passwd');
    expect(resolved === null || resolved.endsWith('index.html')).toBe(true);
  });

  it('rewrite pattern excludes the service worker so it is never shadowed', () => {
    const rewrite = vercelConfig.rewrites[0]!;
    expect(new RegExp(`^${rewrite.source}$`).test('/sw.js')).toBe(false);
    expect(new RegExp(`^${rewrite.source}$`).test('/assets/index.js')).toBe(false);
    expect(new RegExp(`^${rewrite.source}$`).test('/manifest.webmanifest')).toBe(false);
    expect(new RegExp(`^${rewrite.source}$`).test('/explore')).toBe(true);
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
