# WISER Real-City Acceptance Matrix

Machine-checkable companion to `docs/WISER_REAL_CITY_SPEC.md`. Status values:
`PASS` or `PENDING`. `pnpm goal:check` fails while any row is `PENDING` (or
any unmet keyword appears), and independently verifies the evidence the rows
cite — a row cannot pass by prose alone.

Evidence column entries are commands, test files, or evidence envelopes under
`release-evidence/`; envelopes are bound to the source tree hash exactly like
all existing evidence.

## W1. Urban environment

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| W1.1 | Terrain heightfield: every building, road, prop, vehicle, and pedestrian sits on `terrainHeight(x,z)`; no floating or buried geometry | `packages/world/test/terrain.test.ts` grounding property test | PENDING |
| W1.2 | Water present at both waterfronts with quays and vessels; water level consistent with terrain | `packages/world/test/terrain.test.ts`; street/overview screenshots | PENDING |
| W1.3 | Hierarchical road network (boulevard, collector ring, local streets) with connected graph — every district reachable | `packages/world/test/roads.test.ts` connectivity test | PENDING |
| W1.4 | Every district subdivided into blocks/parcels; zero empty districts; parcels non-overlapping | `packages/world/test/blocks.test.ts` coverage + overlap tests | PENDING |
| W1.5 | Buildings vary: no two adjacent buildings share identical footprint, height, and facade style | `packages/world/test/architecture.test.ts` variation test | PENDING |
| W1.6 | Buildings meet the ground and do not intersect roads or each other | `packages/world/test/architecture.test.ts` collision/clearance tests | PENDING |
| W1.7 | Facade texture atlas generated procedurally and deterministically (same seed, same pixels) | `packages/visual-engine/test/facades.test.ts` determinism test | PENDING |
| W1.8 | At least three enterable interiors reachable in walk mode with consoles inside | `packages/world/test/interiors.test.ts`; walk-mode screenshot | PENDING |
| W1.9 | Street furniture (lamps, trees, benches, district props) present and instanced | `packages/world/test/props.test.ts`; draw-call budget in FPS report | PENDING |
| W1.10 | No `Math.random` in world layout or rendering paths | `packages/visual-engine/test/determinism.test.ts` source scan | PENDING |

## W2. Light, sky, atmosphere, weather

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| W2.1 | Three lighting presets (day, golden hour, night) selectable and persisted | `packages/ui/test/store.test.ts` time-of-day tests; screenshots x3 | PENDING |
| W2.2 | Sun shadows render in day and golden presets; night uses lamps/windows/headlights | `tests/e2e/visual.spec.ts` baselines per preset | PENDING |
| W2.3 | ACES tone mapping + PBR material families calibrated (no full-bright or pitch-black surfaces at any preset) | reviewer art-direction score; screenshots | PENDING |
| W2.4 | Sky dome with sun disc and clouds feeds environment map; water and glass reflect the current sky | `packages/visual-engine/test/sky.test.ts`; street-level screenshot | PENDING |
| W2.5 | Noise weather appears only when noise is configured/active and its intensity derives from configured parameters | `packages/world/test/weather.test.ts` derivation tests | PENDING |
| W2.6 | Camera and presets never mutate scientific state | `packages/visual-engine/test/engine-contract.test.ts` | PENDING |

## W3. Traffic, pedestrians, sound

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| W3.1 | Job convoy position is a pure function of (trace, tick) and arrives per stage exactly with the timeline | `packages/world/test/agents.test.ts` convoy sync tests | PENDING |
| W3.2 | Classical couriers depart on measurement and arrive for feed-forward evaluation, carrying the measured bit | `packages/world/test/agents.test.ts` courier tests | PENDING |
| W3.3 | Ambient traffic and pedestrians are deterministic, follow roads/sidewalks, and never represent quantum state | `packages/world/test/agents.test.ts`; City Legend entry | PENDING |
| W3.4 | Vehicles/people never depict amplitudes or quantum states anywhere | quantum-accuracy reviewer probe; Legend audit | PENDING |
| W3.5 | Procedural WebAudio engine: ambient bed per preset, rain layer, semantic cues; off by default; no autoplay before gesture | `packages/visual-engine/test/audio.test.ts`; settings tests | PENDING |
| W3.6 | Reduced-motion pauses ambient movement and disables camera easing | `packages/visual-engine/test/engine-contract.test.ts` | PENDING |

## W4. Semantic mapping and synchronization

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| W4.1 | All twelve stage behaviors of spec section 5.1 implemented and driven only by trace events | `packages/world/test/playback.test.ts` stage-behavior derivations | PENDING |
| W4.2 | Persistent logical-qubit identities distinct from physical qubits; mapping at tick derived from layout+SWAP events | `packages/world/test/mapping.test.ts` (property: matches compiler final layout) | PENDING |
| W4.3 | SWAP events visibly exchange logical banners between pylons at the same tick the inspector updates | `packages/world/test/mapping.test.ts`; E2E swap scenario | PENDING |
| W4.4 | Harbor container stacks equal live measured counts at every tick | `packages/world/test/playback.test.ts` histogram derivation | PENDING |
| W4.5 | Scrubbing to any tick reproduces identical city state (pure derivation, no hidden animation state affecting meaning) | `packages/world/test/playback.test.ts` determinism test | PENDING |
| W4.6 | City Legend lists every animated entity class with meaning, trigger, and source/certainty badge | `packages/ui/test/components.test.tsx` legend completeness test | PENDING |
| W4.7 | Ideal vs physical vs noisy remain three labelled result classes throughout | existing `physical-execution.test.ts` + results UI tests | PENDING |

