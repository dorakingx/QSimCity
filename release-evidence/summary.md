# Release Evidence — QSimCity 1.0.0

Generated 2026-07-31 on macOS 15.6.1 (arm64), Node 22.23.1, pnpm 11.14.0,
Python 3.12 with uv.

## Artifacts in this directory

| File | Contents |
| --- | --- |
| `summary.md` | This document |
| `mutation-report.json` | Mutation testing score and per-mutant outcomes |
| `performance.json` | Chunk-level byte budgets from the real build |
| `goal-check.txt` | Full output of `pnpm goal:check` |
| `coverage-summary.json` | Copy of the coverage totals at release |

## Results

| Gate | Result |
| --- | --- |
| TypeScript strict typecheck | PASS |
| ESLint (incl. architecture boundaries) | PASS |
| Prohibited-name scan | PASS |
| Language-policy scan (English only) | PASS |
| Blocking-marker scan | PASS |
| TypeScript unit + integration tests | 665 passed |
| Python bridge tests | 52 passed |
| End-to-end tests (Chromium, Firefox, WebKit, mobile) | 68 passed |
| Line coverage | 96.29% (threshold 90%) |
| Branch coverage | 88.38% (threshold 85%) |
| Mutation score | 100.0%, 16/16 killed (threshold 70%) |
| Initial JavaScript (gzip) | 122.9 KiB (budget 320 KiB) |
| All JavaScript (gzip) | 297.1 KiB (budget 600 KiB) |
| axe-core WCAG 2.2 AA | 0 violations across 5 surfaces |
| Visual-regression baselines | 11 surfaces |
| Dependency audit | No known vulnerabilities |
| Production build | PASS |
| Vercel configuration verification | 32 assertions PASS |
| Fresh-clone reproduction | PASS |

## Scientific validation

- Browser simulator vs Qiskit `Statevector`: amplitude-by-amplitude agreement
  to 8 decimal places on 6 circuits, after fixing the unobservable global
  phase.
- Browser simulator vs Qiskit Aer counts: total variation distance below 0.05
  at 4096 shots per side.
- Reference compiler: unitary equivalence up to global phase and layout
  permutation, including property-based tests over random circuits on
  multiple topologies; zero leakage onto ancillas; all two-qubit gates on
  real coupling edges; all gates in the device basis.
- Compiled circuits executed end to end across 67 sample × device × layout
  combinations, with measured distributions matching the input circuit's.
- Sample traces regenerate byte-identically (verified 8 consecutive runs) and
  their content hashes are checked from TypeScript against the committed
  manifest.

## Deployment status

**NOT AUTHORIZED.** No Vercel credentials or deployment authorization were
available in this environment. QSimCity has **not** been deployed and **no
public URL exists**. The configuration was validated against the real build
output through a production-equivalent local server that applies the same
headers, caching, and routing rules.

## Real quantum hardware

**None was used.** Every result QSimCity displays is simulated, and each is
labeled with its provenance and certainty.
