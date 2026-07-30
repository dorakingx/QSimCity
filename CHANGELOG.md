# Changelog

All notable changes to QSimCity are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-07-31

First production release.

### Added

**Scientific core**
- Deterministic exact statevector simulator (up to 12 qubits) with seeded
  sampling, running in a Web Worker with progress and cancellation.
- Gate set: `id x y z h s sdg t tdg sx sxdg rx ry rz p u cx cz cp swap ccx`,
  plus measurement, reset, barriers, and classical conditions.
- Noise channels by the quantum-trajectory method: readout error,
  depolarizing, amplitude damping, phase damping.
- OpenQASM 2.0 parser with line/column diagnostics, register broadcasting,
  user gate definitions, qelib1 macros, and hostile-input limits.
- QSimCity Reference Compiler: normalize, layout, routing with SWAP
  insertion, ZYZ basis translation, peephole optimization, ASAP scheduling —
  verified by unitary equivalence up to layout permutation and by executing
  compiled circuits end to end.

**QSimCity Trace**
- Versioned replay format with zod schema, cross-field invariants, migration,
  deterministic FNV-1a content hashing, and 32 MiB import safety limits.
- Byte-identical canonical JSON across TypeScript and Python.

**Qiskit bridge (optional)**
- Real Qiskit 2.5.1 preset-pass-manager capture, Aer ideal and noisy runs,
  reproducible sample-trace and cross-validation generation.
- Browser simulator cross-validated against Qiskit statevectors amplitude by
  amplitude and against Aer counts by total variation distance.

**Product**
- 3D quantum city: 12 functional districts, instanced rendering, orbit /
  top-down / fly / first-person cameras with collision, picking, day–night,
  window lights, semantic animation, and 16 in-world interactive consoles.
- Modes: Guided Tour (16 chapters), Explore, Quantum Lab, Compare,
  Accessible 2D.
- 12 scenarios with deterministic seeds and machine-checkable completion,
  including a real VQE loop (Variational Gridlock).
- Provenance and certainty labeling on every displayed value, with a
  simplifications panel.
- Import/export of `.qsimcity.json`, shareable sample URLs, command palette,
  inspector, timeline with pause/seek/step/speed.
- Installable PWA with verified offline startup; zero telemetry.

### Verification at release

- 662 TypeScript tests, 52 Python tests, 68 end-to-end tests across Chromium,
  Firefox, WebKit, and a mobile profile.
- Coverage 96.3% lines / 88.4% branches; mutation score 100% (16/16).
- axe-core WCAG 2.2 AA: zero violations on five surfaces.
- 11 visual-regression baselines; initial JavaScript 122.9 KiB gzip.
- Zero known dependency vulnerabilities.

### Not included in v1

Real-QPU submission, paid cloud authentication, pulse-level emulation,
fault-tolerance simulation, multiplayer, VR, accounts, and localization.
**No real quantum hardware was used**; all results are simulated and labeled.

### Deployment

Vercel-ready and locally validated against a production-equivalent server.
Not deployed: no deployment authorization was available in the build
environment, and no public URL exists.
