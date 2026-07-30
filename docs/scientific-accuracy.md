# Scientific Accuracy

QSimCity's guiding rule: **never present unobservable internal hardware state
as if it were measured**, and label the epistemic status of everything on
screen.

## Provenance and certainty

Every trace event, metric, and visual carries a machine-level
`SourceClassification` and a user-facing `CertaintyLabel`.

| Source | Certainty | Meaning |
| --- | --- | --- |
| `exact_simulation` | `EXACT` | Statevector math, exact to floating point |
| `sampled_simulation` | `SAMPLED` | Seeded sampling in the browser engine |
| `qiskit_transpiler` | `COMPUTED` | Real Qiskit transpiler output |
| `qiskit_aer` | `SAMPLED` | Qiskit Aer simulation output |
| `backend_calibration` | `CALIBRATION` | Device calibration snapshot with source and time |
| `measured_import` | `MEASURED` | Imported real measurement record |
| `reference_compiler` | `COMPUTED` | QSimCity Reference Compiler output |
| `estimated` | `ESTIMATED` | Simplified model output; a proxy |
| `illustrative` | `ILLUSTRATIVE` | Teaching visual, not computed |

Labels are visible in the Inspector, the event log, the results panels, and
the tour, not buried in tooltips.

## Conventions

- **Qubit ordering is little-endian**: bit *k* of a basis-state index is qubit
  *k*'s value. This matches Qiskit, so cross-validation needs no reindexing.
- **Gate matrices** are row-major `M[out][in]`; for multi-qubit gates, bit 0 of
  the local index is the first argument qubit.
- **Bitstrings** are printed with qubit/clbit 0 rightmost, again matching
  Qiskit's `get_counts()` convention (register spaces stripped).
- **Classical bits** are a flat array; registers map onto it by declaration
  order. `measure q[i] -> c[j]` writes exactly clbit *j*, so the classical bit
  order is independent of qubit order — tested explicitly.
- **Global phase** is physically unobservable, so every equivalence check is
  performed up to global phase.

## The simulator

`packages/simulator` is an exact statevector engine. Amplitudes are stored as
two `Float64Array`s of length 2ⁿ. Exact simulation is capped at **12 qubits**
(4096 amplitudes); the limit is stated in the UI and produces an explanatory
error, never a crash.

**What is exact**: unitary evolution, measurement probabilities, and the
probability distribution over outcomes for static circuits.

**What is sampled**: individual shot outcomes, all noise events, and any
circuit with mid-circuit measurement, reset, or classical conditions (these
branch the state per shot, so a distribution is built by running trajectories).

For static, noise-free circuits the engine computes the exact distribution in
a single pass and then samples from it, so reported probabilities are `EXACT`
while counts remain `SAMPLED`.

## Noise model

Noise uses the **quantum-trajectory (Monte Carlo wave function) method**: each
shot stochastically selects one Kraus branch with its Born probability, so
ensemble statistics converge to the channel's density-matrix action while each
individual shot remains a pure state.

| Channel | Kraus operators | Verified by |
| --- | --- | --- |
| Readout error | Classical bit flip with probability *p* at record time | Distribution shift and forbidden-outcome tests |
| Depolarizing | With probability *p*, one of X, Y, Z uniformly | Firing-rate and maximal-mixture tests |
| Amplitude damping | K₀ = diag(1, √(1−γ)), K₁ = √γ·\|0⟩⟨1\| | Ensemble ⟨P(1)⟩ = (1−γ)/2 in superposition |
| Phase damping | K₀ = diag(1, √(1−λ)), K₁ = diag(0, √λ) | Z-basis populations preserved, coherence destroyed |

Because trajectories are sampled, all noisy output is labeled `SAMPLED` and is
reproducible from the recorded seed. The amplitude-damping scaling is verified
**in superposition**, since on a pure |1⟩ state the √(1−γ) factor is invisible
after renormalization — a mutation test enforces this.

## The reference compiler

