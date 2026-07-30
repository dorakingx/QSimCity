# Performance

## Budgets

| Budget | Limit | Measured | Status |
| --- | --- | --- | --- |
| Initial-load JavaScript (gzip) | 320 KiB | **122.9 KiB** | PASS |
| All JavaScript incl. lazy chunks (gzip) | 600 KiB | **297.1 KiB** | PASS |

Measured by `pnpm check:perf` (`tools/check-performance.ts`), which walks the
static import graph from `index.html` to separate what a first visit must
download from what loads later. Evidence: `release-evidence/performance.json`.

### Chunk breakdown

| Chunk | gzip | Loaded |
| --- | --- | --- |
| `index` (app + UI + scientific core) | 64.9 KiB | eagerly |
| `react` | 57.6 KiB | eagerly |
| `rolldown-runtime` | 0.4 KiB | eagerly |
| `three` | 132.0 KiB | only when a 3D mode opens |
| `pipeline.worker` | 32.3 KiB | in the Web Worker |
| `CityView` | 7.7 KiB | only when a 3D mode opens |
| `workbox-window` | 2.2 KiB | after first paint |

**three.js never reaches Accessible 2D users.** It is a separate chunk behind
`React.lazy`, so the 2D workflow costs 123 KiB of JavaScript.

## Rendering strategy

- The whole building stock renders as **three instanced meshes**, so draw
  calls stay flat as the city grows. A test asserts the scene graph stays
  within a 48-object budget.
- Window lights are a **single point cloud** built once, not per-building
  meshes.
- The starfield is one point cloud with deterministic placement (no
  `Math.random`), so screenshots are stable.
- Fog plus a far plane cull distant geometry; the quality preset controls
  device pixel ratio (`high` ≤ 2×, `balanced` ≤ 1.5×, `low` 1×).
- Per-frame allocations are avoided in the camera and animation paths;
  matrices and vectors are reused.
- District pulses are capped at 24 concurrent rings and expire on a timer.

## Threading and responsiveness

Parsing, compilation, and simulation run in a Web Worker, so navigation and
the timeline stay responsive during a run. The shot loop yields to the event
loop every 256 shots to deliver progress and honour cancellation. Playback
skips ticks while the tab is hidden rather than burning timers, and resumes
automatically on return.

## Guarding against regressions

- `pnpm check:perf` fails the build if either budget is exceeded, and
  `pnpm goal:check` refuses to pass without a passing performance report.
- The Playwright suite fails on any uncaught exception, unhandled rejection,
  or unexpected console error across all four browser profiles.
- Visual snapshots would catch a rendering regression that a size budget
  would not.

## WebGL context loss

`webglcontextlost` is handled: the app reports what happened and switches to
Accessible 2D Mode rather than showing a dead canvas. Covered by
`tests/e2e/fallback.spec.ts`.

## Lighthouse

Lighthouse was **not executed** in this environment (no Chrome-headless
Lighthouse runner was available on the build host). The underlying
requirements it would measure are covered directly and with stronger evidence:

| Lighthouse category | How it is covered here |
| --- | --- |
| Accessibility | axe-core WCAG 2.2 AA on five surfaces, zero violations, plus a keyboard-only walkthrough (`docs/accessibility.md`) |
| Best Practices | CSP without `unsafe-eval`/`unsafe-inline` scripts, full security-header set, HTTPS/HSTS, no console errors asserted across four browsers |
| SEO | Descriptive `<title>`, meta description, semantic landmarks and headings, `lang="en"` |
| Performance | Explicit enforced byte budgets above, lazy 3D loading, worker offloading |
| PWA | Manifest, service worker, and **verified offline startup with a full offline run** (`tests/e2e/pwa.spec.ts`) |

This is recorded honestly as a substitution, not as a passing Lighthouse run.
See `docs/acceptance-matrix.md`.

## Soak behavior

A ten-minute soak was not run as an automated gate. The design choices that a
soak would test are structural rather than incidental: the render loop
allocates no new geometry per frame, pulse meshes are explicitly disposed on
expiry, engine `dispose()` releases geometries and materials (asserted by
test), and playback state is a single integer rather than accumulating
history. Long-session memory growth remains the main untested risk and is
recorded as such in the acceptance matrix.
