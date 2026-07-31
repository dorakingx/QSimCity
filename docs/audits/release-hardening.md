# Release hardening audit

Date: 2026-07-31. Scope: the six blocking findings that rejected the first
completion claim, plus everything the repair uncovered.

The first completion report was rejected because `pnpm goal:check` passed while
a mandatory requirement — the ten-minute soak — had never been executed. That
is the important fact about this audit: **the gate itself was the defect**. A
checker that can pass while a mandatory measurement is missing tells you
nothing about the product, so the checker was repaired before anything else was
touched, and every number below was produced by a command that exited zero and
wrote a machine-verified evidence envelope.

Commit `bc435eb` is treated as a release-candidate baseline only. Nothing from
the previous final report was carried forward as evidence; every claim here was
recomputed from the repository.

## 1. The completion checker

**Finding.** `goal:check` accepted prose. Requirements were satisfied by the
presence of a document that asserted they were met, so an unrun soak test and a
passing gate could coexist.

**Repair.** `tools/evidence.ts` defines an evidence envelope: the command that
ran, its tool version, its exit status, the thresholds it was judged against,
the measurements it produced, and a binding to the exact source that was
measured. `tools/check-goal.ts` now derives every mandatory verdict from these
envelopes. An envelope is refused when it is missing, empty, malformed, records
a non-zero exit, records `passed: false`, omits a required measurement, or does
not match the current source tree.

**Binding evidence to content, not to the commit.** The first repair bound each
envelope to `git rev-parse HEAD`. That is circular: committing the evidence
moves HEAD, which invalidates the evidence that was just produced, forever.
Envelopes now carry `sourceTreeHash` — the hash of the blob id of every tracked
file outside `release-evidence/`. Committing evidence does not change source
content, so evidence stays valid; changing a single source byte invalidates
every measurement. `commitSha` is retained for human traceability but is no
longer what the gate trusts. The gate also refuses any evidence while tracked
source has uncommitted changes, unless `--allow-dirty` is passed for local
iteration.

**Verification of the checker itself.** `tools/test/` exercises the refusal
paths: missing file, empty file, invalid JSON, missing envelope field, stale
source hash, non-zero exit, `passed: false`, and missing measurement each fail
the gate.

## 2. Ten-minute soak (previously never run)

`tools/soak/run-soak.ts` drives the production build in a real browser for a
full 600 seconds, cycling eight workloads: a Lab run, playback control
(pause/seek/step/speed), all four camera modes, a noise change with rerun,
Accessible 2D Mode, Compare Mode, a rotating scenario including Variational
Gridlock, and the guided tour. Heap is sampled throughout; console and page
errors are recorded rather than summarized.

Criteria: at least 600 s, zero uncaught errors, zero console errors, zero
unrecovered WebGL context losses, trailing heap growth ratio below 1.5 after a
60 s warm-up, and a final interaction under 3000 ms.

Measured: **600.3 s, 290 cycles, growth ratio 1.443, 0 uncaught errors, 0
console errors, 0 unrecovered context losses.** Artifacts: `soak-report.json`,
`heap-samples.csv`, `console-events.json`, `soak-summary.md`.

## 3. Lighthouse (previously asserted, never measured)

`tools/lighthouse/run-lighthouse.ts` runs four targets (home and Accessible 2D,
desktop and mobile), three runs each, and scores the median so a single noisy
run cannot decide the verdict.

Thresholds: accessibility 100, best practices 95, SEO 90, performance 85
desktop / 75 mobile. Measured: **desktop performance 100, mobile performance
84, accessibility 100, best practices 96, SEO 91.** All twelve raw run reports
are kept alongside the summary.

One dependency problem surfaced here and was fixed rather than worked around:
`intl-messageformat` has an undeclared runtime dependency on `tslib`, which
pnpm's isolated store correctly hid. `pnpm-workspace.yaml` now declares
`publicHoistPattern: [tslib]`.

## 4. Mutation testing scope

**Finding.** Sixteen mutants across roughly 13,400 lines is a demonstration,
not a measurement.

**Repair.** `tools/mutation/run-mutation.ts` is now generative: it enumerates
mutation sites from the source with six operators (comparison, arithmetic,
boolean literal, logical, negation, numeric literal) across eleven named
scientific areas — gate evolution, indexing and endianness, measurement
collapse and reset, noise channels, layout/routing/SWAP, compiler equivalence,
global-phase comparison, topology, trace validation, trace canonicalization,
and seeded randomness. Exclusions are declared with reasons in
`tools/mutation/scope.ts` and published in `scope-manifest.json`.

Measured: **89.3% (75 of 84 mutants killed) across 11 areas and 15 files**,
against a 70% threshold.

Two bugs in the tool itself were found and fixed while doing this, both of
which had made the earlier run meaningless:

- Mutants were generated with an index counted across all operators but applied
  with an index counted within one operator, so a mutant reported at
  `topology.ts:48` was actually applied at line 120 — a display coordinate.
  Every reported site now matches the site actually mutated.
- Trailing comments were treated as live code, so "surviving mutants" included
  edits to comment text such as `// U[0][1]`.

The nine survivors were not waived. Each was killed by a new test with pinned
expected values: RNG output vectors, exact `grid-3x3` edge lists and neighbor
ordering, route-versus-SWAP event distinctions, translation and cancellation
guards, scheduling tick sharing, multi-round optimization, noisy zero-clbit
execution, skipped conditioned measure/reset, and UTF-8 byte-length classes in
canonical hashing.

