/**
 * QSimCity Trace: the versioned intermediate format every replay surface
 * consumes (3D world, Accessible 2D Mode, Observatory, Compare Mode, Guided
 * Tour, scenario system). Traces are produced by the browser simulator, the
 * reference compiler, the Qiskit bridge, and file imports.
 */

export const TRACE_SCHEMA_VERSION = '1.0.0';

/** Machine-level origin of a piece of data. */
export const SOURCE_CLASSIFICATIONS = [
  'exact_simulation',
  'sampled_simulation',
  'qiskit_transpiler',
  'qiskit_aer',
  'backend_calibration',
  'measured_import',
  'reference_compiler',
  'estimated',
  'illustrative',
] as const;
export type SourceClassification = (typeof SOURCE_CLASSIFICATIONS)[number];

/** User-facing certainty label shown in the Inspector and panels. */
export const CERTAINTY_LABELS = [
  'EXACT',
  'COMPUTED',
  'SAMPLED',
  'CALIBRATION',
  'MEASURED',
  'ESTIMATED',
  'ILLUSTRATIVE',
] as const;
export type CertaintyLabel = (typeof CERTAINTY_LABELS)[number];

/** Default certainty implied by each source classification. */
export const DEFAULT_CERTAINTY: Readonly<Record<SourceClassification, CertaintyLabel>> = {
  exact_simulation: 'EXACT',
  sampled_simulation: 'SAMPLED',
  qiskit_transpiler: 'COMPUTED',
  qiskit_aer: 'SAMPLED',
  backend_calibration: 'CALIBRATION',
  measured_import: 'MEASURED',
  reference_compiler: 'COMPUTED',
  estimated: 'ESTIMATED',
  illustrative: 'ILLUSTRATIVE',
};

/** Pipeline stage an event belongs to; drives district placement in 3D. */
export const STAGES = [
  'input',
  'parse',
  'normalize',
  'layout',
  'routing',
  'translation',
  'optimization',
  'scheduling',
  'execution',
  'noise',
  'measurement',
  'classical',
  'result',
] as const;
export type Stage = (typeof STAGES)[number];

export const EVENT_TYPES = [
  'program.loaded',
  'program.parsed',
  'circuit.normalized',
  'gate.decomposed',
  'layout.assigned',
  'route.selected',
  'routing.swap_inserted',
  'gate.translated',
  'gate.cancelled',
  'circuit.optimized',
  'instruction.scheduled',
  'execution.started',
  'gate.executed',
  'noise.applied',
  'measurement.sampled',
  'classical.condition_evaluated',
  'optimizer.iteration_started',
  'optimizer.iteration_completed',
  'mitigation.applied',
  'execution.completed',
] as const;
export type TraceEventType = (typeof EVENT_TYPES)[number];

