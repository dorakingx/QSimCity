# QSimCity Trace

The versioned intermediate format every QSimCity surface replays. The 3D city,
Accessible 2D Mode, the Observatory, Compare Mode, the Guided Tour, and the
scenario system all derive their state from a trace, so they cannot disagree
about what happened.

- **Current schema version**: `1.0.0`
- **File extension**: `*.qsimcity.json`
- **Runtime validation**: zod schema plus cross-field invariants
- **Producers**: browser simulator, QSimCity Reference Compiler, Qiskit bridge,
  file import

## Top-level shape

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `"1.0.0"` | Format version; older versions are migrated on import |
| `traceId` | string | Stable id derived from seed and program source |
| `createdAt` | ISO-8601 | Generation timestamp (excluded from content hashes) |
| `generator` | Provenance | Producing system, version, and details |
| `seed` | string | Reproduces every sampled value in the trace |
| `packageVersions` | record | Versions of everything that produced this trace |
| `inputHash` | 16 hex chars | FNV-1a 64 of the program source |
| `deviceId` | string \| null | Device model the compile targeted |
| `shots` | integer | Requested shot count |
| `noise` | NoiseConfig \| null | Noise parameters, if any |
| `inputCircuit` | TraceCircuit | The circuit as written |
| `compiledCircuit` | TraceCircuit \| null | After compilation, if a compiler ran |
| `initialLayout` | number[] \| null | logical index → physical qubit |
| `finalLayout` | number[] \| null | Mapping after routing permutations |
| `metrics` | Metrics[] | Per-stage gate/depth/SWAP counts |
| `results` | Results | Exact probabilities and/or sampled counts |
| `events` | Event[] | The ordered story of the run |

## Events

Each event carries: `eventId`, `logicalTick`, `eventType`, `stage`,
`logicalQubits`, `physicalQubits`, `instructionId`, `source`, `certainty`,
`payload`, `provenance`, and optionally `sourceDurationNs`. Trace-level
context (`schemaVersion`, `traceId`, `seed`, `packageVersions`, `inputHash`) is
attached per event through `eventContext(trace, event)` rather than duplicated
in storage.

**Event types**: `program.loaded`, `program.parsed`, `circuit.normalized`,
`gate.decomposed`, `layout.assigned`, `route.selected`,
`routing.swap_inserted`, `gate.translated`, `gate.cancelled`,
`circuit.optimized`, `instruction.scheduled`, `execution.started`,
`gate.executed`, `noise.applied`, `measurement.sampled`,
`classical.condition_evaluated`, `optimizer.iteration_started`,
`optimizer.iteration_completed`, `mitigation.applied`, `execution.completed`.

**Stages** (each owned by exactly one city district): `input`, `parse`,
`normalize`, `layout`, `routing`, `translation`, `optimization`, `scheduling`,
`execution`, `noise`, `measurement`, `classical`, `result`.

## Three separate notions of time

| Concept | Where it lives | Meaning |
| --- | --- | --- |
| `logicalTick` | Trace event | Discrete ordering; the timeline scrubber's unit |
| `sourceDurationNs` | Trace event | Modeled duration of the operation (`ESTIMATED`) |
| playback duration | UI only (`BASE_TICK_MS` ÷ speed) | Wall-clock pacing of the animation |

Playback duration is never stored in a trace. Model durations are never
presented as measured hardware timing.

## Invariants enforced on import

Beyond the schema, `validateTrace` rejects a trace when:

- circuit instructions reference qubits or classical bits out of range;
- declared register sizes do not sum to `numClbits`;
- a layout repeats a physical qubit or has the wrong length;
- `logicalTick` decreases, or an `eventId` repeats;
- an event references an unknown `instructionId`;
- counts do not sum to the declared shot total;
- probabilities do not sum to 1 (within 1e-6).

## Import safety

| Limit | Value |
| --- | --- |
| Maximum file size | 32 MiB (checked before parsing) |
| Maximum events | 250,000 |
| Maximum qubits | 64 |
| Maximum shots | 1,000,000 |

Compressed archives are not accepted. Unknown fields are rejected by strict
schema parsing rather than ignored.

## Determinism and hashing

`traceContentHash(trace)` is an FNV-1a 64 hash over canonical JSON with
recursively sorted keys, excluding `traceId` and `createdAt`. Python and
TypeScript implementations produce byte-identical canonical JSON — including
ECMAScript number formatting rules — so the committed sample traces in
`examples/traces/` are verified from both languages against
`examples/traces/manifest.json`.

## Migration

`migrateTraceData` upgrades older traces before validation. The `0.9.0`
pre-release format (no `finalLayout`, `randomSeed` instead of `seed`) is
migrated automatically. Same-major newer minor versions are accepted and
validated as-is; unknown majors are rejected with a clear message.

## Example

```json
{
  "schemaVersion": "1.0.0",
  "traceId": "t-4a7c...",
  "seed": "42",
  "inputHash": "de8a5049a41c4f7a",
  "deviceId": "linear-5",
  "shots": 1024,
  "events": [
    {
      "eventId": "e12",
      "logicalTick": 7,
      "eventType": "routing.swap_inserted",
      "stage": "routing",
      "logicalQubits": [0, 3],
      "physicalQubits": [1, 2],
      "instructionId": null,
      "source": "reference_compiler",
      "certainty": "COMPUTED",
      "payload": { "physicalQubits": [1, 2] },
      "provenance": { "generator": "qsimcity-web", "generatorVersion": "1.0.0" }
    }
  ]
}
```

Working examples live in `examples/traces/`, generated by the Qiskit bridge.