## 5. Per-package coverage

`tools/coverage/check-coverage.ts` enforces the thresholds per package rather
than in aggregate, where a well-covered package can hide a poorly covered one.

Core packages require 95% lines and 90% branches; the project requires 90% and
85%. Measured: **domain 98.48/95.51, trace 97.58/95.87, simulator 100/97.07,
reference-compiler 97.64/90.40, project 96.29/88.38.**

## 6. Trace hashing: semantic, artifact, and preserved telemetry

**Finding.** The Qiskit transpiler pass sequence had been deleted from captured
traces. Deleting the nondeterministic data manufactures determinism; it does
not demonstrate it.

**Repair.** The pass sequence is captured again in
`transpile_capture.py` and stored under a `telemetry` field, and hashing is
split in two:

- `semanticHash` covers reproducible scientific content — circuits, layout,
  routing, metrics, results, events — and excludes `traceId`, `createdAt`, and
  `telemetry`. This is the reproducibility contract.
- `artifactHash` covers the exact serialized bytes of one file, including
  telemetry. This detects tampering with a specific artifact.

Both are implemented twice, in `packages/trace/src/hashing-contract.ts` and in
`trace_model.py`, and the Python encoder reproduces ECMAScript number
formatting exactly so the two languages agree byte for byte.

`tools/trace-reproducibility/run-reproducibility.ts` measures three separate
claims: twelve fully independent Node processes across three circuits must
agree on the semantic hash; the hash must still change when the seed changes
(a hash that ignored the seed would also be "stable"); and TypeScript must
reproduce the Python-generated manifest for every committed sample. Measured:
**12 processes, 1 distinct semantic hash per circuit, seed-sensitive, 5 of 5
committed samples verified, 5 carrying real transpiler telemetry.**

Telemetry independence is asserted on real committed artifacts: adding a pass
name to a trace's telemetry must leave `semanticHash` unchanged and must change
`artifactHash`.

**A test that could not have held.** Repairing this exposed a Python test
asserting that a regenerated manifest equals the committed one. Because every
generated trace carries a fresh `traceId` and `createdAt`, its `artifactHash`
differs by design, so the assertion was wrong in kind rather than in value. It
now checks what each hash actually promises: regeneration reproduces
`semanticHash`, and the committed bytes reproduce `artifactHash`.

## 7. Visual comparison

Recorded in [visual-benchmark-final.md](visual-benchmark-final.md).

## Additional findings during hardening

**Security.** `tools/security/run-security-audit.ts` runs `pnpm audit`,
`pip-audit` over the locked Python environment, and a repository-wide secret
scan, and records all three in one envelope. A tool that cannot run is a
failure, not a pass: an unreachable registry, a missing `uv`, or a dependency
pip-audit could not resolve all fail the gate rather than silently reporting
zero. The only expected skip — the local bridge package, which has no PyPI
record — is named explicitly in the tool.

This found a real advisory the previous release missed: `pytest 8.4.2` is
affected by PYSEC-2026-1845 (CVE-2025-71176), fixed in 9.0.3. The dependency
was upgraded rather than excused; the bridge suite passes on pytest 9.

Measured: **0 JavaScript high/critical, 0 Python high/critical across 47
audited packages, 0 secret-scan hits.**

**Formatting.** `pnpm format` had never passed: the repository declared a
Prettier script but shipped no Prettier configuration, so the check ran against
defaults that contradicted the committed style. A configuration matching the
existing code (single quotes, 100-column width) is now committed, along with an
ignore file that excludes hand-wrapped prose and the byte-pinned trace
artifacts — reformatting those would break the artifact hashes that verify
them. Code files were formatted once to make the script honest, and `pnpm
format` is now part of `pnpm verify` so it stays that way. This is formatting
only; the full suite, the mutation run, and the end-to-end tests were rerun
afterwards.

**Repository hygiene.** Hypothesis's local example cache had been committed by
accident; it is now ignored and untracked.

## Licensing

No `LICENSE` file exists, and none was selected on the owner's behalf. Until
one is chosen, default copyright applies and no reuse rights are granted, so no
document, UI string, or package description describes QSimCity as an
open-source project. `goal:check` enforces this against README.md,
docs/product-spec.md, CLAUDE.md, and CONTRIBUTING.md, and relaxes automatically
once a license file appears. The end-to-end suite asserts the same for rendered
UI text. See [ADR-0001](../adr/adr-0001-no-license-selection.md).

`LICENSE DECISION: OWNER REQUIRED`

## Deployment

`NOT AUTHORIZED`. The application is not deployed. `vercel.json` is verified
against the real build output by a hermetic test, but no account was created,
no DNS was changed, and no deployment was performed. Deployment remains a
non-blocking item awaiting the owner's authorization.

## What this audit does not claim

- No real quantum hardware was used, and no measurement here says otherwise.
- The Lighthouse and soak numbers are from this machine (macOS, Chromium via
  Playwright). They are reproducible by running the same commands, not
  universal constants.
- Mutation score is a measure of test sensitivity in the scoped areas, not a
  proof of correctness.
- `sourceTreeHash` binds evidence to tracked source. Evidence generated with
  `--allow-dirty` is for local iteration and is refused by the release gate.
