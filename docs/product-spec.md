# QSimCity Product Specification

QSimCity is an unofficial, independent, open-source educational and research
visualization project. It renders the full journey of a quantum program —
parsing, compilation, routing, execution, noise, measurement, and classical
feedback — as an explorable 3D city driven by real computation traces.

QSimCity is not produced, endorsed, sponsored, or approved by Electronic Arts,
Maxis, IBM, or any quantum-hardware vendor.

## Product principle

Make the internal journey of quantum computation explorable as a living city
whose behavior is driven by real computation traces and explicitly identified
models — not by decorative animation alone.

## Pillars

1. **Navigable 3D quantum city** — 12 functional districts arranged along the
   compile/execute pipeline; orbit, top-down, fly, and first-person cameras.
2. **Correct small-circuit simulator** — deterministic seeded statevector
   engine in a Web Worker, cross-validated against Qiskit.
3. **Visual quantum-compiler debugger** — layout, routing, SWAP insertion,
   basis translation, optimization, and scheduling as observable city events.
4. **Noise experimentation environment** — readout error, depolarizing,
   amplitude damping, phase damping, with causal chains visualized.
5. **Measurement-comparison tool** — ideal vs noisy, pre vs post compilation.
6. **Educational guided tour** — 16 chapters synchronized across 3D, 2D,
   timeline, and data panels.
7. **Reproducible QSimCity Trace player** — versioned `.qsimcity.json` format
   consumed identically by 3D, 2D, compare, and tour systems.
8. **Accessible 2D mode** — the complete core workflow without WebGL.
9. **Offline-capable PWA** — static, no backend, no accounts, no telemetry.
10. **Qiskit bridge** — optional local Python extension capturing real
    transpiler stages and Aer results into traces.

## Modes

| Mode | Purpose |
| --- | --- |
| Guided Tour | 16-chapter narrated walkthrough of the pipeline |
| Explore | Free navigation of the city with inspector |
| Quantum Lab | Author/import circuits, configure runs, replay traces |
| Compare | Side-by-side ideal/noisy and pre/post-compilation |
| Accessible 2D | Full workflow without 3D rendering |

## The 12 districts

City geography is a spatial architecture diagram; processing flows through
districts in pipeline order:

1. **Program Port** — OpenQASM input, samples, imported traces (stage: input)
2. **IR Foundry** — parsing, normalization, gate expansion
3. **Layout Exchange** — logical→physical mapping, initial layout
4. **Routing Transit** — coupling graph, route selection, SWAP insertion
5. **Translation Refinery** — basis-gate translation, decomposition
6. **Optimization Works** — cancellation, depth reduction
7. **Scheduling Tower** — instruction timing, parallelism, idle intervals
8. **QPU Grid** — physical qubits, coupling edges, active instructions
9. **Noise Atmosphere** — error rates and noise-model provenance
10. **Measurement Harbor** — shots, counts, uncertainty, comparisons
11. **Classical Control Center** — feed-forward, hybrid loops, VQE
12. **Observatory** — 2D circuit, coupling map, histograms, metrics, provenance

Each district performs a real product function, is selectable via pointer,
touch, and keyboard, and synchronizes with the Inspector, Tour, Trace, and
Accessible 2D Mode.

## The 12 scenarios

Bell State, GHZ State, Quantum Teleportation, Grover Search, Quantum Fourier
Transform, SWAP Storm, Bad Initial Layout, Decoherence Weather, Readout Bias,
Shot Drought, Dynamic Feed-forward, Variational Gridlock. Each ships with a
deterministic seed, expected causal chain, healthy/failure states, comparison
metrics, completion condition, reset, 2D support, tests, and provenance notes.

## Scientific honesty

Every event, metric, and visual carries a provenance classification
(`exact_simulation`, `sampled_simulation`, `qiskit_transpiler`, `qiskit_aer`,
`backend_calibration`, `measured_import`, `reference_compiler`, `estimated`,
`illustrative`) surfaced to users as certainty labels (EXACT, COMPUTED,
SAMPLED, CALIBRATION, MEASURED, ESTIMATED, ILLUSTRATIVE). No live-QPU
statevector claims; no amplitudes-as-cargo metaphors; estimated success
proxies are never called fidelity. See docs/scientific-accuracy.md.

## Out of scope for v1

Real-QPU job submission, paid cloud auth, pulse-level emulation,
fault-tolerance simulation, multiplayer, VR, accounts, server-side anything,
Japanese localization (architecture leaves room for later i18n).

## Deployment

Canonical target Vercel; core remains portable to any static host. Static
client-side app + PWA. No Vercel runtime services. See
docs/deployment-vercel.md.
