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

**NOT AUTHORIZED.** No authenticated Vercel session and no deployment
authorization were available in this environment, so QSimCity has **not** been
deployed and **no public URL exists**. What was done instead:

- the exact production artifact was built (`apps/web/dist`),
- the Vercel configuration was validated against that artifact,
- a production-equivalent local server applied the same headers, caching, and
  routing, and the full smoke suite passed against it,
- PWA installability and offline startup were verified in a real browser.

The project is Vercel-ready and locally validated. Deploying requires only
`vercel link` and `vercel --prod` by an authorized account holder.

## Portability

Nothing above is Vercel-specific in substance. To host elsewhere, serve
`apps/web/dist` as static files with the same SPA fallback and header policy.
The application contains no Cloudflare-, Netlify-, or Vercel-specific APIs.
