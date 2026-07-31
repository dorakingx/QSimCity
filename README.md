# QSimCity

**An explorable 3D quantum city driven by real computation traces.**

QSimCity turns the journey of a quantum program — parsing, layout, routing,
SWAP insertion, basis translation, optimization, scheduling, execution, noise,
measurement, and classical feedback — into a city you can fly over, walk
through, and interrogate. Every light in the city is driven by a real
computation trace, and every number on screen tells you how certain it is.

> QSimCity is an **unofficial, independent educational and research
> visualization project**. It is not produced, endorsed, sponsored, or
> approved by Electronic Arts, Maxis, IBM, or any quantum-hardware vendor.
> All artwork is original and generated procedurally from source.
>
> **No license has been selected yet**, so no reuse rights are granted.

![The quantum city at night](tests/e2e/visual.spec.ts-snapshots/city-night-chromium-darwin.png)

*The twelve districts along the processing boulevard, west to east: Program
Port through QPU Grid, with the Observatory on the southern hill.*

![Accessible 2D Mode](tests/e2e/visual.spec.ts-snapshots/accessible-2d-chromium-darwin.png)

*Accessible 2D Mode carries the complete workflow without any WebGL.*

## Start in 60 seconds

```bash
corepack enable pnpm && pnpm install && pnpm dev
```

Open the printed URL. No account, no server, no upload — everything runs in
your browser. Node.js 22.12+ is required (`.nvmrc` pins the tested version).

To try the production build instead:

```bash
pnpm build && pnpm --filter qsimcity-web preview
```

## What you can do

| Mode | What it is for |
| --- | --- |
| **Guided Tour** | 16 chapters walking the whole pipeline, each stating exactly how exact its claims are |
| **Explore** | Free navigation of the city; select districts, buildings, qubits, and consoles |
| **Quantum Lab** | Author or paste OpenQASM, configure shots/seed/device/noise, replay the run |
| **Compare** | Ideal vs noisy distributions, and pre- vs post-compilation circuits and metrics |
| **Accessible 2D** | The complete product with no 3D rendering at all |

Twelve scenarios ship with deterministic seeds: Bell State, GHZ State, Quantum
Teleportation, Grover Search, Quantum Fourier Transform, SWAP Storm, Bad
Initial Layout, Decoherence Weather, Readout Bias, Shot Drought, Dynamic
Feed-forward, and Variational Gridlock (a real VQE loop).

## Controls

| Input | Action |
| --- | --- |
| `1` `2` `3` `4` | Camera: orbit, top-down, fly, first-person walk |
| `W A S D` / arrows | Move (walk/fly) or pan (orbit) |
| Mouse drag / one-finger drag | Rotate the camera |
| Scroll / pinch | Zoom |
| `E` | Operate the nearby console (first-person) |
| `Space` | Play or pause the replay |
| `.` and `,` | Step forward / backward one tick |
| `Ctrl+K` or `/` | Command palette |
| `T` | Guided Tour · `I` Inspector · `?` Help · `Esc` close |

Every control is reachable by keyboard, and every chart has a table
alternative. See [docs/accessibility.md](docs/accessibility.md).

## Supported circuits and limits

- **Input**: OpenQASM 2.0 (`qreg`, `creg`, gate application with register
  broadcasting, custom `gate` definitions, `measure`, `reset`, `barrier`, and
  `if (creg == n)` classical control), plus bundled samples and imported traces.
- **Gates**: `id x y z h s sdg t tdg sx sxdg rx ry rz p u cx cz cp swap ccx`,
  plus the qelib1 macros `u1 u2 u3 cy ch crz cu1 rzz cswap`.
- **Limits**: exact statevector simulation up to **12 qubits**; up to 100,000
  shots; 512 KiB of program text; 32 MiB trace imports. The UI states these
  limits and explains them rather than failing silently.

## How certain is what you see?

Every event, metric, and visual carries a provenance classification, surfaced
as one of seven labels:

| Label | Meaning |
| --- | --- |
| `EXACT` | Computed exactly by the statevector simulator (to floating-point precision) |
| `COMPUTED` | Deterministic output of a real compiler or analysis pass |
| `SAMPLED` | Drawn from seeded random sampling; the seed reproduces it |
| `CALIBRATION` | Reported device calibration data with a source and timestamp |
| `MEASURED` | Imported from a real measurement record |
| `ESTIMATED` | Derived from a simplified model — a proxy, not a measurement |
| `ILLUSTRATIVE` | A visual teaching aid, not derived from computation |