## W5. Cameras and input

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| W5.1 | Orbit, top, fly, and 1.7 m walk modes all smooth (damped) and collision-safe | `packages/visual-engine/test/cameras.test.ts` | PENDING |
| W5.2 | Full touch operation: orbit/pinch plus on-screen controls for walk/fly | `tests/e2e/mobile.spec.ts` touch tests | PENDING |
| W5.3 | Full keyboard operation for all modes | `tests/e2e/smoke.spec.ts` keyboard test; cameras tests | PENDING |

## W6. Child-friendly learning path

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| W6.1 | Picture-based first-run onboarding with three illustrated entries; persists; never blocks return visits | `packages/ui/test/onboarding.test.tsx`; E2E first-run test | PENDING |
| W6.2 | Drag-and-drop circuit builder (mouse + touch), undo/redo/reset, compiles through the standard pipeline | `packages/ui/test/builder.test.tsx`; E2E touch builder test | PENDING |
| W6.3 | One-click Bell mission template | mission-1 E2E test | PENDING |
| W6.4 | Pause/step/rewind/undo/reset contextual controls in missions | `packages/ui/test/missions.test.tsx` | PENDING |
| W6.5 | At least six playable missions with machine-checkable completion and immediate feedback | `packages/ui/test/missions.test.tsx` (every mission completes against a real trace) | PENDING |
| W6.6 | Mission 1 completable by a first-time learner from on-screen guidance alone (no Qiskit knowledge) | `tests/e2e/missions.spec.ts` scripted naive-user walkthrough | PENDING |
| W6.7 | Child/beginner/expert explanation levels across narration, missions, tour, inspector, legend | `packages/ui/test/explanations.test.ts` completeness matrix | PENDING |
| W6.8 | Pre/post assessment (5 picture questions), local-only, growth-framed, clearable | `packages/ui/test/assessment.test.tsx` | PENDING |
| W6.9 | Missions and builder fully available in Accessible 2D mode | `tests/e2e/fallback.spec.ts` extension | PENDING |

## W7. Performance and stability

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| W7.1 | Desktop 1920x1080 median FPS >= 50 (orbit + street sampling run, production build) | `release-evidence/wiser-fps/fps-report.json` | PENDING |
| W7.2 | Mobile emulation median FPS >= 30 | `release-evidence/wiser-fps/fps-report.json` | PENDING |
| W7.3 | Lighthouse accessibility 100; performance >= 90 desktop, >= 75 mobile | `release-evidence/lighthouse/lighthouse-report.json` | PENDING |
| W7.4 | Ten-minute production soak passes | `release-evidence/soak/soak-report.json` | PENDING |
| W7.5 | Zero console/WebGL errors across the E2E browser matrix | E2E console tracking (all specs) | PENDING |
| W7.6 | JS size budgets hold (or a recorded, justified budget change) | `release-evidence/performance.json` | PENDING |

## W8. Evidence, reviews, documentation

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| W8.1 | Screenshot set: 1920x1080 + mobile for day/golden/night at overview + street (>= 12 images) from the production build | `release-evidence/wiser-screenshots/manifest.json` envelope | PENDING |
| W8.2 | Four adversarial specialist reviews (art direction, quantum accuracy, child UX/accessibility, performance) with written rationale citing screenshots | `docs/audits/wiser-adversarial-reviews.md`; `release-evidence/wiser-reviews/reviews.json` | PENDING |
| W8.3 | Five WISER categories each >= 4.5/5 with zero blocking findings; all major findings fixed | `release-evidence/wiser-reviews/reviews.json` envelope check | PENDING |
| W8.4 | Semantic-mapping tests and Playwright desktop/mobile/touch suites pass | `pnpm test` + `pnpm test:e2e` | PENDING |
| W8.5 | Visual regression baselines regenerated and reviewed for the new city | `tests/e2e/visual.spec.ts-snapshots/`; review note in audits doc | PENDING |
| W8.6 | Full gate green: typecheck, lint, format, policy scans, unit/integration/E2E, Python cross-validation, security, reproducibility, build, perf budgets, `pnpm goal:check` | command outputs in transcript; `release-evidence/goal-check.txt` | PENDING |
| W8.7 | Docs current: README, educator guide, user guide, AI usage disclosure, licenses/notices, WISER demo script, limitations | `pnpm goal:check` required-files + doc review | PENDING |
| W8.8 | Production deployment works (build output verified; deploy target documented) | `pnpm build`; `tools/test/vercel-config.test.ts`; deployment docs | PENDING |