`packages/reference-compiler` implements a deterministic pipeline whose stages
mirror the six Qiskit preset-pass-manager stages (init, layout, routing,
translation, optimization, scheduling; retrieved 2026-07-30 from the IBM
Quantum transpiler-stages guide):

1. **Normalize** — expand `ccx` into the standard 6-CX Toffoli decomposition.
2. **Layout** — trivial, an interaction-count heuristic, or a manual mapping.
3. **Routing** — BFS shortest paths with SWAP insertion; lowest-index
   tie-breaking keeps it deterministic. SWAP count is verified minimal for a
   single long-range gate.
4. **Translation** — ZYZ Euler decomposition into `{rz, sx, x, cx}`.
5. **Optimization** — peephole cancellation of adjacent inverses, `sx·sx → x`,
   `rz` merging, and zero-rotation removal, iterated to a fixpoint.
6. **Scheduling** — ASAP scheduling with model gate durations.

**Correctness is verified semantically, not syntactically.** Tests build the
full unitary of the compiled circuit on physical qubits, inject logical basis
states through the initial layout, read results back through the final layout,
and assert equality with the input unitary up to global phase — including
property-based tests over randomly generated circuits on multiple topologies.
Leakage onto ancilla qubits must be zero, every two-qubit gate must lie on a
real coupling edge, and every gate must be in the device basis.

QSimCity does **not** claim its compiler matches Qiskit's output. It claims
equivalence of meaning, which is what it tests.

## Cross-validation against Qiskit

`examples/cross-validation/qiskit-results.json` is generated by
`python/qsimcity_qiskit` from Qiskit `Statevector` and `AerSimulator`. The
browser simulator is checked against it:

- **Statevectors** amplitude by amplitude (after fixing the unobservable global
  phase from the largest-magnitude reference amplitude), to 8 decimal places.
- **Sampled counts** by total variation distance, with a 0.05 bound that
  sampling noise at 4096 shots cannot plausibly exceed.

The Qiskit-produced traces themselves are validated by the TypeScript schema,
and their content hashes are compared against a committed manifest, so a
regression in either language is caught.

## Deliberate simplifications

These are listed in the product's own Provenance panel, not only here:

1. The animated replay follows **one representative trajectory** (shot 0);
   aggregate statistics summarize all shots.
2. A single noise trajectory is **one possible history**, not "the" state.
3. **Playback pacing is presentation time.** Model gate durations shown in the
   schedule are `ESTIMATED` and are never hardware measurements.
4. The reference compiler is simpler than production transpilers by design.
5. **Moving objects in the city are jobs, instructions, classical messages, and
   measurement samples — never quantum amplitudes.** Quantum state is not a
   thing that travels on roads, and QSimCity never animates it as one.
6. Any "estimated success proxy" is a product of modeled error rates. It is
   **not fidelity** and is always labeled `ESTIMATED`.

## Things QSimCity deliberately does not do

- It does not display a live internal statevector of real hardware.
- It does not call a product of gate-error estimates "fidelity".
- It does not simulate pulses, fault tolerance, or error correction.
- It does not submit jobs to a real QPU. **No real quantum hardware was used
  in producing anything this product displays.**

## Variational Gridlock (VQE)

The variational scenario runs a genuine hybrid loop and documents its own
assumptions in the trace's `program.loaded` payload:

- **Hamiltonian**: H = Z₀Z₁ + 0.5·X₀
- **Exact ground energy**: −√1.25 ≈ −1.1180 (verified against the analytic
  2×2 block diagonalization in tests)
- **Ansatz**: `ry(θ₀) q0; ry(θ₁) q1; cx q0,q1`
- **Optimizer**: deterministic shrinking-grid coordinate search, 10 iterations
- **Energy evaluation**: sampled expectation values from the seeded simulator
  in two measurement bases, so the classical optimizer genuinely consumes
  quantum-execution results

This is an **educational** demonstration of the hybrid loop and of how shot
noise stalls optimization. It makes no quantum-chemistry accuracy claim.

## Primary sources

See [scientific-source-ledger.md](scientific-source-ledger.md) for the
claim-by-claim ledger with retrieval dates, implementation locations, and the
test that guards each claim.
