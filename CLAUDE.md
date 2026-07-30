# CLAUDE.md — working notes for AI assistants and new contributors

Orientation for anyone (human or model) picking this repository up cold.

## What this is

QSimCity is a static, client-side 3D visualization of a quantum program's
journey through compilation and execution. It is an **unofficial, independent,
open-source educational and research project** — not affiliated with Electronic
Arts, Maxis, IBM, or any quantum-hardware vendor.

## Where things live

| Path | Contents |
| --- | --- |
| `packages/domain` | Gates, circuits, device topologies, seeded RNG, OpenQASM parser, sample circuits |
| `packages/trace` | The QSimCity Trace format: schema, validation, migration, hashing, builder |
| `packages/simulator` | Statevector engine, noise channels, experiment runner, worker |
| `packages/reference-compiler` | Normalize → layout → route → translate → optimize → schedule |
| `packages/world` | District geography, procedural buildings, playback derivation, interactive consoles |
| `packages/visual-engine` | three.js renderer, instanced city, camera rig |
| `packages/ui` | React views, store, pipeline orchestration, tour, scenarios |
| `apps/web` | Vite app shell, PWA, styles |
| `python/qsimcity_qiskit` | Optional Qiskit bridge |
| `tools/` | Policy scanners, goal checker, mutation runner, production server, icon generator |

## The four rules that matter most

1. **The trace is the backbone.** Producers emit events into a `TraceBuilder`;
   every surface renders from `(trace, playbackTick)`. Never animate from
   mutable simulator state, and never let 2D and 3D compute different science.

2. **Label everything.** Every number on screen carries a
   `SourceClassification` and a `CertaintyLabel`. If you add a display and
   cannot justify its label, it is not ready to ship.

3. **Respect package boundaries.** `domain`, `trace`, `simulator`, and
   `reference-compiler` must never import three.js or React. ESLint enforces
   this — do not add an exception, restructure instead.

4. **English only, no placeholders.** Automated scans reject non-English text
   in first-party code and any `TODO`/`FIXME`/placeholder marker.

## Commands

```bash
pnpm dev              # dev server
pnpm verify           # typecheck, lint, policy scans, tests
pnpm test:e2e         # Playwright: chromium, firefox, webkit, mobile
pnpm test:coverage    # coverage with enforced thresholds
pnpm test:mutation    # mutation testing of scientific invariants
pnpm check:perf       # performance budgets against the real build
pnpm goal:check       # the full Definition-of-Done gate
```

Node 22.12+ required (`.nvmrc` pins 22.23.1). Use `pnpm`, not npm or yarn.

## Traps worth knowing

- **Aer determinism**: `run_ideal`/`run_noisy` deliberately skip `transpile`
  and force `max_parallel_threads=1`. Both were needed to make committed
  sample traces regenerate byte-identically; re-adding transpile will make
  hashes drift between runs.
- **Number formatting parity**: `_js_number` in `trace_model.py` implements
  ECMAScript `Number::toString` rules. Python's `repr` is *not* equivalent
  (`1e-05` vs `0.00001`), and hash parity depends on this.
- **Coverage exclusions** are only for code Node physically cannot run (WebGL,
  Workers, PWA bootstrap), each covered by Playwright instead. Do not expand
  the list to make a number look better.
- **The camera** must never affect scientific state, and playback pacing
  (`BASE_TICK_MS`) must never be confused with `sourceDurationNs`.
- **Visual snapshots** are stable because randomness in the scene is
  deterministic (hash-based window lights, computed starfield). Do not
  introduce `Math.random` into rendering.

## Verifying a change to the scientific core

Unitary equivalence alone is not enough — a layout bug can preserve the
unitary while scrambling classical-bit mapping. Run
`packages/reference-compiler/test/compiled-execution.test.ts`, which executes
compiled circuits and compares measured distributions.

## Documentation map

`docs/architecture.md` (structure and boundaries) ·
`docs/scientific-accuracy.md` (what is exact vs sampled) ·
`docs/scientific-source-ledger.md` (claim → source → test) ·
`docs/qsimcity-trace.md` (format reference) ·
`docs/accessibility.md` · `docs/performance.md` · `docs/privacy.md` ·
`docs/deployment-vercel.md` · `docs/acceptance-matrix.md` ·
`docs/adr/` (decisions) · `docs/audits/` (reviews)