The Provenance panel lists the generator, seed, input hash, package versions,
and every active simplification. QSimCity never claims to show the live
internal state of real hardware, and moving objects in the city are jobs,
instructions, classical messages, and measurement samples — never quantum
amplitudes. See [docs/scientific-accuracy.md](docs/scientific-accuracy.md) and
[docs/scientific-source-ledger.md](docs/scientific-source-ledger.md).

## Scientific limitations

- The browser engine is an **exact statevector simulator** for small circuits,
  not a hardware emulator. There is no pulse-level modelling.
- Noise uses the **quantum-trajectory method**: each shot samples one Kraus
  branch. Ensemble statistics converge to the channel; one trajectory is one
  possible history, never "the" state.
- Gate durations in the schedule are **model values** for teaching
  instruction-level parallelism. They are not measurements of any real device,
  and replay pacing is separate presentation time.
- The **QSimCity Reference Compiler** is deliberately simple and deterministic.
  It is verified to preserve circuit semantics (unitary equivalence up to
  layout permutations) but does not reproduce Qiskit pass for pass.
- No real QPU is used anywhere in v1.

## QSimCity Trace

Every surface — 3D city, Accessible 2D Mode, Observatory, Compare Mode,
Guided Tour, scenarios — replays the same versioned trace format, so they can
never disagree. Traces export as `*.qsimcity.json` and re-import with full
schema validation. Format reference:
[docs/qsimcity-trace.md](docs/qsimcity-trace.md).

## Qiskit Bridge (optional)

The web application never requires Python. The optional bridge captures **real
Qiskit transpiler stages** and Aer results into QSimCity Traces:

```bash
cd python/qsimcity_qiskit
uv sync
uv run pytest
uv run qsimcity-generate traces --circuits-dir ../../examples/circuits --out ../../examples/traces
uv run qsimcity-generate crossval --circuits-dir ../../examples/circuits --out ../../examples/cross-validation/qiskit-results.json
```

The committed traces in `examples/traces/` were produced this way, and their
content hashes are verified from TypeScript on every test run. The browser
simulator is cross-validated against Qiskit statevectors amplitude by
amplitude, and against Aer counts by total-variation distance.

## Privacy

No accounts, no telemetry, no analytics, no uploads. Your program text never
leaves the browser (share links carry only bundled-sample ids and numeric
settings). Settings live in `localStorage` and can be erased from
Settings → "Clear locally stored data". See [docs/privacy.md](docs/privacy.md).

## Testing and verification

```bash
pnpm verify           # typecheck, lint, policy scans, unit + integration tests
pnpm test:coverage    # coverage with enforced thresholds
pnpm test:e2e         # Playwright: Chromium, Firefox, WebKit, mobile
pnpm test:mutation    # targeted mutation testing of the scientific core
pnpm verify:release   # everything above plus the production build and budgets
pnpm goal:check       # the full Definition-of-Done gate
```

Python bridge: `cd python/qsimcity_qiskit && uv run pytest`.

## Build and deployment

```bash
pnpm build   # static output in apps/web/dist
```

The canonical deployment target is **Vercel** (`vercel.json` pins the build,
install, output directory, SPA rewrites, security headers, and cache policy),
but the output is a plain static bundle portable to any standards-compliant
static host — there are no serverless functions, databases, or vendor runtime
services. See [docs/deployment-vercel.md](docs/deployment-vercel.md).

## Assets and licenses

All 3D geometry, icons, the logo, and the PWA icons are original and generated
procedurally from source in this repository (`tools/make-icons.ts`,
`packages/world`, `packages/visual-engine`). No third-party art, audio, fonts,
maps, or branding is bundled. Runtime dependencies and their licenses are
recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

**No license has been selected**, and none was chosen on the owner's behalf
(see [ADR-0001](docs/adr/adr-0001-no-license-selection.md)). Until the owner
selects one, default copyright applies and **no reuse, redistribution, or
modification rights are granted**. The source is published for review and
evaluation only.

`LICENSE DECISION: OWNER REQUIRED`

## Documentation

[Product spec](docs/product-spec.md) ·
[Architecture](docs/architecture.md) ·
[Scientific accuracy](docs/scientific-accuracy.md) ·
[Source ledger](docs/scientific-source-ledger.md) ·
[Trace format](docs/qsimcity-trace.md) ·
[Accessibility](docs/accessibility.md) ·
[Performance](docs/performance.md) ·
[Privacy](docs/privacy.md) ·
[Deployment](docs/deployment-vercel.md) ·
[Visual rubric](docs/visual-quality-rubric.md) ·
[Acceptance matrix](docs/acceptance-matrix.md) ·
[Contributing](CONTRIBUTING.md) ·
[Security](SECURITY.md) ·
[Changelog](CHANGELOG.md)
