# Reference Benchmark: PGSimCity

> Internal quality benchmark only. This document never ships in the public UI.
> No code, assets, writing, or layouts from the benchmark are copied.

## Sources

| Source | Retrieved |
| --- | --- |
| https://github.com/NikolayS/PGSimCity | 2026-07-30 |
| https://github.com/NikolayS/PGSimCity/blob/main/README.md | 2026-07-30 |
| https://github.com/NikolayS/PGSimCity/blob/main/ROADMAP.md | 2026-07-30 |
| https://gigazine.net/news/20260728-pgsimcity-postgresql/ | 2026-07-30 (coverage article) |

Compared state: main branch as of 2026-07-30 (205 commits, 407 stars).
Major dependencies: three.js r185 (sole bundled 3D dep), TypeScript, Vite,
optional lazy-loaded PGlite. 234 tests with CI. Apache-2.0.

## Benchmark feature set (observed)

- Explorable 3D city modeling PostgreSQL internals (buffer pool, WAL,
  processes, storage, replication, query lab).
- Orbit / fly / walk cameras (1.7 m eye height), touch controls
  (Chrome-emulation-tested only), command palette, 14-chapter tour,
  help overlay, day/night lighting, optional audio, floating labels.
- Educational scenarios (cache thrash, long transaction, checkpoint storm,
  slow replay).
- Semantic color coding; three specialist accuracy review rounds; pinned
  formulas documented (KNOB-AUDIT.md).
- Static bundle, no app server; Plausible analytics (cookie-free).

## Observed strengths

- Strong first impression and art direction; distinct districts.
- Real formulas pinned against PostgreSQL docs/source; accuracy reviews.
- Good camera range and command palette; guided tour depth (14 chapters).
- Clean architecture separation (core/sim/world/engine/ui/observability).

## Observed weaknesses / gaps QSimCity must exceed

- No real computation integration: it is a hand-tuned model, not driven by
  actual engine output. QSimCity drives visuals from real traces.
- No provenance/certainty classification on displayed data.
- No accessible non-WebGL mode; WebGL is mandatory.
- Touch verified only in emulation.
- Analytics enabled by default (privacy-preserving but still third-party).
- No import/export of replayable traces; no compare mode.
- No property-based testing or scientific cross-validation vs a reference
  implementation; 234 tests overall.
- No offline PWA support documented.

## Comparison matrix

Status codes: `MATCH` = QSimCity must at least match; `EXCEED` = QSimCity must
clearly exceed; each claim requires working behavior plus evidence recorded in
`docs/acceptance-matrix.md`.

| Category | PGSimCity | QSimCity target |
| --- | --- | --- |
| First impression | Polished 3D city | MATCH |
| 3D city quality | High; themed districts | MATCH |
| World topology | Districts mirror architecture | MATCH (12 functional districts mirroring compile/execute pipeline) |
| Camera controls | Orbit/fly/walk | MATCH + top-down |
| First-person controls | 1.7 m walk mode | MATCH |
| Touch controls | Emulation-tested | MATCH (tested in Playwright touch emulation) |
| Guided tour | 14 chapters | EXCEED (16 chapters, screen-reader-compatible) |
| Trace playback | None (live sim only) | EXCEED (versioned QSimCity Trace, import/export, seek/step) |
| Scenario system | 4+ scenarios | EXCEED (12 scenarios with tests + seeds) |
| Inspector | Object inspector | MATCH + provenance/certainty fields |
| Search | Command palette | MATCH |
| Command palette | `/` or Ctrl-K | MATCH |
| Day/night cycle | Yes, semantic | MATCH |
| Audio | Optional sound design | MATCH (opt-in, mutable) |
| Accessibility | Limited; WebGL required | EXCEED (WCAG 2.2 AA target, full 2D mode) |
| Mobile usability | Reduced tier | MATCH |
| Scientific accuracy | Reviewed model | EXCEED (cross-validated against Qiskit) |
| Data provenance | None | EXCEED (per-event source + certainty) |
| Real computation integration | None (model only) | EXCEED (real simulator + real Qiskit transpiler traces) |
| Automated testing | 234 tests | EXCEED (300+ meaningful tests) |
| Property-based testing | None observed | EXCEED (fast-check + Hypothesis) |
| Scientific cross-validation | Manual reviews | EXCEED (automated vs Qiskit/Aer) |
| Visual regression | Not observed | EXCEED (Playwright snapshots, 10 surfaces) |
| Performance monitoring | Quality tiers | EXCEED (budgets + soak test) |
| Offline support | Not documented | EXCEED (installable PWA, offline startup) |
| Documentation | README/CLAUDE/ROADMAP/KNOB-AUDIT | EXCEED (docs suite + source ledger + ADRs) |
| Privacy | Plausible analytics | EXCEED (zero telemetry) |
| Security | Static bundle | EXCEED (CSP, input limits, schema validation, audits) |
| Maintainability | Clean module split | MATCH (enforced package boundaries) |
| Deployment reproducibility | npm + static | EXCEED (pinned toolchain, fresh-clone gate, Vercel config) |

## Non-goals borrowed from the benchmark's own scoping

Like the benchmark, QSimCity is a model scaled for human observation, not an
emulator; it will not claim to connect to live quantum hardware in v1.
