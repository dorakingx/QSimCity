# Comparative Visual Benchmark

Reference application (identified in docs/reference-benchmark.md): live deployment of its main branch, 220 commits, observed 2026-07-31.
Both products viewed at 1280x800. QSimCity captures are in this
directory; no reference asset is copied into this repository.

| Category | QSimCity | Reference | Notes |
| --- | --- | --- | --- |
| Initial visual impression | 4/5 | 4/5 | The reference has denser massing and terrain with water. QSimCity is interactive in about a second where the reference showed roughly 60 seconds of staged loading, and shows all twelve districts in one frame. |
| Skyline originality | 5/5 | 4/5 | Entirely procedural geometry with no third-party assets; each district kit produces a distinct silhouette. |
| District differentiation | 4/5 | 4/5 | Twelve accent-coloured plates with different part vocabularies and named landmarks; the reference uses roughly eight larger zones with denser interiors. |
| Long-distance readability | 4/5 | 4/5 | Every district is legible in one frame with labels floating above the silhouette. |
| Medium-distance data-flow clarity | 5/5 | 4/5 | Geography is the pipeline: west-to-east ordering matches processing order and the boulevard physically connects the stages. |
| First-person detail | 4/5 | 4/5 | Buildings loom at eye height and consoles are approachable; the reference has more street-level clutter. |
| Orbit camera | 4/5 | 4/5 | Drag-rotate, wheel zoom, clamped to city bounds. |
| Top-down camera | 4/5 | 4/5 | Plan view showing the whole pipeline layout. |
| Fly camera | 4/5 | 4/5 | Altitude control with bounds clamping. |
| Walking camera | 4/5 | 4/5 | Eye height 1.7 with AABB collision; entry always steps toward the built-up centre so the viewer is never stranded outside the city. |
| Day mode | 4/5 | 5/5 | QSimCity now has an atmospheric horizon, but the reference still has richer terrain including water. |
| Night mode | 5/5 | 3/5 | Window lights, starfield, and emissive district glow; the reference night mode is a dimmer variant of its day scene. |
| Touch and mobile presentation | 4/5 | 3/5 | Touch is verified in an automated mobile profile; the reference documents emulation-only testing. |
| Inspector integration | 5/5 | 4/5 | Selection shows role, live state, provenance, certainty, and jump-to-timeline actions. |
| Semantic animation | 5/5 | 4/5 | Every motion is trace-driven; nothing decorative moves and no amplitude is animated as transported cargo. |
| Loading presentation | 5/5 | 2/5 | QSimCity reaches an interactive city in about a second; the reference displayed a sequence of loading captions for roughly a minute before the city appeared. |
| Visual accessibility | 5/5 | 2/5 | A complete non-WebGL mode, axe-clean WCAG 2.2 AA, and never colour alone; the reference requires WebGL2. |
| Overall polish | 4/5 | 4/5 | Consistent design system, clean console across four browsers, no clipped or overlapping text. |

**Lowest QSimCity score: 4/5** (requirement: at least 4 in every category).
Ahead in 8 categories, level in 9, behind in 1.