export interface Provenance {
  /** Producing system, e.g. "qsimcity-simulator". */
  readonly generator: string;
  readonly generatorVersion: string;
  /** Free-form details, e.g. backend name, calibration timestamp. */
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface TraceEvent {
  readonly eventId: string;
  /** Discrete ordering tick; multiple events may share a tick. */
  readonly logicalTick: number;
  readonly eventType: TraceEventType;
  readonly stage: Stage;
  readonly logicalQubits: readonly number[];
  readonly physicalQubits: readonly number[];
  /** Circuit instruction this event belongs to, if any. */
  readonly instructionId: string | null;
  readonly source: SourceClassification;
  readonly certainty: CertaintyLabel;
  /** Event-type-specific data. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly provenance: Provenance;
  /**
   * Model duration of the underlying operation in nanoseconds, when the
   * producer models timing. Playback speed is a UI concern and never stored.
   */
  readonly sourceDurationNs?: number;
}

export interface TraceCircuitInstruction {
  readonly id: string;
  readonly kind: 'gate' | 'measure' | 'reset' | 'barrier';
  readonly name: string;
  readonly qubits: readonly number[];
  readonly params: readonly number[];
  readonly clbits: readonly number[];
  readonly condition: { readonly creg: string; readonly value: number } | null;
}

export interface TraceCircuit {
  readonly name: string;
  readonly numQubits: number;
  readonly numClbits: number;
  readonly cregs: readonly { readonly name: string; readonly size: number }[];
  readonly instructions: readonly TraceCircuitInstruction[];
}

export interface TraceCounts {
  /** Bitstring (qubit 0 rightmost) to occurrence count. */
  readonly counts: Readonly<Record<string, number>>;
  readonly shots: number;
  readonly source: SourceClassification;
  readonly certainty: CertaintyLabel;
}

export interface TraceResults {
  /** Exact probabilities when available (browser simulator, small circuits). */
  readonly idealProbabilities?: Readonly<Record<string, number>>;
  readonly idealCounts?: TraceCounts;
  readonly noisyCounts?: TraceCounts;
}

export interface TraceMetricsSnapshot {
  readonly stage: 'input' | 'compiled';
  readonly gateCount: number;
  readonly twoQubitGateCount: number;
  readonly swapCount: number;
  readonly depth: number;
}

export interface NoiseConfig {
  readonly readoutError: number;
  readonly depolarizing1q: number;
  readonly depolarizing2q: number;
  readonly amplitudeDamping: number;
  readonly phaseDamping: number;
}

/**
 * Observational telemetry captured alongside a run. These values are real and
 * useful for auditing, but they are NOT guaranteed to be reproducible: a
 * producer may legitimately emit different telemetry for identical inputs.
 * Excluded from `semanticHash`, included in `artifactHash`.
 */
export interface TraceTelemetry {
  /**
   * Compiler passes as actually executed, in order. Qiskit's preset pass
   * manager takes different internal paths across identical invocations while
   * producing an identical circuit, so this sequence varies between runs.
   */
  readonly executedPasses?: readonly string[];
  readonly executedPassCount?: number;
  /** Free-form producer notes; never load-bearing for any displayed claim. */
  readonly notes?: Readonly<Record<string, string | number | boolean>>;
}

export interface Trace {
  readonly schemaVersion: string;
  readonly traceId: string;
  readonly createdAt: string;
  readonly generator: Provenance;
  readonly seed: string;
  /** Versions of the packages that produced this trace. */
  readonly packageVersions: Readonly<Record<string, string>>;
  /** Deterministic hash of the program input (FNV-1a 64-bit hex). */
  readonly inputHash: string;
  readonly deviceId: string | null;
  readonly shots: number;
  readonly noise: NoiseConfig | null;
  /** Circuit as loaded (pre-compilation). */
  readonly inputCircuit: TraceCircuit;
  /** Circuit after compilation, when a compiler ran. */
  readonly compiledCircuit: TraceCircuit | null;
  /** Initial layout: logical qubit index -> physical qubit index. */
  readonly initialLayout: readonly number[] | null;
  /** Final layout after routing permutations. */
  readonly finalLayout: readonly number[] | null;
  readonly metrics: readonly TraceMetricsSnapshot[];
  readonly results: TraceResults;
  readonly events: readonly TraceEvent[];
  /** Observational, possibly nondeterministic provenance. Optional. */
  readonly telemetry?: TraceTelemetry;
}

/** Full per-event record including trace-level context (spec §11). */
export interface TraceEventContext extends TraceEvent {
  readonly schemaVersion: string;
  readonly traceId: string;
  readonly seed: string;
  readonly packageVersions: Readonly<Record<string, string>>;
  readonly inputHash: string;
}

export function eventContext(trace: Trace, event: TraceEvent): TraceEventContext {
  return {
    ...event,
    schemaVersion: trace.schemaVersion,
    traceId: trace.traceId,
    seed: trace.seed,
    packageVersions: trace.packageVersions,
    inputHash: trace.inputHash,
  };
}

/** Import safety limits (spec §17). */
export const TRACE_LIMITS = {
  maxImportBytes: 32 * 1024 * 1024,
  maxEvents: 250_000,
  maxQubits: 64,
  maxShots: 1_000_000,
} as const;
