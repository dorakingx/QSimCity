# Scientific Source Ledger

Every significant user-facing scientific claim, its primary source, where it
is implemented, and the test that guards it.

Sources retrieved **2026-07-30** unless noted. Versions in use: Qiskit 2.5.1,
Qiskit Aer 0.17.2.

| Source | URL |
| --- | --- |
| S1 | https://quantum.cloud.ibm.com/docs/guides/transpiler-stages |
| S2 | https://quantum.cloud.ibm.com/docs/api/qiskit/qiskit.transpiler.PassManager |
| S3 | https://quantum.cloud.ibm.com/docs/guides/get-qpu-information |
| S4 | https://quantum.cloud.ibm.com/docs/api/qiskit-ibm-runtime/models-backend-properties |
| S5 | https://qiskit.github.io/qiskit-aer/ |
| S6 | https://openqasm.com/ (OpenQASM 2.0 grammar; site returned HTTP 403 to automated fetch on 2026-07-30, so the implementation was validated against the Qiskit `qasm2` parser instead — see C10) |
| S7 | Nielsen & Chuang, *Quantum Computation and Quantum Information*, ch. 8 (quantum operations / Kraus decomposition) |

---

| ID | User-facing claim | Source | Implementation | Test | Simplification | Review |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | "The compiler pipeline runs normalize → layout → routing → translation → optimization → scheduling" | S1 | `packages/reference-compiler/src/compile.ts` | `compile.test.ts` structural tests | QSimCity's passes are simpler than Qiskit's within each stage | Accepted |
| C2 | "Layout assigns logical qubits to physical qubits to reduce SWAPs" | S1 | `passes.ts:layoutPass` | `compile.test.ts` manual/trivial/interaction layout tests | Interaction heuristic, not VF2/SABRE | Accepted |
| C3 | "Routing inserts SWAPs so two-qubit gates act on adjacent qubits" | S1 | `passes.ts:routingPass` | `compile.test.ts` coupling-compliance + minimal-SWAP tests | BFS shortest path, no lookahead | Accepted |
| C4 | "Each SWAP costs three CX gates" | S1, S7 | `passes.ts:translationPass` | `compile.test.ts` equivalence after translation | — | Accepted |
| C5 | "Translation rewrites gates into the device's native basis {rz, sx, x, cx}" | S1, S3 | `euler.ts:unitaryToBasisOps` | `euler.test.ts` property tests over random U(θ,φ,λ) | ZYZ only; no approximate synthesis | Accepted |
| C6 | "Optimization cancels redundant gates and reduces depth" | S1 | `passes.ts:optimizePass` | `compile.test.ts` gate-count reduction with preserved semantics | Peephole only | Accepted |
| C7 | "Scheduling assigns start times; independent gates run in parallel" | S1 | `passes.ts:schedulePass` | `compile.test.ts` parallel/dependent schedule test | ASAP with model durations; labeled ESTIMATED | Accepted |
| C8 | "Gate durations shown are model estimates, not hardware measurements" | S3, S4 | `topology.ts:durations`, `SchedulePanel.tsx` | `content.test.ts`, panel test asserting the ESTIMATED badge and disclaimer | Representative values, not from a live backend | Accepted |
| C9 | "Qubit ordering is little-endian, matching Qiskit" | S2, S5 | `simulator/src/statevector.ts` | `cross-validation.test.ts` amplitude-by-amplitude | — | Accepted |
| C10 | "QSimCity accepts OpenQASM 2.0" | S6 | `domain/src/qasm/parser.ts` | `qasm.test.ts`, `parser-coverage.test.ts`; every bundled sample also parses under Qiskit's own `qasm2` loader in `test_bridge.py` | Subset: no `opaque`, no OpenQASM 3 | Accepted |
| C11 | "Ideal results are exact for small circuits" | S5 | `engine.ts:computeExactDistribution` | `engine.test.ts` exact-probability tests; `cross-validation.test.ts` vs Qiskit Statevector | Capped at 12 qubits | Accepted |
| C12 | "Measurement collapses the state and yields one bitstring per shot" | S7 | `statevector.ts:collapse` | `statevector.test.ts`, mutation tests on the projection | — | Accepted |
| C13 | "Amplitude damping models energy relaxation toward \|0⟩" | S5, S7 | `noise.ts:applyAmplitudeDamping` | `noise.test.ts` ensemble ⟨P(1)⟩ = (1−γ)/2 in superposition; Aer parity in `test_bridge.py` | Trajectory method; per-gate application | Accepted |
| C14 | "Phase damping destroys coherence without changing populations" | S5, S7 | `noise.ts:applyPhaseDamping` | `noise.test.ts` population-preservation and coherence-loss tests | Trajectory method | Accepted |
| C15 | "Depolarizing noise mixes the state toward maximal mixture" | S5, S7 | `noise.ts:applyDepolarizing` | `noise.test.ts` firing-rate and 2/3-excited tests | Stochastic Pauli form | Accepted |
| C16 | "Readout error flips recorded bits at the reported rate" | S4, S5 | `noise.ts:applyReadoutError` | `noise.test.ts`, `engine.test.ts` forbidden-outcome tests; Aer parity in `test_bridge.py` | Symmetric flip probability | Accepted |
| C17 | "Zero noise reproduces ideal results exactly" | S5 | `noise.ts:isZeroNoise` | `engine.test.ts` zero-noise equality; `test_bridge.py` Aer equivalent | — | Accepted |
| C18 | "Results are reproducible from the recorded seed" | S5 | `domain/src/rng.ts`, seeds throughout | `rng.test.ts`, determinism tests in every layer, committed trace hashes | Aer runs pinned single-threaded for byte-identical regeneration | Accepted |
| C19 | "Observed fractions carry ≈1/√shots sampling uncertainty" | Standard statistics | `ResultsSection.tsx` | `components-branches.test.ts` uncertainty-note test; Shot Drought scenario | Normal approximation | Accepted |
| C20 | "Compiled circuits obey the device coupling map" | S1, S3 | `passes.ts:routingPass` | `compile.test.ts` illegal-edge assertions; `test_bridge.py` for the Qiskit path | — | Accepted |
| C21 | "Equivalence is checked up to global phase and layout permutation" | S2, S7 | `complex.ts:matEqualUpToGlobalPhase`, `test/utils.ts` | `compile.test.ts` property tests | — | Accepted |
| C22 | "Real Qiskit transpiler stages are captured" | S1, S2 | `python/.../transpile_capture.py` | `test_bridge.py` pass-capture and layout tests; TS hash parity | Preset pass manager, optimization level 1. The **executed pass sequence is deliberately not recorded in trace content**: Qiskit takes different internal paths across identical invocations (observed 42 vs 43 passes, `ApplyLayout` present or absent) while producing an identical circuit, layout, and metrics. Hashing it would make committed traces irreproducible without scientific gain. | Accepted |
| C23 | "Teleportation moves a state using entanglement and two classical bits" | S7 | `samples.ts:teleportation` | `engine.test.ts` payload-distribution test; teleportation scenario | Educational 3-qubit form | Accepted |
| C24 | "One Grover iteration finds the marked 2-qubit state with certainty" | S7 | `samples.ts:grover-2` | `engine.test.ts` P=1 assertion | n=2 only | Accepted |
| C25 | "The VQE ground energy of Z₀Z₁+0.5X₀ is −√1.25" | Analytic | `scenarios/vqe.ts` | `scenarios.test.ts` verifies the constant against explicit 2×2 block diagonalization | Educational Hamiltonian | Accepted |

---

## Adversarial review

A separate adversarial pass attempted to disprove each claim above; findings
and their resolutions are recorded in
[audits/adversarial-scientific-review.md](audits/adversarial-scientific-review.md).
