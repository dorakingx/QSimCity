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

**The last prose check.** One requirement was still satisfied by grepping the
final audit for the words "fresh clone" — the same defect in miniature.
`pnpm verify:fresh-clone` now clones the repository at HEAD into a temporary
directory, asserts that no `node_modules`, build output, or coverage leaked in
from the working tree, and runs fifteen steps inside that clone: install,
typecheck, lint, format, the three policy scans, the unit suite, coverage and
its gate, the security audit, the trace-reproducibility harness, the production
build, the performance budget, and the full end-to-end browser matrix. Each
step's exit status and duration go into an envelope the gate consumes.

**It immediately found a defect nothing else could.** Running the completion
gate inside a real clone failed on missing coverage evidence: `.gitignore`
carried an unanchored `coverage/` rule, which git applies at every depth, so
`release-evidence/coverage/` and `tools/coverage/check-coverage.ts` — the
coverage generator itself — had never been committed. Every local run passed
because those files existed on this machine. The rule is now anchored to the
repository root, the files are tracked, and the clone runs the coverage gate
rather than only the tests, so the same class of defect fails loudly next
time.

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

**Result: every criterion met** in the run the gate accepts. The exact figures
are in `release-evidence/soak/soak-report.json`, `heap-samples.csv`,
`console-events.json`, and `soak-summary.md` rather than restated here, because
a rerun reproduces the verdict, not the same numbers to three decimal places.

**The margin is thin, and one run failed.** Across the runs taken on this host
the trailing heap-growth ratio was 1.375, 1.424, 1.443, 1.571, and 1.462
against a limit of 1.5. The 1.571 run failed, and the completion gate refused
it — which is the mechanism working. That run was taken while the same machine
was driving browser verification of the live deployment and two Vercel
deployments, so the host was not idle, and its trailing third was a plateau
rather than a climb: median 36.7 MB then 36.5 MB, with the window minimum
falling from 25.0 MB to 23.6 MB. That is an explanation, not an excuse. The
threshold was not adjusted, the failing run's raw samples are kept in
`release-evidence/soak/recorded-failure/`, and the honest reading is that this
criterion sits close to the application's steady-state behaviour on this
hardware. Zero uncaught errors, zero console errors, and zero unrecovered
context losses held in every run; it is only the heap ratio that runs near its
limit, and a future regression there would be small enough to deserve
attention rather than a shrug.

## 3. Lighthouse (previously asserted, never measured)

`tools/lighthouse/run-lighthouse.ts` runs four targets (home and Accessible 2D,
desktop and mobile), three runs each, and scores the median so a single noisy
run cannot decide the verdict.

Thresholds: accessibility 100, best practices 95, SEO 90, performance 85
desktop / 75 mobile. **Result: every threshold met on every target.** The
scored medians are in `release-evidence/lighthouse/lighthouse-report.json`, and
all twelve raw run reports are kept alongside it. As with the soak, the numbers
live in the evidence because they are host-dependent; what is stable is the
verdict.

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

Measured: **96.4% (81 of 84 mutants killed) across 11 areas and 14 files**,
against a 70% threshold.

Two bugs in the tool itself were found and fixed while doing this, both of
which had made the earlier run meaningless:

- Mutants were generated with an index counted across all operators but applied
  with an index counted within one operator, so a mutant reported at
  `topology.ts:48` was actually applied at line 120 — a display coordinate.
  Every reported site now matches the site actually mutated.
- Trailing comments were treated as live code, so "surviving mutants" included
  edits to comment text such as `// U[0][1]`.

**Survivors must be reviewed, not tolerated.** The threshold alone would have
accepted nine unexamined survivors at 89.3%. A survivor is either a hole in the
tests or an equivalent mutant, and those are different facts, so the run now
fails unless every survivor is either killed or carries a written justification
in `REVIEWED_EQUIVALENT`. "Hard to test" is not a justification.

Fourteen survivors were killed by new tests across two rounds, including the
six found in the final review: the exact wording of out-of-range circuit
errors, the ZYZ decomposition boundary at exactly the diagonal tolerance,
composition of basis ops from their own gate definitions, the optimizer's need
for a second round when an rz cancellation exposes an earlier sx pair, distinct
and correct coupling-map coordinates for every device, and the exact UTF-8 byte
sequence emitted for each encoding class rather than merely distinct hashes.

Three survivors remain, all in the same category and all justified: each
extends a loop one iteration past the end of a `Float64Array`, where the read
yields `undefined` and the write is discarded by the language. No amplitude,
gate matrix, or noise scaling can change, so no test can distinguish them.

## 5. Per-package coverage

`tools/coverage/check-coverage.ts` enforces the thresholds per package rather
than in aggregate, where a well-covered package can hide a poorly covered one.

Core packages require 95% lines and 90% branches; the project requires 90% and
85%. **Result: every package above its threshold**, with the per-package
figures in `release-evidence/coverage/per-package-coverage.json`.

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

Measured: **0 JavaScript high/critical advisories, 0 Python high/critical
advisories, 0 secret-scan hits.**

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

**Performance evidence.** The performance budget wrote a bare report rather
than an envelope, so the gate would have consumed a number with no record of
what produced it or which source it measured. It now writes a full envelope
like every other measurement.

**Deep links 404'd in production, and a local test hid it.** The first real
deployment answered 404 for `/explore`, `/lab`, and every other route, while
the local production-equivalent server served them correctly. Two defects,
compounding:

- `vercel.json` used a negative-lookahead pattern to keep the SPA rewrite from
  shadowing assets. Vercel compiles `source` with path-to-regexp, not as a raw
  JavaScript regular expression, so the pattern matched nothing and no rewrite
  ever fired. The catch-all `/(.*)` is what Vercel documents, and it is safe
  because rewrites are applied only after the filesystem check.
- Correcting the pattern was not enough: a destination of `/index.html` still
  404'd. With `cleanUrls: true` that path is not servable — it redirects to
  `/` — and a rewrite whose target is itself a redirect does not resolve. The
  destination is now `/`. This second fault was only visible by deploying
  again and re-testing the live URL; reasoning about the config would not have
  found it, and neither would any local test.
- `tools/serve-production.ts` ended with an unconditional fallback to
  `index.html`. That made the rewrite configuration untestable: the shell was
  served whether or not any rule matched, so a configuration the real platform
  could not serve still looked healthy locally. The fallback is gone — an
  unmatched path now 404s — a test asserts that with an empty rewrite list, and
  the server resolves a directory destination to its index document the way
  Vercel does.

This is the clearest case in this work of a test that passed for the wrong
reason. No amount of rerunning it would have found the bug; only deploying
did.

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

Deployment was `NOT AUTHORIZED` throughout the hardening work and was
performed only after the owner authorized it explicitly. No account was
created and no DNS was changed: the existing authenticated Vercel session was
used, and the source was pushed to a private GitHub repository. The live
deployment is verified by direct checks against the public URL, and it
immediately found the routing defect described above.

## What this audit does not claim

- No real quantum hardware was used, and no measurement here says otherwise.
- The Lighthouse and soak figures are from this machine (macOS, Chromium via
  Playwright), which is why this document cites the verdict and points at the
  evidence for the numbers. Running the same commands elsewhere should
  reproduce the verdict, not the identical figures.
- Mutation score is a measure of test sensitivity in the scoped areas, not a
  proof of correctness.
- `sourceTreeHash` binds evidence to tracked source. Evidence generated with
  `--allow-dirty` is for local iteration and is refused by the release gate.
