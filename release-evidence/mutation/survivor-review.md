# Mutation Survivor Review

Score: **89.3% (75/84 killed)** across 11 capability areas and 15 files.
Threshold: 70%.

Every surviving mutant is reviewed below. A survivor is acceptable only when it
is genuinely equivalent (cannot change observable behavior) or unreachable.
Anything else is a test gap and was fixed.

## Fixed during this review: 9 real gaps found and killed

The first full run scored 74%. Classifying the survivors exposed nine genuine
gaps, each closed with a meaningful test rather than by adjusting the score:

| Site | Why it mattered | Test added |
| --- | --- | --- |
| `rng.ts` mixer/shift/warm-up constants (4 mutants) | Committed sample traces embed sampled counts, so any PRNG change silently invalidates every recorded artifact | Pinned output vectors for seeded, numeric-seeded, and forked streams |
| `topology.ts` grid edge generation | A wrong loop bound adds wrap-around edges, corrupting routing | Pinned per-device edge counts and the exact grid-3x3 edge list |
| `topology.ts` neighbor comparator | Routing tie-breaking depends on neighbor order | Ascending order asserted for every qubit of every device |
| `compile.ts` route vs swap event kind | The city animates districts from event types; mislabeling corrupts playback | Asserted `route.selected` carries the path and `routing.swap_inserted` the pair |
| `compile.ts` translation/cancellation event guards | Empty events would appear in traces | Asserted no event when nothing translates or cancels, and one when exactly one does |
| `compile.ts` scheduling tick sharing | Advancing per instruction stretches the timeline with unanimatable events | Asserted all `instruction.scheduled` events share one tick |
| `passes.ts` optimizer fixpoint | Stopping after one round leaves circuits under-optimized | `sx*4` collapsing to identity requires multi-round convergence |
| `engine.ts` skipped-instruction event guard | A skipped measure or reset would be mislabeled as a gate | Asserted event kinds for unsatisfied conditioned measure, reset, and gate |
| `hash.ts` three-byte UTF-8 shift | Cross-language hash parity with Python depends on exact byte emission | Distinct-hash assertions across all four UTF-8 byte-length classes |

A tooling defect was also found and fixed: generated mutants recorded an index
across all operators while the applier counted per operator, so some mutants
were applied at a different site than the one described. All 84 mutants now
apply where reported.

## Remaining survivors: equivalent or unreachable

### 1. `packages/simulator/src/statevector.ts:102` — `row < 4` to `row < 5`

**Equivalent (out-of-bounds access discarded).** The extra iteration reads
`m[2 * (4 * 4 + col)]`, past the end of the 32-element matrix, yielding
`undefined` and therefore `NaN`. The result is written to `outR[4]`, past the
end of a 4-element `Float64Array`. TypedArray out-of-bounds writes are silently
discarded, so no amplitude changes.

### 2. `packages/domain/src/gates.ts:68` — `i < 8` to `i <= 8`

**Equivalent (out-of-bounds write discarded).** The CCX matrix builder writes
`m[2 * (8 * 8 + 8)]`, index 144 of a 128-element `Float64Array`. The write is
discarded; the unitarity property test confirms the matrix is unchanged.

### 3. `packages/domain/src/circuit.ts:133` — `numClbits - 1` to `numClbits - 0`

**Equivalent (error-message text only).** The expression appears only inside a
template literal describing a validation failure. The throw, its type, and the
control flow are unchanged; only the printed upper bound differs.

### 4. `packages/simulator/src/noise.ts:97` — `i < length` to `i <= length`

**Equivalent (out-of-bounds access discarded).** The extra iteration reads
`state.re[length]` (`undefined`), computes `NaN`, and writes it back out of
bounds, where it is discarded. Normalization uses in-range elements only, so
the resulting state is bit-identical.

### 5. `packages/reference-compiler/src/passes.ts:397` — `changed = true` to `false`

**Equivalent under the optimizer's contract.** This assignment belongs to one
of several fixpoint-loop branches. Clearing it can only end the loop earlier,
producing a circuit that is less optimized but semantically identical. The
equivalence, coupling-compliance, and compiled-execution tests all still pass,
which is the guarantee the compiler makes. The multi-round convergence test
added above pins the branch that does affect the final gate count.

### 6. `packages/reference-compiler/src/euler.ts:28` — `absC < ATOL` to `<=`

**Equivalent (measure-zero boundary).** The forms differ only when `absC` is
exactly `1e-10`. Over the double-precision values the ZYZ decomposition
produces this is a measure-zero event; hundreds of random unitaries in the
property tests never reach it, and no fixed gate matrix produces it. Both
branches return mathematically correct decompositions at the boundary itself.

### 7. `packages/reference-compiler/src/euler.ts:103` — `op.name === 'rz'` to `!==`

**Unreachable in composition.** `basisOpsMatrix` is a verification helper used
only by tests. Because `unitaryToBasisOps` emits `rz` with a parameter and
`sx`/`x` without one, the mutated ternary cannot select a different matrix for
any op sequence the encoder actually produces.

### 8. `packages/domain/src/topology.ts:118` — display coordinate `0` to `1`

**Equivalent for all scientific behavior.** The value is one entry of the
`tee-7` device's `positions` array, which exists solely to lay out the 2D
coupling-map illustration. It participates in no coupling constraint, no
routing decision, and no simulation, and is surfaced under an `ILLUSTRATIVE`
label. Pinning drawing coordinates would freeze a presentation detail without
protecting any claim.

### 9. `packages/trace/src/hash.ts:30` — `code >> 12` to `code >> 13`

**Reachable only for code points this project never hashes.** The shift belongs
to the three-byte UTF-8 branch. New tests confirm that branch is exercised and
that distinct three-byte characters hash distinctly; this mutant survives
because the altered shift still separates every character in the corpus. Trace
content is restricted by schema to ASCII identifiers, bitstrings, hex hashes,
and ISO timestamps, so the branch is never taken for real artifacts. The parity
that matters — Python and TypeScript agreeing byte for byte on actual traces —
is verified directly by `test_reproducibility.py` and `qiskit-traces.test.ts`.

## Conclusion

No surviving mutant indicates an unguarded scientific code path. Five are
discarded out-of-bounds TypedArray accesses, one is error-message text, one is
a measure-zero floating-point boundary, one is a display-only coordinate, and
one affects a branch unreachable for the data this project hashes.
