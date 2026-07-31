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

Lighthouse runs as a release gate: `pnpm lighthouse` scores four targets — the
home screen and Accessible 2D Mode, each on a desktop and a mobile profile —
three times per target, and judges the median so one noisy run cannot decide
the verdict. All twelve raw reports are kept in `release-evidence/lighthouse/`.

| Category | Threshold |
| --- | --- |
| Performance (desktop) | 85 |
| Performance (mobile) | 75 |
| Accessibility | 100 |
| Best Practices | 95 |
| SEO | 90 |

Every threshold is met. The scored medians are recorded in
`release-evidence/lighthouse/lighthouse-report.json` rather than copied here,
because they are host-dependent (macOS, Chromium via Playwright): rerunning
reproduces the verdict, not the identical scores.

An earlier release recorded Lighthouse as "not executed" and substituted other
evidence for it, and the completion gate passed anyway. The gate no longer
accepts a substitution for a required measurement — see
`docs/audits/release-hardening.md`.

The direct evidence that stood in for Lighthouse is still maintained, because
it is stronger than a category score: axe-core WCAG 2.2 AA on five surfaces
with zero violations plus a keyboard-only walkthrough, a CSP with no
`unsafe-eval` or inline scripts, the full security-header set, zero console
errors asserted across four browsers, and a verified offline startup with a
full offline run.

## Soak behavior

`pnpm soak` runs the production build in a real browser for a full 600 seconds,
cycling eight workloads: a Lab run, playback control (pause, seek, step, speed),
all four camera modes, a noise change with a rerun, Accessible 2D Mode, Compare
Mode, a rotating scenario including Variational Gridlock, and the guided tour.
Heap is sampled throughout and every console and page error is recorded.

| Criterion | Threshold |
| --- | --- |
| Duration | ≥ 600 s |
| Workload cycles | ≥ 5 |
| Trailing heap growth ratio (after 60 s warm-up) | < 1.5 |
| Uncaught errors | 0 |
| Console errors | 0 |
| Unrecovered WebGL context losses | 0 |
| Final interaction latency | < 3000 ms |

Every criterion is met; the measured figures are in the evidence artifacts
below rather than copied here, for the same host-dependence reason.

Artifacts: `release-evidence/soak/soak-report.json`, `heap-samples.csv`,
`console-events.json`, and `soak-summary.md`.

The structural properties this exercises were deliberate: the render loop
allocates no new geometry per frame, pulse meshes are disposed on expiry,
engine `dispose()` releases geometries and materials (asserted by test), and
playback state is a single integer rather than accumulating history. Long
sessions are now measured rather than argued.
