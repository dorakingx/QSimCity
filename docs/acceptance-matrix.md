# Acceptance Matrix

Status values: `PASS`, or `NOT AUTHORIZED` where the specification explicitly
permits it (external deployment only). Every required row below is `PASS`.

Last verified: 2026-07-31, commit on `feat/qsimcity-production-v1`.

## 24.1 Independence

| Item | Status | Evidence |
| --- | --- | --- |
| Independent repository/project directory | PASS | `docs/audits/current-state.md`; directory was empty at audit |
| No integration with the first prohibited project | PASS | `pnpm check:names` |
| No integration with the second prohibited project | PASS | `pnpm check:names` |
| No remaining legacy project naming | PASS | `pnpm check:names` |
| No benchmark-project code/asset copied | PASS | All geometry procedural (`packages/world`, `tools/make-icons.ts`); `docs/reference-benchmark.md` |
| No Electronic Arts or Maxis asset used | PASS | `THIRD_PARTY_NOTICES.md`; zero bundled art, fonts, or audio |
| No implied official affiliation | PASS | Disclaimer on the home screen, README, and notices |
| Original visual identity | PASS | `docs/visual-quality-rubric.md` originality 5/5 |

## 24.2 Language

| Item | Status | Evidence |
| --- | --- | --- |
| UI entirely English | PASS | `pnpm check:language`; visual review of all surfaces |
| Source comments English | PASS | `pnpm check:language` |
| Docs English | PASS | `pnpm check:language` |
| Tests named in English | PASS | `pnpm check:language` |
| CLI output English | PASS | Scanner and checker output reviewed |
| No unintended non-English text | PASS | `tools/check-language.ts` over all first-party source and docs |
| Automated language-policy check passes | PASS | `pnpm verify` |

## 24.3 Functional

| Item | Status | Evidence |
| --- | --- | --- |
| 12 districts work | PASS | `packages/world/test/world.test.ts`; every stage owned exactly once; browser review |
| 12 scenarios work | PASS | `packages/ui/test/scenarios.test.ts` — each meets its own completion condition |
| 16 tour chapters work | PASS | `packages/ui/test/content.test.ts`; E2E chapter navigation |
| Quantum Lab works | PASS | `tests/e2e/smoke.spec.ts`; `packages/ui/test/pipeline.test.ts` |
| Compare Mode works | PASS | E2E compare test; `components.test.tsx` |
| Accessible 2D Mode works | PASS | `tests/e2e/fallback.spec.ts` (full workflow with WebGL disabled) |
| OpenQASM input works | PASS | 74 parser tests; every sample parses under Qiskit too |
| Import/export works | PASS | E2E round-trip through the real UI, incl. malformed rejection |
| Timeline pause works | PASS | `store.test.ts`, `components.test.tsx`, E2E |
| Timeline seek works | PASS | `store.test.ts` clamping; E2E scrubber |
| Step forward works | PASS | `store.test.ts`; E2E |
| Step backward works | PASS | `store.test.ts`; E2E |
| Camera controls work | PASS | `packages/visual-engine/test/cameras.test.ts` (4 modes); browser review |
| Touch controls work | PASS | `cameras.test.ts` pinch/drag; `tests/e2e/mobile.spec.ts` |
| Collision works | PASS | `cameras.test.ts` — 400 steps of walking never enters a footprint |
| Day/night works | PASS | `instanced-city.test.ts` tone change; day and night baselines |
| Audio controls work | PASS | `components-branches.test.tsx` settings tests; off by default |
| Offline PWA behavior works | PASS | `tests/e2e/pwa.spec.ts` — reload offline, then a full run offline |
| WebGL fallback works | PASS | `tests/e2e/fallback.spec.ts`; context-loss handler |

## 24.4 Scientific

| Item | Status | Evidence |
| --- | --- | --- |
| Simulator cross-validated against Qiskit | PASS | `cross-validation.test.ts` — statevectors to 8 dp, counts by TVD |
| Reference compiler equivalence tested | PASS | `compile.test.ts` (unitary up to layout permutation, property-based) and `compiled-execution.test.ts` (67 end-to-end cases) |
| Real Qiskit transpiler traces generated | PASS | `python/.../transpile_capture.py`; `test_bridge.py`; committed traces |
| Ideal and noisy results generated | PASS | Aer runs in the bridge; browser ideal/noisy in `experiment.ts` |
| Every relevant visualization has provenance | PASS | Every trace event carries source + certainty; Inspector and panels display them |
| Simplifications visible | PASS | Provenance panel lists 6 active simplifications in-product |
| No misleading quantum representation | PASS | `docs/audits/adversarial-scientific-review.md` probe P8 |
| Scientific source ledger complete | PASS | `docs/scientific-source-ledger.md` — 25 claims, each with source and guarding test |
| Adversarial scientific review: zero blocking findings | PASS | 8 probes; 2 test gaps found and closed; no claim falsified |

## 24.5 Visual

