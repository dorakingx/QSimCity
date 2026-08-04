# WISER Real-City Specification

This document specifies the transformation of QSimCity from a stylized
district diorama into a production-quality, believable, interactive real-city
visualization for the WISER Education submission. It is the authority for what
"done" means; the machine-checkable companion is
`docs/wiser-acceptance-matrix.md`, whose rows are enforced by
`pnpm goal:check` in the same way as `docs/acceptance-matrix.md`.

QSimCity remains an unofficial, independent, open-source educational and
research project under the Apache License 2.0, not affiliated with Electronic
Arts, Maxis, IBM, or any quantum-hardware vendor. The prior benchmark project
is consulted only as a quality bar; no code, asset, text, layout, or branding
is copied from it or from any third party. All geometry, textures, audio, and
icons are generated procedurally from source in this repository.

## 1. Invariants that must survive the transformation

1. **The QSimCity Trace is immutable and remains the backbone.** Producers
   emit into `TraceBuilder`; every surface — 3D city, Accessible 2D, tour,
   inspector, compare — renders from `(trace, playbackTick)` via
   `activityAtTick`. The visual overhaul may extend `WorldActivity` with new
   *derived* fields but may not change trace semantics, hashing, or committed
   sample traces.
2. **Package boundaries hold.** `domain`, `trace`, `simulator`,
   `reference-compiler` never import three.js or React; `world` remains pure
   data/derivation (no three.js, no React, no WebAudio). ESLint enforces this.
3. **Qiskit cross-validation, trace reproducibility, mutation testing, and
   the Python bridge continue to pass unchanged.**
4. **Provenance labels stay universal.** Every number and every semantic
   visual carries a `SourceClassification` and `CertaintyLabel`. New moving
   entities must be classified (see §5.4) before they ship.
5. **Accessible 2D Mode remains the complete product without WebGL** and
   gains the new learning content (missions, explanation levels) rather than
   falling behind it.
6. **Privacy posture unchanged:** static client-side app, no accounts, no
   telemetry, no external requests at runtime.
7. **All valid existing tests keep passing.** Tests that assert replaced
   internals (e.g. the old primitive mesh inventory) are updated to assert the
   equivalent contract in the new implementation, never deleted without a
   successor.
8. **Determinism everywhere.** No `Math.random` in world layout or rendering;
   procedural variety derives from seeded hashes so visual snapshots stay
   byte-stable. Playback pacing (`BASE_TICK_MS`) stays separate from
   `sourceDurationNs`.

## 2. City geography and urban structure

The twelve districts keep their identities, stage ownership, and approximate
positions (the pipeline still reads west to east), but the ground they stand
on becomes a coherent, real-scale coastal city. One world unit is one meter.

### 2.1 Terrain and water

- The city occupies a coastal strip: open water west of the Program Port
  (ships arrive from the west sea) and a bay east of the Measurement Harbor
  (readout containers ship out east). Both waterfronts have quay walls,
  piers, and moored vessels.
- A single deterministic heightfield `terrainHeight(x, z)` shapes the ground:
  a flat urban plain, a gentle rise to the Observatory hill in the south, and
  beaches/quays meeting the water at height zero. Every building, road,
  vehicle, and pedestrian samples this function — nothing floats and nothing
  clips into the ground.
- Water renders as animated water with sky reflection (environment map), the
  one place reflective material is clearly justified; glass curtain-wall
  towers share the same environment map at lower intensity.

### 2.2 Roads, blocks, and parcels

- A hierarchical road network replaces the single boulevard: the west-east
  Processing Boulevard (dual carriageway with median), a ring collector road,
  and local streets that subdivide each district into city blocks. Roads have
  asphalt surfaces with lane markings, curbs, sidewalks, and crosswalks at
  junctions.
- Blocks are subdivided into parcels; every parcel is either built, a plaza,
  a park, or district-specific yard space (container yards, tank farms, rail
  sidings). No empty featureless districts.
- Street furniture is instanced: street lamps (lit at night), trees in parks
  and along avenues, benches, and district-appropriate props.

### 2.3 Architecture

Each district keeps a distinct architectural language, now built from real
building massing instead of single primitives:

| District | Language |
| --- | --- |
| Program Port | Wharf sheds, container cranes, stacked containers, moored ships, harbor office |
| IR Foundry | Industrial halls with sawtooth roofs, stacks, gantries |
| Layout Exchange | Stone-and-glass trading hall, mid-rise offices |
| Routing Transit | Rail yard: platforms, tracks, signal masts, elevated viaduct |
| Translation Refinery | Distillation columns, tank farm, pipe racks, flare stack |
| Optimization Works | Machine halls, rooftop plant, conveyor bridges |
| Scheduling Tower | Downtown cluster: podium-and-tower high-rises around the clock-crowned Chronarch Tower (tallest structure) |
| QPU Grid | Fenced research campus: cryostat core, qubit pylons from the device topology, service buildings |
| Noise Atmosphere | Meteorological station: radar dishes, masts, balloon shed |
| Measurement Harbor | Container terminal: gantry cranes, container stacks (the live histogram), quay, ships |
| Classical Control Center | Data-center slabs with cooling plants and elevated conduit bridges |
| Observatory | Hilltop dome, terraced gardens, funicular path |

- Buildings are assembled from parts with facade detail: procedurally
  generated texture atlases (window grids, mullions, spandrels, brick,
  concrete, curtain glass) applied per instance with deterministic variation.
  Repeated identical placeholder boxes are prohibited; adjacent buildings must
  differ in height, footprint, facade style, or roof treatment.
- Interactive consoles become readable street-level objects (kiosk booths
  with glowing screens) and selected landmark interiors are enterable in walk
  mode: the ground floor of the Observatory, the Harbor office, and the
  Layout Exchange hall have simple furnished interiors visible through doors,
  with the district's console inside.

### 2.4 Believability bar

The default overview must read as a believable city at first glance, without
labels. Concretely: continuous ground with no gaps, streets that connect,
buildings that meet the ground and the street line, a skyline with varied
silhouettes, and district character legible from architecture alone. Floating
geometry, z-fighting, visible clipping, and meaningless motion are defects.

## 3. Light, sky, atmosphere, weather

- Three lighting presets: **day** (high sun, neutral white, blue sky with
  procedural clouds), **golden hour** (low warm sun, long shadows, warm fog),
  **night** (moonlit blue ambient, starfield, lit windows, street lamps,
  vehicle headlights). The setting extends the existing day/night toggle.
- Physically-plausible rendering: ACES filmic tone mapping, PBR materials
  (calibrated roughness/metalness per material family), one directional sun
  with real-time shadow maps covering the visible city, hemisphere/ambient
  fill matched to the sky, distance fog blending into the horizon.
- The sky is a procedural gradient dome with sun disc and clouds; it feeds a
  generated environment map so water and glass reflect the actual sky state.
- Weather stays the noise metaphor: with a noisy run configured, cloud cover
  thickens and rain falls over the QPU Grid while noise events fire; the
  legend explains what it represents. Weather intensity derives from
  configured noise parameters (COMPUTED), never invents data.
- The camera never affects scientific state. Presets change presentation
  only.

## 4. Motion in the city: traffic, pedestrians, sound

### 4.1 Semantic rule

Vehicles and people may represent **instructions, jobs, or classical
messages — never amplitudes or quantum states**. Every animated entity class
appears in the in-app City Legend with: what it represents, what just
changed, why it moved, and its source/certainty classification.

### 4.2 Traffic

- **The job convoy** (semantic): a distinctive vehicle that carries the
  compiled program along the Processing Boulevard, arriving at each district
  exactly when the trace's playback tick enters that stage. Synchronized with
  the timeline and inspector; scrubbing the timeline repositions it.
- **Classical couriers** (semantic): courier vans that depart the Measurement
  Harbor when a measurement lands and drive to the Classical Control Center
  when a classical condition is evaluated (feed-forward). Their cargo label
  is the measured bit (EXACT within the sampled shot).
- **Ambient traffic** (illustrative): deterministic background cars on the
  road network and parked cars at curbs, so streets read as inhabited. The
  legend classifies ambient traffic as ILLUSTRATIVE city life; it pauses when
  reduced motion is requested.

### 4.3 Pedestrians

- District workers walk sidewalk loops near their district (illustrative),
  with density increasing in the district whose stage is active at the
  current tick (derived from the trace, COMPUTED activity, ILLUSTRATIVE
  motion paths). Individual figures are simple stylized human silhouettes —
  procedural, no third-party models.

### 4.4 Sound

