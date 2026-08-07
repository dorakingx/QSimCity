# Visual Quality Rubric

Scoring 1–5 per category. **Every category must score at least 4** and there
must be zero blocking defects. This rubric is the project's own assessment;
the independent scores that gate the WISER release come from four external
adversarial reviewers and are recorded in
`docs/audits/wiser-adversarial-reviews.md` with machine-checked thresholds
(minimum 4.5 per category, zero open blockers or majors — see
`tools/wiser/record-reviews.ts`).

Evidence: the 12 committed Playwright baselines in
`tests/e2e/visual.spec.ts-snapshots/` and the 15 evidence screenshots in
`release-evidence/wiser-screenshots/` (desktop and mobile at day, golden
hour, and night, at overview and street level, plus the Lab results,
City Legend, and Assignment Hall interior exhibits), inspected as images
during review passes through 2026-08-05.

## Scores

| Category | Score | Justification |
| --- | --- | --- |
| Composition | 4.5 | The overview frames a coastal city with a real skyline cluster, harbor, and farmland fringe; the pipeline still reads west→east along the Processing Boulevard. Street level frames a boulevard with lane markings, median trees, and lamps leading toward the tower cluster. |
| Visual hierarchy | 4.5 | The downtown cluster, Scheduling Tower, and Observatory dominate their skylines; district accent glow is subtle by day and legible at night; HUD chips sit at the frame edges. |
| Originality | 5 | Every mesh and texture is generated procedurally from source in this repository (hash-deterministic facades, computed starfield). No third-party art and no resemblance to protected branding. |
| District legibility | 4.5 | Districts differ by massing recipe (podium towers, office slabs, row blocks, industrial halls, tank farms, warehouses) and hand-authored landmarks, separable without reading a single label. |
| Urban coherence | 4.5 | A real road graph (arterials, collectors, local streets) subdivides blocks into parcels; buildings meet sidewalks; outskirts fade through housing, groves, and hedgerowed fields to the terrain — no floating geometry, no empty districts. |
| Semantic animation | 4.5 | Motion is meaningful and legend-documented: the convoy carries the job between stages, couriers carry classical messages, logical-qubit banners ride their physical pylons through SWAPs, harbor count stacks grow with measured shots, and weather appears only with noise. Ambient traffic is explicitly labeled ambience in the City Legend. |
| Interaction clarity | 4.5 | Camera chips show shortcut keys; consoles prompt at walking distance and rotate their screens toward the room door; the interior is genuinely enterable through its doorway; missions give immediate feedback; the Legend explains every moving class. |
| Typography | 4 | One family, consistent scale, stroked labels legible against any district color, dark and light backgrounds. |
| Responsive quality | 4.5 | Mobile portrait and landscape baselines are clean; the touch joystick and wrapped camera chips keep controls reachable; the Legend moved to the top-right on narrow screens after a reviewer flagged the overlap. |
| Polish | 4.5 | Terrain skirt and fog close the horizon; interiors are lit; no clipped text, placeholder boxes, or shader failures; console output clean across four browsers; a ten-minute production soak drives every mode without errors. |
| Scientific honesty | 5 | Certainty labels beside every number, partial mid-replay counts marked, the City Legend states what each moving thing represents and what it does not (nothing animates amplitudes or quantum states), and the ideal-vs-noisy comparison is reproducible against Qiskit. |

**Minimum score: 4. No category is below 4.**

## Blocking defects

**Zero remaining.** Defects found by review passes on the real-city rebuild
and repaired:

| Defect | Severity | Resolution |
| --- | --- | --- |
| Glass towers rendered near-black in daylight | Blocking | Lowered glass metalness, lightened palettes, raised hemisphere and environment light |
| Roads invisible from overview | Blocking | Fixed ribbon triangle winding that produced downward-facing normals |
| Horizon showed the terrain plate edge against sky | Major | Terrain skirt to ±2300 with fog matched to the horizon color per time of day |
| Night city too dark to read | Major | Raised night hemisphere light, window glow, lamp pools, and star size |
| Golden hour crushed the foreground | Major | Raised golden exposure and rebalanced fog to the horizon tint |
| Walk mode spawned inside facades | Major | Spawn snaps to the nearest arterial driving lane facing along the road |
| Mobile Legend button overlapped camera controls | Major | Legend moves to the top-right below 760 px; camera chips wrap |
| Interior rooms read unlit; console showed its back to the door | Major | Doorway-biased warm room light; interior consoles rotate toward the door |
| 3D remounts leaked ~11.5 MiB per view switch | Blocking (soak) | Input listeners abort on dispose and the WebGL context is force-released, so detached canvases no longer retain disposed engines |

## Adversarial visual review

The binding adversarial pass is run by AI agents, not by human or external
reviewers (see [`AI_USAGE.md`](AI_USAGE.md)): four separated reviewer stances
(art direction, quantum accuracy, child UX and accessibility, performance)
score the same five categories with cited screenshots in
`docs/audits/wiser-adversarial-reviews.md`, and `pnpm wiser:reviews` fails
the release gate if any category falls below 4.5 or any blocker or major
stays open. Questions a skeptical reviewer asks, answered from the current
evidence:

- *"Is this just colored boxes?"* — Massing is still primitive-based, but
  parcels carry varied recipes with procedural facades (lit-window bays,
  mullions, banding), landmarks are hand-authored, and the street level
  holds up with lane markings, crosswalks, lamps, trees, and interiors.
- *"Does anything mislead scientifically?"* — Everything that moves is
  classical: the convoy is the compiled job, couriers are classical
  messages, banners are logical-qubit identities. The City Legend states
  each mapping with source and certainty, on screen, one click away.
- *"Does it hold up on a phone?"* — Mobile baselines and evidence
  screenshots show the same city with a touch joystick, reachable chips,
  and 30+ FPS under 4x CPU throttle.
- *"Any resemblance to protected branding?"* — None. No logotype,
  character, map, or interface element resembles any commercial game.
