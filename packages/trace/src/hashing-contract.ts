import { canonicalJson, fnv1a64 } from './hash.js';
import type { Trace } from './types.js';

/**
 * Two-level trace hashing (reproducibility contract).
 *
 * A single hash cannot serve both purposes a trace needs:
 *
 * - **semanticHash** protects the scientifically meaningful result: the input
 *   circuit, device, seed, compiled circuit, layouts, metrics, and results.
 *   It is stable across independent runs and machines, so committed sample
 *   traces can be regenerated and compared.
 *
 * - **artifactHash** protects the exact serialized bytes. Any change at all —
 *   including timestamps and observational telemetry — changes it, so it
 *   detects tampering with a distributed artifact.
 *
 * Some real provenance is genuinely nondeterministic. Qiskit's preset pass
 * manager takes different internal paths across identical invocations (42 vs
 * 43 passes, `ApplyLayout` present or absent) while producing an identical
 * compiled circuit. That telemetry is valuable for auditing and is therefore
 * **kept** — recorded under `telemetry` and excluded from `semanticHash`
 * rather than discarded to manufacture determinism.
 */

/**
 * Fields excluded from the semantic hash, with the reason each is incidental.
 * Anything not listed here contributes to the semantic hash.
 */
export const SEMANTIC_EXCLUSIONS: Readonly<Record<string, string>> = {
  traceId: 'Derived identity, not a computation result',
  createdAt: 'Generation timestamp; varies by definition',
  telemetry: 'Observational, may vary between identical runs (see the type docs)',
};

/** Event payload keys treated as observational telemetry, not semantics. */
export const TELEMETRY_PAYLOAD_KEYS: readonly string[] = [
  'passes',
  'passCount',
  'distinctPassCount',
  'passDurationsSeconds',
  'wallClockSeconds',
];

interface SemanticView {
  readonly schemaVersion: string;
  readonly seed: string;
  readonly inputHash: string;
  readonly deviceId: string | null;
  readonly shots: number;
  readonly noise: Trace['noise'];
  readonly inputCircuit: Trace['inputCircuit'];
  readonly compiledCircuit: Trace['compiledCircuit'];
  readonly initialLayout: readonly number[] | null;
  readonly finalLayout: readonly number[] | null;
  readonly metrics: Trace['metrics'];
  readonly results: Trace['results'];
  readonly packageVersions: Readonly<Record<string, string>>;
  readonly events: readonly Record<string, unknown>[];
}

/**
 * Projects a trace onto the fields whose values are a deterministic function
 * of (program, device, seed, versions). Event payload keys listed in
 * TELEMETRY_PAYLOAD_KEYS are stripped.
 */
export function semanticView(trace: Trace): SemanticView {
  return {
    schemaVersion: trace.schemaVersion,
    seed: trace.seed,
    inputHash: trace.inputHash,
    deviceId: trace.deviceId,
    shots: trace.shots,
    noise: trace.noise,
    inputCircuit: trace.inputCircuit,
    compiledCircuit: trace.compiledCircuit,
    initialLayout: trace.initialLayout,
    finalLayout: trace.finalLayout,
    metrics: trace.metrics,
    results: trace.results,
    packageVersions: trace.packageVersions,
    events: trace.events.map((event) => {
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(event.payload)) {
        if (!TELEMETRY_PAYLOAD_KEYS.includes(key)) payload[key] = value;
      }
      return {
        eventId: event.eventId,
        logicalTick: event.logicalTick,
        eventType: event.eventType,
        stage: event.stage,
        logicalQubits: event.logicalQubits,
        physicalQubits: event.physicalQubits,
        instructionId: event.instructionId,
        source: event.source,
        certainty: event.certainty,
        payload,
        ...(event.sourceDurationNs !== undefined
          ? { sourceDurationNs: event.sourceDurationNs }
          : {}),
      };
    }),
  };
}

/**
 * Hash of the scientifically meaningful content. Stable across independent
 * runs, processes, and machines for the same inputs.
 */
export function semanticHash(trace: Trace): string {
  return fnv1a64(canonicalJson(semanticView(trace)));
}

/**
 * Hash of the exact serialized artifact, including timestamps and telemetry.
 * Any byte-level change alters it.
 */
export function artifactHash(serialized: string): string {
  return fnv1a64(serialized);
}