- A procedural WebAudio engine (no audio assets): ambient bed per time of day
  (wind, low city hum, harbor gulls by day, crickets and distant hum at
  night), rain layer when noise weather is active, and short UI/semantic
  cues (gate tick, measurement chime, courier departure). Master volume and
  enable live in existing settings; audio stays **off by default** and the
  page never auto-plays before a user gesture.

### 4.5 Performance techniques

- Everything repeated is instanced (buildings, windows via facade textures,
  lamps, trees, vehicles, pedestrians, containers).
- Two-level LOD for buildings (full facade near, simplified massing far) and
  distance-based culling for props, driven by camera distance buckets.
- Frustum culling stays enabled; per-frame allocations in the render loop are
  prohibited; draw calls for the whole city stay bounded (target < 300).
- Quality presets map to pixel ratio, shadow resolution, LOD distances, and
  effect toggles so the mobile profile holds its frame-rate budget.

## 5. Semantic mapping and inspector synchronization

### 5.1 Stage-by-stage city behavior

Every pipeline stage has a visible, city-native behavior, synchronized with
the timeline tick and described in the inspector when its events are
selected:

| Stage | City behavior |
| --- | --- |
| Intake/parsing | Ship docks at Program Port; program crates unload; Foundry lights up as parse/normalize events fire |
| Layout | Logical-qubit banners raised at the Layout Exchange are assigned to physical pylon homes; the coupling map overlay mirrors the assignment |
| Routing | Route beacons light along the chosen path on the QPU Grid |
| SWAP insertion | The two affected pylons exchange their logical banners with a visible swap animation; the mapping table in the inspector updates at the same tick |
| Translation | Refinery columns vent as gates are recast; gate count deltas shown |
| Optimization | Works machinery runs; cancelled gates visibly removed from the metrics |
| Scheduling | Tower beacon sweeps; parallel lanes light simultaneously; conflicts (same-qubit overlap) never occur and the schedule panel proves it |
| Execution | Pylons and coupling bridges fire per gate on physical qubits |
| Noise | Weather over the QPU Grid per configured channels (depolarizing, amplitude damping, phase damping, readout) |
| Measurement | Containers craned onto the Harbor stacks; stack heights are the live counts histogram |
| Feed-forward | Courier van Harbor to Control Center; conditioned gate fires only when its classical condition held |
| Results | Observatory dome opens; ideal vs physical vs noisy compared in panels |

### 5.2 Logical vs physical identity

Logical qubits keep persistent identities (index, color, banner glyph)
distinct from physical qubits (pylon number). The current logical-to-physical
mapping at any tick is derived from layout and SWAP events up to that tick,
shown on pylon banners in 3D, in the coupling map overlay, and in the
inspector — all three derive from the same `WorldActivity` computation.

### 5.3 Inspector and timeline

The existing inspector/timeline remain the exact record: scrubbing to any
tick reproduces the city state for that tick deterministically (same trace,
same tick, same visuals). New city behaviors must derive from trace events
only, so this property is testable in `packages/world` without WebGL.

### 5.4 The City Legend

A dedicated, always-reachable Legend panel lists every animated entity class
with: metaphor meaning, trigger events, and source/certainty badge. Nothing
moves in the city that is not either (a) listed in the Legend, or (b) static
ambience explicitly classified ILLUSTRATIVE (e.g. trees in wind).

## 6. Cameras and input

- Modes: orbit (default), top-down, fly, and first-person walk at 1.7 m eye
  height with collision against buildings, props, and water. Walk speed is a
  brisk human pace; fly speed is moderate with altitude limits.
- All modes are smooth (damped input, no snapping except reduced-motion
  mode), and all are fully operable by touch (one-finger orbit/look,
  two-finger pinch zoom, on-screen joysticks in walk/fly), keyboard (WASD,
  arrows, Q/E, mode keys 1-4), and pointer.
- District fly-to transitions ease between camera poses; the tour drives the
  camera through the same API.

## 7. Child-friendly learning path

### 7.1 Onboarding

First launch offers a near-zero-reading start: a picture-based welcome with
three large illustrated buttons (Play a mission, Watch the city, Build a
circuit), animated arrows for the first three actions, and no wall of text.
Onboarding progress persists locally; it never blocks returning users.

### 7.2 Drag-and-drop circuit builder

A visual builder where gate tiles (H, X, Z, CX, measure — expanded set at
higher levels) are dragged onto qubit lanes; works with mouse and touch
(pointer events), supports undo/redo, reset, and removing tiles by dragging
away. The builder compiles to the same `Circuit`/OpenQASM path as the Lab —
no separate science. A one-tap "Bell pair" template exists for mission 1.

