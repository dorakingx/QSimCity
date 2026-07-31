# Changelog

All notable changes to QSimCity are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] — 2026-07-31

Scientific integration. The pipeline now executes the circuit it compiled.

### Fixed

- **Compilation had no effect on any result.** The production pipeline
  compiled the circuit and then simulated the *logical* one, so device
  topology, initial layout, routing, inserted SWAPs, basis translation, and
  optimization changed no number and no execution event — a deliberately bad
  layout produced output identical to a good one. Execution now runs
  `compileResult.compiled`.
- **The QPU Grid lit pylons for logical qubits.** `activityAtTick` fell back to
  `logicalQubits` whenever an event carried no physical ones, which is a
  different qubit under any non-trivial layout and a coupling edge that need
  not exist on the device.
- **SWAP Storm and Bad Initial Layout stopped at a metric.** Both ran with
  noise disabled, so inserted SWAPs were counted but never executed. They now
  run with two-qubit noise and complete only when the routed circuit actually
  ran and its noisy result differs from its ideal one.
- **HomeView nested a second `main` landmark** inside the shell's, leaving an
  ambiguous skip-link target on the home screen.

### Added

- Three separated result classes in the trace and the UI: logical reference
  (what the program means), physical ideal (whether compilation preserved it),
  and physical noisy (what the device did to the circuit that ran).
- Trace schema 1.1.0, by addition only: 1.0.0 documents stay valid and
  byte-stable, because rewriting their version on load would change the
  content hash of every committed artifact.
- `pnpm python:verify`: uv sync, ruff check, ruff format, pyright, and pytest,
  recording exact counts from pytest's JUnit report. It is mandatory in
  `verify:release`, in the fresh-clone run, and in `goal:check`. The gate
  previously counted Python test *definitions* by reading files, which says
  nothing about whether they ran.
- A test asserting exactly one `main` landmark in every mode.
- Canonical, Open Graph, and social-card metadata, served from this origin
  only — no third-party asset, no external runtime dependency.

## [1.0.1] — 2026-07-31

Release hardening. The 1.0.0 completion claim was rejected because the
completion gate passed while a mandatory measurement had never run. The gate
was rebuilt first; every other change below is a measurement that had been
asserted rather than taken, or a defect that taking it exposed.

### Changed

- **Completion gate rebuilt on evidence envelopes.** Every mandatory verdict
  now comes from a machine-readable envelope recording the command, tool
  version, exit status, thresholds, and measurements. Prose is never accepted.
  Envelopes bind to a hash of the tracked source rather than to `HEAD`, which
  removes the regress where committing evidence invalidated it.
- **Mutation testing is generative** across eleven scientific areas (84
  mutants, 96.4%) instead of sixteen hand-written mutants, and a surviving
  mutant must now be killed or justified in writing as equivalent — the run
  fails while any survivor is unreviewed. Two defects in the
  mutation tool itself were fixed: mutants were applied at different sites than
  they were reported at, and trailing comments were treated as live code.
- **Trace hashing split** into `semanticHash` (reproducible science) and
  `artifactHash` (exact bytes), with Qiskit transpiler pass telemetry restored
  and excluded from the semantic hash rather than deleted.
- **Coverage is gated per package**, not in aggregate.
- **`pytest` upgraded to 9.0.3** to clear PYSEC-2026-1845 (CVE-2025-71176).
- **Licensing resolved.** No license was selected on the owner's behalf; when
  the owner authorized publication they chose **Apache License 2.0**, matching
  the reference application. `LICENSE` holds the canonical Apache-2.0 text with
  this project's own copyright holder, alongside a `NOTICE` file. The gate's
  license check inverted rather than switching off: with a license present, the
  documentation must name the license the file actually grants.
- **Prettier configuration committed** so `pnpm format` passes; it is now part
  of `pnpm verify`. Hand-wrapped prose and byte-pinned trace artifacts are
  excluded, because reformatting the latter would break their artifact hashes.

### Added

- Ten-minute production soak (`pnpm soak`): a full 600 seconds across eight
  rotating workloads, with heap sampling and zero tolerated errors.
- Lighthouse gate (`pnpm lighthouse`): four targets, three runs each, median
  scored against thresholds for performance, accessibility, best practices,
  and SEO.
- Security evidence (`pnpm security:audit`): `pnpm audit`, `pip-audit`, and a
  repository secret scan in one envelope; a tool that cannot run fails rather
  than reporting zero.
- Trace reproducibility evidence (`pnpm repro:check`): twelve independent
  processes, seed sensitivity, and cross-language verification of every
  committed sample against the Python-generated manifest.
- Automated fresh-clone verification (`pnpm verify:fresh-clone`): clones the
  repository at HEAD, refuses any leakage of `node_modules`, build output, or
  coverage from the working tree, and runs the full verification suite inside
  the clone. The gate consumes its envelope instead of grepping an audit
  document for the words "fresh clone".
- Tests for the evidence reader's refusal paths — missing, empty, malformed,
  stale, failed, and incomplete envelopes — because the reader is what every
  mandatory verdict now depends on.
- Comparative visual benchmark against the reference application over eighteen
  categories, with three real visual deficits fixed as a result: an
  atmospheric horizon, denser district interiors, and a walk-mode entry that
  no longer strands the viewer outside the city.

### Fixed

- Deep links returned 404 in production, twice over. The SPA rewrite used a
  negative-lookahead `source`, which Vercel compiles with path-to-regexp
  rather than as a regular expression, so no rewrite ever fired; and with
  `cleanUrls` enabled, a destination of `/index.html` is a redirect rather
  than a servable file, so the corrected pattern still 404'd until the
  destination became `/`. The local production-equivalent server had masked
  both with an unconditional fallback to `index.html`, making the rewrite
  configuration untestable; it now mirrors Vercel's filesystem-then-rewrite
  order, resolves directory destinations the same way, and 404s an unmatched
  path.
- A Python test asserted that regenerated traces reproduce the committed
  `artifactHash`, which cannot hold because each generated trace carries a
  fresh id and timestamp. It now checks what each hash actually promises.
- Vercel configuration tests build into a temporary directory instead of
  depending on a previously built `apps/web/dist`.
- Hypothesis's local example cache is no longer committed.
- An unanchored `coverage/` ignore rule matched at every depth, so the coverage
  generator and its evidence had never been committed; every local run passed
  because the files existed on the author's machine. Found by running the
  completion gate inside a real clone.

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
Not deployed at the time of this release: no deployment authorization was
available in the build environment. Deployment was authorized and performed
later; see the 1.0.1 entry and `docs/deployment-vercel.md`.
