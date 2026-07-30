# Acceptance Matrix

Status values: `PASS`, `FAIL`, `BLOCKED`, `UNVERIFIED`, `NOT RUN`, `PARTIAL`,
`PLACEHOLDER`, `NOT AUTHORIZED` (external-authorization items only).
Completion requires every required row `PASS` (or `NOT AUTHORIZED` where the
spec explicitly permits it).

## 24.1 Independence

| Item | Status | Evidence |
| --- | --- | --- |
| Independent repository/project directory | PASS | docs/audits/current-state.md |
| No integration with the first prohibited project | NOT RUN | prohibited-name scan |
| No integration with the second prohibited project | NOT RUN | prohibited-name scan |
| No remaining legacy project naming | NOT RUN | prohibited-name scan |
| No benchmark-project code/asset copied | PASS | procedural assets only; docs/reference-benchmark.md |
| No EA/Maxis asset used | PASS | procedural assets only |
| No implied official affiliation | NOT RUN | README + UI review |
| Original visual identity | NOT RUN | visual review |

## 24.2 Language

| Item | Status | Evidence |
| --- | --- | --- |
| UI entirely English | NOT RUN | language scan + review |
| Source comments English | NOT RUN | language scan |
| Docs English | NOT RUN | language scan |
| Tests named in English | NOT RUN | language scan |
| CLI output English | NOT RUN | language scan |
| No unintended Japanese text | NOT RUN | tools/check-language.ts |
| Automated language-policy check passes | NOT RUN | pnpm goal:check |

## 24.3 Functional

| Item | Status | Evidence |
| --- | --- | --- |
| 12 districts work | NOT RUN | |
| 12 scenarios work | NOT RUN | |
| 16 tour chapters work | NOT RUN | |
| Quantum Lab works | NOT RUN | |
| Compare Mode works | NOT RUN | |
| Accessible 2D Mode works | NOT RUN | |
| OpenQASM input works | NOT RUN | |
| Import/export works | NOT RUN | |
| Timeline pause works | NOT RUN | |
| Timeline seek works | NOT RUN | |
| Step forward works | NOT RUN | |
| Step backward works | NOT RUN | |
| Camera controls work | NOT RUN | |
| Touch controls work | NOT RUN | |
| Collision works | NOT RUN | |
| Day/night works | NOT RUN | |
| Audio controls work | NOT RUN | |
| Offline PWA behavior works | NOT RUN | |
| WebGL fallback works | NOT RUN | |

## 24.4 Scientific

| Item | Status | Evidence |
| --- | --- | --- |
| Simulator cross-validated against Qiskit | NOT RUN | |
| Reference compiler equivalence tested | NOT RUN | |
| Real Qiskit transpiler traces generated | NOT RUN | |
| Ideal and noisy results generated | NOT RUN | |
| Every relevant visualization has provenance | NOT RUN | |
| Simplifications visible | NOT RUN | |
| No misleading quantum representation | NOT RUN | |
| Scientific source ledger complete | NOT RUN | |
| Adversarial scientific review: zero blocking findings | NOT RUN | |

## 24.5 Visual

| Item | Status | Evidence |
| --- | --- | --- |
| City is not placeholder boxes | NOT RUN | |
| Districts distinguishable at 3 distances | NOT RUN | |
| Visual-regression snapshots exist | NOT RUN | |
| Visual rubric ≥4/5 in every category | NOT RUN | |
| Day and night readable | NOT RUN | |
| Desktop/mobile layouts: no blocking defects | NOT RUN | |
| No unexpected console errors | NOT RUN | |
| No blocking collision defect | NOT RUN | |
| Original visual identity | NOT RUN | |

## 24.6 Engineering

| Item | Status | Evidence |
| --- | --- | --- |
| TypeScript strict passes | NOT RUN | |
| Python type checking passes | NOT RUN | |
| ≥300 meaningful automated tests pass | NOT RUN | |
| Coverage thresholds pass | NOT RUN | |
| Mutation threshold passes | NOT RUN | |
| Production build passes | NOT RUN | |
| E2E tests pass | NOT RUN | |
| Browser matrix passes | NOT RUN | |
| Accessibility requirements pass | NOT RUN | |
| Performance budgets pass | NOT RUN | |
| No high/critical dependency vulnerability | NOT RUN | |
| No blocking TODO/FIXME/placeholder | NOT RUN | |
| Sample traces regenerable | NOT RUN | |
| Fresh-clone reproduction passes | NOT RUN | |
| pnpm goal:check passes | NOT RUN | |

## 24.7 Deployment

| Item | Status | Evidence |
| --- | --- | --- |
| Vercel canonical target | NOT RUN | vercel.json |
| vercel.json + deployment docs complete | NOT RUN | |
| Node and pnpm pinned | NOT RUN | |
| Production build output verified | NOT RUN | |
| Direct routing/refresh works | NOT RUN | |
| Security headers verified | NOT RUN | |
| Cache behavior verified | NOT RUN | |
| PWA verified in Vercel-compatible environment | NOT RUN | |
| Production-equivalent local smoke test passes | NOT RUN | |
| Live deployment smoke test | NOT RUN | requires authorization |

## 24.8 Documentation

| Item | Status | Evidence |
| --- | --- | --- |
| Every required document exists | NOT RUN | |
| README followed in fresh environment | NOT RUN | |
| Architecture docs match code | NOT RUN | |
| Screenshots match current UI | NOT RUN | |
| No unfinished feature described as complete | NOT RUN | |
| Independence/unofficial status stated | NOT RUN | |
