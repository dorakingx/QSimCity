# Architecture

QSimCity is a static, client-side monorepo. There is no server, no database,
and no runtime service of any kind: the browser does all the work.

## Package graph

```
apps/web (qsimcity-web)          Vite app shell, PWA registration, styles
  └── @qsimcity/ui               React views, store, pipeline orchestration
        ├── @qsimcity/visual-engine   three.js renderer, cameras, picking
        │     └── @qsimcity/world     districts, buildings, playback model
        ├── @qsimcity/reference-compiler
        ├── @qsimcity/simulator
        ├── @qsimcity/domain
        └── qsimcity-trace

python/qsimcity_qiskit            Optional Qiskit bridge (never required)
```

Dependencies point strictly downward. The rules below are enforced by ESLint
(`no-restricted-imports`, see `eslint.config.js`) and asserted by tests.

| Package | May depend on | Must never import |
| --- | --- | --- |
| `@qsimcity/domain` | — | three.js, React, any presentation package |
| `qsimcity-trace` | zod | three.js, React, any presentation package |
| `@qsimcity/simulator` | domain, trace | three.js, React |
| `@qsimcity/reference-compiler` | domain, trace | three.js, React |
| `@qsimcity/world` | trace | three.js, React |
| `@qsimcity/visual-engine` | world, three.js | domain mutation, React |
| `@qsimcity/ui` | all of the above | its own scientific math |
| `apps/web` | ui | anything scientific directly |

Packages are consumed as TypeScript source through workspace `exports`; a
single root `tsc --noEmit` typechecks the whole graph and Vite bundles the app,
so there is no per-package build step to keep in sync.

## The trace is the backbone

Nothing animates from mutable simulator state. The simulator and the reference
compiler both emit events into a `TraceBuilder`, producing one immutable
**QSimCity Trace**. Every surface then derives its state from
`(trace, playbackTick)`:

```
runPipeline()
  parse → reference-compile (emits events) → simulate (emits events)
     ↓
  Trace  ────────────────────────────────────────────────┐
     ↓                    ↓                ↓             ↓
  activityAtTick()   CircuitDiagram   Histogram    ProvenancePanel
     ↓
  ┌──────────────┬─────────────────┬──────────────┐
  3D city        Accessible 2D     Compare Mode   Guided Tour
```

Because 3D and 2D consume the same derivation, they cannot show different
science — a property asserted by tests rather than assumed.

## Threading

The pipeline runs in a dedicated Web Worker
(`packages/ui/src/pipeline/pipeline.worker.ts`) so the main thread stays
responsive. `createRunner()` returns a worker-backed runner in browsers and an
identical in-process runner where `Worker` is unavailable (tests, older
environments) — both call the same `runPipeline`. Shot loops yield to the event
loop between batches so progress reporting and cancellation work.

## State ownership

| Concern | Owner | Notes |
| --- | --- | --- |
| Scientific results | `Trace` (immutable) | Never mutated after build |
| Playback position | `appStore.playbackTick` | Pausing pauses all derived state |
| Camera | `CameraRig` inside the engine | Never in the store; never affects science |
| Visual quality | `appStore.settings` | Cannot change scientific output |
| City geography | `@qsimcity/world/districts` | The single source of coordinates |

Playback pacing (`BASE_TICK_MS`, speed multiplier) is presentation time and is
deliberately separate from `sourceDurationNs` in trace events, which is a
model of instruction duration.

## Rendering strategy

The entire building stock renders as three `InstancedMesh` objects (boxes,
cylinders, spheres), so draw calls stay flat regardless of city size. District
plates, road segments, interactive kiosks, one window-light point cloud, one
starfield, and the QPU pylons/bridges account for the rest. Level of detail is
handled by fog and distance culling; the quality preset controls pixel ratio.

three.js is code-split into its own chunk and loaded only when a 3D mode is
opened, so 2D-only users never download it (123 KiB gzip initial load vs
132 KiB for the deferred three.js chunk — see `docs/performance.md`).

## Extension points

- **New device topology**: add to `packages/domain/src/topology.ts` and mirror
  it in `python/qsimcity_qiskit/src/qsimcity_qiskit/devices.py`.
- **New scenario**: add to `packages/ui/src/scenarios/scenarios.ts` with a
  machine-checkable `isComplete(trace)`; the scenario test suite picks it up.
- **Imported real-QPU results**: the trace schema already carries the
  `measured_import` source classification and `MEASURED` certainty label, so
  previously measured hardware results can be imported without schema changes.
- **Localization**: production v1 is English-only by policy, but no user-facing
  string is embedded in scientific packages, so a message catalogue can be
  introduced at the UI layer without touching the core.
