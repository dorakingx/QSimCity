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

## Execution runs the compiled circuit

`runPipeline` parses, compiles for the selected device, and then executes the
**compiled** circuit. It produces three separated results — logical reference,
physical ideal, and physical noisy — which the trace names explicitly under
`results.execution`. See `docs/scientific-accuracy.md` for what each one
means.

Two consequences are structural rather than cosmetic:

- Execution events are emitted in the qubit space the circuit ran in. Physical
  events carry `physicalQubits`, so the QPU Grid lights real device qubits and
  real coupling edges. `activityAtTick` deliberately has no fallback to logical
  indices: an event with no physical qubits contributes nothing to the grid.
- Execution events reference **compiled** instruction ids. A logical
  instruction may have been split, merged, moved, or removed by compilation, so
  the Inspector says so rather than offering a timeline jump that would land on
  an unrelated tick.

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

The city plan (terrain, roads, blocks, parcels, buildings, props) is pure
data in `@qsimcity/world`; the visual engine compiles it once into a bounded
set of draws. Building walls merge into one mesh per procedural facade style
(deterministic `DataTexture` atlases with meter-true UVs and night-emissive
windows); roofs, plinths, wedges, tanks, and interiors merge into a
vertex-colored mesh; district accent architecture merges per district so
stage activity can glow. Everything repeated — lamps, trees, benches,
containers, parked cars, fence posts, vehicles, pedestrians — is instanced.
Sky, sun shadows (a camera-following ortho frustum), fog, and a
PMREM-generated environment map from the procedural dome drive three
lighting presets (day, golden hour, night). Picking maps merged-mesh face
ranges back to buildings and districts. A far tier hides curb-level props
at distance; the quality preset controls pixel ratio and shadow
resolution. The whole city renders in roughly a hundred draw calls.

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