### 7.3 Missions

At least six playable missions with immediate feedback, each with a
machine-checkable completion condition evaluated against the real trace
(same mechanism as scenarios), a picture-forward briefing, contextual hints,
and a celebration state:

1. **Light Up the Twin Towers** (Bell pair, one-click template) — completable
   by a first-time learner from on-screen guidance alone.
2. **Three of a Kind** (GHZ) — extend entanglement to three qubits.
3. **The Long Way Around** (routing/SWAP) — run a circuit whose qubits are
   far apart and watch SWAP convoys; then pick a better layout.
4. **Storm Over the Grid** (noise) — run ideal vs noisy and spot the
   difference in the Harbor stacks.
5. **Message from the Docks** (feed-forward) — measurement steers a later
   gate via the courier.
6. **The Great Cleanup** (optimization) — watch redundant gates cancel and
   compare depth.
7. **Count on It** (shots/statistics) — few shots vs many shots and what
   certainty means.

Missions drive playback controls (pause, step, rewind) contextually and are
completable entirely by touch.

### 7.4 Explanation levels

A persistent setting selects **child / beginner / expert** explanation
levels. Event narration, mission text, tour chapters, inspector summaries,
and the Legend all provide level-appropriate prose (child level: short
concrete sentences, no jargon; expert level: current terminology). Scientific
labels (source/certainty) are never removed at any level — the child level
explains them as "measured for real / good guess / just a picture".

### 7.5 Assessment

An optional pre/post assessment (five picture-based multiple-choice
questions drawn from the mission concepts) runs before the first mission and
after the last; results are shown to the learner as growth (never a grade),
stored only locally, and exportable/clearable by the user.

## 8. Quality bars

### 8.1 Reviewer rubric

Independent adversarial review agents score the five WISER categories from
captured screenshots and interaction transcripts, each with written
rationale. Required: **every category at or above 4.5/5 with zero blocking
findings**, and every major finding fixed:

1. Visual fidelity (materials, lighting, coherence of the image)
2. Urban coherence (streets, blocks, scale, no floating/clipping/empty areas)
3. Semantic animation (motion means something; timeline sync exact)
4. Interaction clarity (controls discoverable; missions completable unaided)
5. Scientific honesty (metaphor boundaries; provenance visible; no
   quantum-state theater)

Reviews run for four specialist stances: art direction, quantum accuracy,
child UX/accessibility, and performance. Findings and scores are recorded in
`docs/audits/wiser-adversarial-reviews.md` with the screenshot evidence they
cite committed under `release-evidence/wiser-screenshots/`.

### 8.2 Performance and accessibility budgets

- Desktop (1920x1080, default quality): median FPS >= 50 across an orbit +
  street-level sampling run.
- Mobile emulation (Pixel-class viewport, CPU throttled): median FPS >= 30.
- Lighthouse: accessibility 100; performance >= 90 desktop, >= 75 mobile.
- Ten-minute production soak passes with zero uncaught errors and no
  unrecovered WebGL context loss.
- No console errors or WebGL errors in any E2E run.
- Initial JS budget may rise only with a recorded justification; total
  gzipped JS stays under the budget recorded in `tools/check-performance.ts`.

### 8.3 Screenshot evidence

Reviewed screenshot sets at 1920x1080 and mobile (portrait) for each of
day, golden hour, and night, at overview and street level (minimum 12
images), captured from the production build and committed under
`release-evidence/wiser-screenshots/` with a manifest binding them to the
source tree.

## 9. Evidence and completion

Completion requires `docs/wiser-acceptance-matrix.md` to be entirely `PASS`
with every row backed by a command, test, or evidence envelope;
`pnpm goal:check` enforces the matrix (a non-PASS row fails the gate) and
verifies the new envelopes (FPS benchmark, screenshot manifest, reviewer
scores) the same way it verifies existing evidence. Prose is never accepted
as evidence. The full existing gate — typecheck, lint, format, policy scans,
unit/integration, E2E across the browser matrix, Python cross-validation,
security, reproducibility, build, performance budgets, Lighthouse, soak,
mutation, fresh clone — continues to pass, and the documentation set
(README, educator/user guides, AI usage disclosure, licenses,
WISER demo script, limitations) is current at ship time.
