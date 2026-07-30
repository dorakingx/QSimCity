# Visual Quality Rubric

Scoring 1–5 per category. **Every category must score at least 4** and there
must be zero blocking defects.

Evidence: the 11 committed baselines in
`tests/e2e/visual.spec.ts-snapshots/`, inspected as images (not merely
generated) during review passes on 2026-07-30 and 2026-07-31.

## Scores

| Category | Score | Justification |
| --- | --- | --- |
| Composition | 4 | Camera frames the full 490-unit city span with no district cut off; the pipeline reads west→east, left→right, matching data flow. Fixed from 2 after the first review found the eastern half off-screen. |
| Visual hierarchy | 4 | Landmarks dominate their districts; labels float above the silhouette; the Scheduling Tower reads as the tallest structure; HUD sits at the edges and no longer occludes the QPU Grid. |
| Originality | 5 | Every mesh, icon, and the logo are generated procedurally from source in this repository. No third-party art, no game assets, no resemblance to protected branding. |
| District legibility | 4 | Twelve distinct accent colors paired with names, icons, and different architectural kits; districts are separable at skyline, street, and walking distance. |
| Semantic animation | 4 | Motion is meaningful: the job token tracks the pipeline stage, district plates pulse on activity, QPU pylons and bridges light for active qubits and gates, noise weather appears only with noise. Nothing decorative moves. |
| Interaction clarity | 4 | Camera-mode buttons show their shortcut keys; consoles prompt "press E" at walking distance; picking aligns with visible geometry; the Inspector opens on selection. |
| Typography | 4 | One family, consistent scale, strong contrast on dark and light backgrounds; labels are stroked for legibility against any district color. |
| Responsive quality | 4 | Mobile portrait and landscape baselines are clean; panels reflow to full width below 760px; the 2D grid collapses to one column below 1100px. |
| Polish | 4 | Consistent radii, spacing, and focus treatment; no clipped text, no texture or shader failures, no empty placeholders; console output clean across four browsers. |
| Scientific honesty | 5 | Certainty labels appear beside every number; the Provenance panel lists active simplifications; nothing animates quantum amplitudes as transported objects. |

**Minimum score: 4. No category is below 4.**

## Blocking defects

**Zero remaining.** Defects found by review and repaired:

| Defect | Severity | Resolution |
| --- | --- | --- |
| Eastern half of the city cut off; half the frame empty sky | Blocking | Reframed the default camera on the city centroid at a distance that fits the full span |
| Buildings read as tiny placeholder boxes against oversized district plates | Blocking | Scaled the architectural kits 2× (collision follows), tightened filler placement |
| Night sky rendered as flat black void | Blocking | Added starfield, ground survey grid, and deterministic window lights; raised night ambient |
| Day mode rendered almost entirely black | Blocking | The ground plane kept its night color; it now responds to time of day |
| Walk mode placed the camera outside the city facing away from it | Blocking | Entering first-person/fly now positions the viewer inside the city facing the current view |
| Inspector panel occluded the QPU Grid on arrival | Major | Inspector now opens on selection instead of by default |

## Adversarial visual review

A second pass, taken from the stance of a skeptical reviewer looking for
reasons to reject:

- *"Is this just colored boxes?"* — Partly, at the filler level: the kits are
  built from primitives. But each district uses a **different** part
  vocabulary (chimneys, cracking columns, cranes, domes, dishes, gantries,
  rail bridges) and a distinct named landmark, so districts are
  distinguishable without labels. Accepted at 4, not 5.
- *"Do the labels survive a busy skyline?"* — Labels are stroked, depth-test
  disabled, and positioned above the tallest structure per district. Verified
  in the night, day, and mobile-landscape baselines.
- *"Does anything mislead scientifically?"* — The only object that travels is
  the job token, which tracks the pipeline **stage**, not any amplitude. Noise
  is weather over the QPU district, not a substance flowing along roads.
  Confirmed in the adversarial scientific review (P8).
- *"Is the first impression competitive with the benchmark?"* — The night
  skyline with window lights, starfield, and district glow is comparable in
  ambition. QSimCity does not match a mature project's asset depth, which is
  why composition and legibility score 4 rather than 5. The claim made in
  `docs/reference-benchmark.md` is parity on first impression, not superiority.
- *"Any resemblance to protected branding?"* — None. No logotype, character,
  map, or interface element resembles any commercial game. The mark is an
  original circuit-triangle glyph.
