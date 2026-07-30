# Privacy

**QSimCity collects nothing.** There is no account system, no analytics, no
telemetry, no error reporting service, and no upload of any kind.

## What leaves your browser

Nothing. The application is a static bundle. After the first load it works
entirely offline, and an end-to-end test asserts that a full run — loading a
sample, compiling, simulating, and rendering results — issues **zero requests
to any host other than the origin serving the app**
(`tests/e2e/pwa.spec.ts > security: no external requests`).

Your OpenQASM program text never leaves the browser. Imported trace files are
read locally with `File.text()` and never transmitted.

## Share links

Share links contain only:

- a **bundled sample id** (never your own program text),
- shot count, seed, device id, optimization and layout flags,
- noise parameters as five numbers.

Custom programs cannot be shared by URL at all — the button is disabled and the
UI explains why. No personal data is ever placed in a URL or query string.

## Local storage

| Key | Contents | Lifetime |
| --- | --- | --- |
| `qsimcity.settings.v1` | Visual quality, day/night, audio on/off and volume, reduced motion, particles, labels | Until you clear it |

That is the complete list. No identifiers, no history, no program contents.
The key is versioned so a future schema change cannot misread old data.

**Erasing it**: Settings → *Clear locally stored data*. This removes the key
and restores defaults immediately. Clearing site data in your browser has the
same effect, plus removal of the service-worker cache.

## Service worker cache

The PWA caches the application shell and bundled sample circuits so QSimCity
starts offline. The cache holds only files served from the origin — no user
content. Updates are surfaced as a notice; a new version never takes over the
session without a reload.

## Third-party services

None at runtime. No CDN, no font service, no analytics provider, no
crash reporter. The Content Security Policy shipped in `vercel.json` enforces
this at the browser level with `default-src 'self'` and `connect-src 'self'`,
so even an accidental future dependency could not phone home.

## Deployment hosting

If you use the canonical Vercel deployment, Vercel operates the CDN and will
have standard web-server access logs (IP address, timestamp, requested path)
as any host would. QSimCity itself adds nothing to that, enables no Vercel
Analytics or Speed Insights, and uses no Vercel runtime services. Hosting the
same static output anywhere else changes nothing about the application.

## The Qiskit bridge

The optional Python bridge runs on your machine and talks to no network
service. It uses `GenericBackendV2` fake backends and local Aer simulation.
It never authenticates to IBM Quantum and never submits a job to real
hardware.
