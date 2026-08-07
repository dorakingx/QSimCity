# Comparative Visual Benchmark

Reference application (identified in docs/reference-benchmark.md): live deployment of its main branch, 220 commits, observed 2026-07-31.
Both products viewed at 1280x800. QSimCity captures are in this
directory; no reference asset is copied into this repository.

| Category | QSimCity | Reference | Notes |
| --- | --- | --- | --- |
| Initial visual impression | 4/5 | 4/5 | QSimCity now opens on a daylight coastal city with a connected street grid, varied massing, harbor cranes, and farmland fringe; the reference retains denser interiors. QSimCity is interactive in about a second versus roughly a minute of staged loading. |
| Skyline originality | 5/5 | 4/5 | Entirely procedural geometry and textures with no third-party assets; the downtown cluster, refinery columns, cranes, and hilltop dome give each district a distinct silhouette. |
| District differentiation | 4/5 | 4/5 | Twelve districts built from distinct architectural kits on real blocks (wharf sheds, sawtooth halls, tank farms, podium towers, data halls); the reference uses roughly eight larger zones with denser interiors. |
| Long-distance readability | 4/5 | 4/5 | The whole pipeline reads in one frame; architecture carries district identity with labels as reinforcement, hidden entirely at street level. |
| Medium-distance data-flow clarity | 5/5 | 4/5 | Geography is the pipeline: the Processing Boulevard physically connects the stages west to east, and the convoy, banners, couriers, and container stacks make the flow visible mid-run. |
| First-person detail | 4/5 | 4/5 | Lane markings, crosswalks, lamps, street trees, parked cars, console kiosks, and three furnished enterable interiors at 1.7 m eye height; the reference still has more incidental street clutter. |
| Orbit camera | 4/5 | 4/5 | Damped drag-rotate and wheel zoom, clamped to the city bounds. |
| Top-down camera | 4/5 | 4/5 | Plan view showing the whole pipeline layout and street network. |
| Fly camera | 4/5 | 4/5 | Altitude control with bounds clamping and touch lift buttons. |
| Walking camera | 4/5 | 4/5 | Eye height 1.7 m with AABB and doorway collision; entering walk mode snaps to the nearest driving lane facing along the road, so the walker always starts in a street with a clear view. |
| Day mode | 4/5 | 4/5 | Sun shadows, sky dome with clouds, coastal water with sky reflection, and a fog-closed horizon; parity with the reference terrain, which keeps an edge in interior density. |
| Night mode | 5/5 | 3/5 | Hash-varied lit windows, street lamps with light pools, vehicle headlights, stars, and district glow; the reference night mode is a dimmer variant of its day scene. |
| Touch and mobile presentation | 4/5 | 3/5 | Touch orbit/pinch, an on-screen movement pad for walk and fly, and a touch-only mission path verified in the automated mobile profile; the reference documents emulation-only testing. |
| Inspector integration | 5/5 | 4/5 | Selection shows role, live state, provenance, certainty, and jump-to-timeline actions; the City Legend classifies every animated entity. |
| Semantic animation | 5/5 | 4/5 | Convoy, couriers, logical banners, container stacks, weather, and stage set pieces all derive from the trace; ambient life is explicitly ILLUSTRATIVE and no amplitude is animated as cargo. |
| Loading presentation | 5/5 | 2/5 | QSimCity reaches an interactive city in about a second; the reference displayed a sequence of loading captions for roughly a minute before the city appeared. |
| Visual accessibility | 5/5 | 2/5 | A complete non-WebGL mode including missions and the builder, axe-clean WCAG 2.2 AA, and never colour alone; the reference requires WebGL2. |
| Overall polish | 4/5 | 4/5 | Consistent design system, clean console across four browsers, no overlapping controls after the adversarial art-direction pass. |

**Lowest QSimCity score: 4/5** (requirement: at least 4 in every category).
Ahead in 8 categories, level in 10, behind in 0.
