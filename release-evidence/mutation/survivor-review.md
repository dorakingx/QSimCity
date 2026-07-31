# Mutation Survivors

3 mutant(s) survived: 3 reviewed as equivalent, 0 pending.

A pending survivor is a hole in the tests and fails this run. An
equivalent mutant may remain only with the written justification below.

## `packages/simulator/src/statevector.ts:110` — numeric-literal

- Capability: Single-qubit and multi-qubit gate evolution
- Mutation: `4` → `5`
- Tests run: packages/simulator, packages/reference-compiler, packages/domain
- Review: **equivalent** — Same site and same reason as the comparison mutant: the extra iteration writes to an undefined typed-array index, which JavaScript discards.

## `packages/domain/src/gates.ts:153` — comparison

- Capability: Single-qubit and multi-qubit gate evolution
- Mutation: `<` → `<=`
- Tests run: packages/simulator, packages/reference-compiler, packages/domain
- Review: **equivalent** — Extends the CCX basis loop to i = 8, which writes m[144] on a 128-element Float64Array. Out-of-range typed-array writes are discarded, so the gate matrix is unchanged.

## `packages/simulator/src/noise.ts:103` — comparison

- Capability: Readout, depolarizing, amplitude damping, phase damping
- Mutation: `<` → `<=`
- Tests run: packages/simulator
- Review: **equivalent** — Extends the amplitude-damping scaling loop one element past the state vector. Reading gives undefined and the write is discarded, so no amplitude is scaled twice and none is missed.

