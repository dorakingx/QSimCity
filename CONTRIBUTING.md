# Contributing to QSimCity

## Setup

```bash
corepack enable pnpm
pnpm install
pnpm dev
```

Node.js 22.12+ is required; `.nvmrc` pins the tested version. The optional
Qiskit bridge needs Python 3.12 and `uv`:

```bash
cd python/qsimcity_qiskit && uv sync && uv run pytest
```

## Before opening a pull request

```bash
pnpm verify         # typecheck, lint, policy scans, unit + integration tests
pnpm test:e2e       # Playwright across Chromium, Firefox, WebKit, mobile
```

`pnpm verify:release` additionally runs coverage, the production build,
performance budgets, and mutation testing.

## Non-negotiable rules

1. **English only.** UI text, code, comments, identifiers, filenames, tests,
   and commit messages. An automated scan enforces this.
2. **Label your science.** Any new number, chart, or visual on screen must
   carry a provenance classification and certainty label. If you cannot
   justify the label, the feature is not ready.
3. **The trace is the backbone.** New behavior emits trace events; surfaces
   render from `(trace, tick)`. Do not animate from mutable simulator state.
4. **Respect the boundaries.** `domain`, `trace`, `simulator`, and
   `reference-compiler` must never import three.js or React. ESLint enforces
   this; see `docs/architecture.md`.
5. **2D parity.** Anything that can be learned in the 3D city must be
   obtainable in Accessible 2D Mode.
6. **No dead weight.** No `TODO`, `FIXME`, or placeholder markers — a scan
   fails the build. Finish it or leave it out.

## Testing expectations

- Scientific code (domain, trace, simulator, reference compiler) must hold
  **≥95% line and ≥90% branch coverage**; the project overall must hold
  ≥90%/85%. Thresholds are enforced, not advisory.
- Prefer tests that verify **meaning** over shape: unitary equivalence up to
  global phase, distributions compared by total variation distance, invariants
  checked with property-based tests (`fast-check`, Hypothesis).
- New scientific behavior should come with a mutation entry in
  `tools/mutation/run-mutation.ts` if it guards an invariant worth breaking.
- New UI needs an axe-clean surface and, where it renders data, a text
  alternative.

## Adding things

**A device topology**: `packages/domain/src/topology.ts`, mirrored in
`python/qsimcity_qiskit/src/qsimcity_qiskit/devices.py`. Tests verify
connectivity, edge normalization, and Python/TypeScript agreement.

**A scenario**: `packages/ui/src/scenarios/scenarios.ts` with a
machine-checkable `isComplete(trace)`. The scenario suite runs every entry
automatically — a scenario that cannot verify itself is not accepted.

**A tour chapter**: `packages/ui/src/tour/chapters.ts`. Every chapter must
answer all four questions (see, represents, exactness, why) and its exactness
statement must use the certainty vocabulary; a test enforces both.

**A gate**: `packages/domain/src/gates.ts`. The unitarity property test picks
it up automatically; add a translation path if the reference compiler must
emit it.

## Commits

Use imperative English subjects describing the change and its evidence.
Local commits should preserve logical units of work.
