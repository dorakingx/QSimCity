# Adversarial Scientific Review

Date: 2026-07-31. Reviewer stance: **attempt to disprove each claim** in
`docs/scientific-source-ledger.md`, assuming the implementation is wrong until
evidence says otherwise.

## Method

Rather than re-reading the code that produced a claim, each probe computed an
independent expected value (analytically or from a different code path) and
compared. Probes that revealed gaps were converted into permanent tests.

## Probes and outcomes

### P1 — "Phase damping preserves computational-basis populations" (C14)

*Attack*: if the implementation projected or rescaled incorrectly, dephasing
would leak into Z populations.

Ensemble ⟨P(1)⟩ over 20,000 trajectories starting from H|0⟩ with λ = 0.9:
**0.5028** (expected exactly 0.5). Sampling error at n = 20,000 is ≈ 0.0035, so
this is within 1σ. **Claim survives.** Now guarded by
`noise.test.ts > preserves measurement probabilities in the computational basis`.

### P2 — "Amplitude damping models relaxation toward |0⟩" (C13)

*Attack*: a single-step test cannot distinguish √(1−γ) from (1−γ) scaling, so
check the compounding behavior over repeated applications, which must follow
(1−γ)ⁿ.

Five applications at γ = 0.2 starting from |1⟩: **0.3323** vs analytic
0.8⁵ = **0.3277**. Within sampling error. **Claim survives.**

*Gap found*: the original test suite could not distinguish the two scalings,
because on a pure |1⟩ state the factor cancels under renormalization. A
mutation test confirmed this (`wrong Kraus amplitude scaling` survived).
**Fixed** by adding a superposition test asserting ⟨P(1)⟩ = (1−γ)/2, which
kills the mutant.

### P3 — "Exact probabilities are normalized when only some qubits are measured"

*Attack*: partial measurement requires marginalizing over unmeasured qubits;
a naive implementation would drop or double-count amplitude.

Three-qubit circuit measuring two qubits: probabilities summed to
**1.0000000000**. Outcome keys were exactly `{00, 11}` as the entanglement
structure requires. **Claim survives.**

### P4 — "Classical-bit mapping survives compilation" (C10, C20)

*Attack*: layout and routing permute qubits. If the compiler mapped
measurements by position rather than by identity, results would be silently
scrambled — the most dangerous possible bug here, because every unitary
equivalence test would still pass.

With `measure q[0]->c[2]; q[1]->c[0]; q[2]->c[1]` the compiled circuit
preserved the pairs `[[0,2],[1,0],[2,1]]`. **Claim survives.**

*Gap found*: no test executed a **compiled** circuit and compared its measured
distribution against the input circuit's. Unitary equivalence alone would not
have caught a measurement-mapping error under a non-trivial layout.
**Fixed** by adding `compiled-execution.test.ts` (67 cases): every bundled
sample compiled onto every compatible device under both layout methods, plus a
deliberately scattered manual layout, plus a non-trivial clbit-mapping case,
plus an optimized-vs-unoptimized comparison — each simulated and compared by
total variation distance.

### P5 — "Unitary evolution is numerically stable"

*Attack*: accumulated floating-point error over long circuits could silently
denormalize the state.

5,000 random `ry` rotations on 6 qubits: total probability
**1.000000000000**. **Claim survives.**

### P6 — "Compiled circuits obey coupling constraints" (C20)

Already asserted per-instruction in `compile.test.ts`, and re-verified across
all 67 compiled-execution cases: no two-qubit gate ever appeared on a
non-edge, and no non-basis gate survived translation. **Claim survives.**

### P7 — "The VQE ground energy constant is correct" (C25)

*Attack*: a hard-coded constant is exactly the kind of thing that goes stale.

H = Z₀Z₁ + 0.5·X₀ is block-diagonal; the test now diagonalizes the 2×2 block
explicitly (trace/determinant formula) and compares against the shipped
constant −√1.25. They agree to 12 decimal places. **Claim survives**, and is
now guarded rather than asserted.

### P8 — "Moving objects are never quantum amplitudes" (representation rule)

*Attack*: inspect what the 3D engine actually animates.

The only moving object driven by execution is `jobToken`, positioned by
`districtForStage(latest.stage)` — it tracks the **pipeline stage**, not any
amplitude. District pulses mark event activity; the noise weather is opacity
driven by `noise.applied` events; QPU pylons and coupling bridges change
emissive intensity for active qubits and gates. No amplitude is transported
anywhere. **Claim survives.**

## Blocking findings

**None remaining.** Two genuine test gaps were found (P2, P4) and both are
closed with permanent tests. No claim in the ledger was falsified.

## Residual risks accepted and disclosed

1. Noise is applied per gate with uniform parameters, not from a per-qubit
   calibration snapshot. Disclosed as a simplification; the schema already
   supports `backend_calibration` provenance for future per-qubit data.
2. The interaction-based layout heuristic is not optimal and makes no claim to
   be; the product invites the user to compare it against trivial layout.
3. Trajectory sampling means a single replayed shot is one history. Stated in
   the tour, the Provenance panel, and this document.
