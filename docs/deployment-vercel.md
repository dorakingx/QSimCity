# Deploying QSimCity to Vercel

The canonical deployment target is Vercel. QSimCity is a **static bundle**:
no serverless functions, no edge functions, no KV, no Blob, no Postgres, no
Analytics, no Speed Insights. Everything in `vercel.json` is portable
configuration (headers, caching, SPA rewrites) rather than vendor runtime.

## Settings

| Setting | Value |
| --- | --- |
| Build command | `pnpm build` |
| Install command | `pnpm install --frozen-lockfile` |
| Output directory | `apps/web/dist` |
| Framework preset | None (`"framework": null`) |
| Node.js version | Pinned by `.nvmrc` (22.23.1) and `engines.node` (>=22.12) |
| pnpm version | Pinned by `packageManager` (pnpm@11.14.0) |

These are declared in `vercel.json` so the dashboard cannot drift from the
repository, and `tools/test/vercel-config.test.ts` asserts each value.

## Routing

QSimCity is a single-page application. The rewrite sends every path to
`index.html` **except** real static assets:

```
/((?!assets/|icons/|favicon.svg|manifest.webmanifest|sw.js|workbox-.*\.js|registerSW.js).*)  ->  /index.html
```

The exclusion list matters: if `sw.js` or the manifest were rewritten to HTML,
the service worker would fail to register and the PWA would silently break.
Tests assert that `/explore` returns the app shell while `/sw.js`,
`/manifest.webmanifest`, and `/assets/*` are served directly.

## Caching

| Path | `Cache-Control` | Why |
| --- | --- | --- |
| `/assets/*` | `public, max-age=31536000, immutable` | Content-hashed filenames |
| `/icons/*` | `public, max-age=31536000, immutable` | Content-stable icons |
| `/index.html` | `public, max-age=0, must-revalidate` | Must pick up new asset hashes |
| `/sw.js` | `public, max-age=0, must-revalidate` | Must never serve a stale worker |
| `/manifest.webmanifest` | `public, max-age=0, must-revalidate` | Install metadata must stay fresh |

## Security headers

Content-Security-Policy (`default-src 'self'`, `object-src 'none'`,
`frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'none'`,
`connect-src 'self'`, `worker-src 'self' blob:`), HSTS with preload,
`X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, and
same-origin COOP/CORP. There is no `unsafe-eval` and no `unsafe-inline` in
`script-src`. See `SECURITY.md`.

## Verifying locally before deploying

`tools/serve-production.ts` replays the exact `vercel.json` rules — headers,
rewrites, caching — over the real build output, so the local smoke test
exercises hosted behavior rather than Vite's dev server:

```bash
pnpm build
pnpm exec tsx tools/serve-production.ts    # http://localhost:4180
```

Automated equivalent (32 assertions against the built output):

```bash
pnpm exec vitest run tools/test/vercel-config.test.ts
```

## Deploying

```bash
pnpm dlx vercel@latest link
pnpm dlx vercel@latest --prod
```

Preview deployments are produced automatically for pull requests once the
project is linked to a Git remote. The CI workflow
(`.github/workflows/ci.yml`) runs verification, the production build, and the
browser matrix before any deployment step.

## Deployment status for this build

**Deployed**, on the owner's explicit authorization, to the Vercel project
`doraking/qsimcity`. The source lives in the private GitHub repository
`dorakingx/QSimCity`.

The first production deployment immediately exposed a defect that no local run
had caught: every deep link returned 404. Vercel compiles a rewrite `source`
with path-to-regexp rather than as a raw regular expression, so the
negative-lookahead pattern that had been used to protect asset paths matched
nothing and no rewrite fired. The configuration now uses the documented
catch-all, which is safe because Vercel applies rewrites only after the
filesystem check:

```json
"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
```

The local production-equivalent server had hidden this by falling back to
`index.html` unconditionally; it now mirrors Vercel's order — filesystem,
then rewrites, then 404 — so a rewrite the platform cannot match fails locally
too.

Verified against the live deployment, not only against the local emulator:
the root and every deep link return the application shell, `sw.js` and
`manifest.webmanifest` are served directly, and the full security-header set
is present on the real response.

Note that Vercel requires lowercase project names, so the project slug is
`qsimcity` while the product and repository name remain QSimCity.

## Portability

Nothing above is Vercel-specific in substance. To host elsewhere, serve
`apps/web/dist` as static files with the same SPA fallback and header policy.
The application contains no Cloudflare-, Netlify-, or Vercel-specific APIs.