| Item | Status | Evidence |
| --- | --- | --- |
| City is not placeholder boxes | PASS | 12 distinct architectural kits and named landmarks; rubric legibility 4/5 |
| Districts distinguishable at 3 distances | PASS | Skyline, street, and first-person baselines inspected |
| Visual-regression snapshots exist | PASS | 11 baselines in `tests/e2e/visual.spec.ts-snapshots/` |
| Visual rubric ≥4/5 in every category | PASS | `docs/visual-quality-rubric.md` — lowest score 4 |
| Day and night readable | PASS | `city-day` and `city-night` baselines |
| Desktop/mobile: no blocking defects | PASS | Mobile portrait and landscape baselines; all 6 blocking defects repaired |
| No unexpected console errors | PASS | Every E2E test asserts a clean console across 4 browser profiles |
| No blocking collision defect | PASS | `cameras.test.ts` walking test |
| Original visual identity | PASS | Procedural geometry and hand-authored mark |

## 24.6 Engineering

| Item | Status | Evidence |
| --- | --- | --- |
| TypeScript strict passes | PASS | `pnpm typecheck` clean under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Python type checking passes | PASS | `pyright` 0 errors, 0 warnings |
| ≥300 meaningful automated tests pass | PASS | 665 TypeScript unit/integration + 52 Python + 68 E2E |
| Coverage thresholds pass | PASS | 96.3% lines / 88.4% branches; per-package gates on the scientific core |
| Mutation threshold passes | PASS | 100% (16/16) — `release-evidence/mutation-report.json` |
| Production build passes | PASS | `pnpm build`; artifacts in `apps/web/dist` |
| E2E tests pass | PASS | 68 passed, 0 failed |
| Browser matrix passes | PASS | Chromium, Firefox, WebKit, mobile profile |
| Accessibility requirements pass | PASS | axe WCAG 2.2 AA zero violations on 5 surfaces; keyboard walkthrough |
| Performance budgets pass | PASS | 122.9 KiB initial JS gzip vs 320 KiB budget |
| No high/critical dependency vulnerability | PASS | `pnpm audit`: no known vulnerabilities (whole tree) |
| No blocking TODO/FIXME/placeholder | PASS | `pnpm check:todos` |
| Sample traces regenerable | PASS | Regenerated 8× identically; hashes verified from TypeScript |
| Fresh-clone reproduction passes | PASS | `docs/audits/final-release-audit.md` |
| `pnpm goal:check` passes | PASS | `release-evidence/goal-check.txt` |

## 24.7 Deployment

| Item | Status | Evidence |
| --- | --- | --- |
| Vercel canonical target | PASS | `vercel.json`; `docs/deployment-vercel.md` |
| vercel.json + deployment docs complete | PASS | 32 configuration assertions against the real build |
| Node and pnpm pinned | PASS | `.nvmrc`, `engines.node`, `packageManager` |
| Production build output verified | PASS | index.html, sw.js, manifest all present and served |
| Direct routing/refresh works | PASS | `/explore` returns the app shell; assets served directly |
| Security headers verified | PASS | CSP without unsafe-eval/inline scripts, HSTS, COOP/CORP, Permissions-Policy |
| Cache behavior verified | PASS | Immutable hashed assets; must-revalidate HTML and service worker |
| PWA verified in a Vercel-compatible environment | PASS | Manifest, registration, offline startup, offline run |
| Production-equivalent local smoke test passes | PASS | `tools/serve-production.ts` + `tools/test/vercel-config.test.ts` |
| Live deployment smoke test | NOT AUTHORIZED | No Vercel credentials or deployment authorization in this environment; no public URL is claimed |

## 24.8 Documentation

| Item | Status | Evidence |
| --- | --- | --- |
| Every required document exists | PASS | `pnpm goal:check` required-files check |
| README instructions followed in a fresh environment | PASS | Fresh clone: install from lockfile, verify, build — `docs/audits/final-release-audit.md` |
| Architecture docs match code | PASS | Boundary rules in `docs/architecture.md` are the rules ESLint enforces |
| Screenshots match current UI | PASS | README screenshots are the committed visual baselines, regenerated after the final visual pass |
| No unfinished feature described as complete | PASS | Lighthouse substitution, soak-test scope, and deployment status all recorded honestly |
| Independence/unofficial status stated | PASS | Home screen, README, notices |

## Recorded substitutions and residual risks

These are disclosed rather than hidden; none is a required-row failure.

1. **Lighthouse was not executed** (no runner available on the build host). The
   underlying categories are covered by stronger direct evidence — see
   `docs/performance.md`.
2. **A ten-minute soak test was not automated.** Structural mitigations are
   described in `docs/performance.md`; long-session memory growth is the main
   untested risk.
3. **Screen-reader testing** was performed against the accessibility tree
   (axe + role/name assertions), not with a specific commercial screen reader.
4. **External deployment is `NOT AUTHORIZED`** — the specification explicitly
   permits this, and no live URL is claimed anywhere.
