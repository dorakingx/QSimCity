import { traceSchema } from './schema.js';
import { TRACE_LIMITS, type Trace } from './types.js';
import { migrateTraceData } from './migrate.js';

export class TraceValidationError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[] = []) {
    super(issues.length > 0 ? `${message}: ${issues.join('; ')}` : message);
    this.name = 'TraceValidationError';
    this.issues = issues;
  }
}

/**
 * Validates untrusted trace data (schema plus cross-field invariants that a
 * JSON Schema cannot express). Returns a typed Trace or throws
 * TraceValidationError with human-readable issues.
 */
export function validateTrace(data: unknown): Trace {
  const migrated = migrateTraceData(data);
  const parsed = traceSchema.safeParse(migrated);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 20)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new TraceValidationError('Trace failed schema validation', issues);
  }
  const trace = parsed.data as unknown as Trace;
  const issues: string[] = [];

  const checkCircuitBounds = (
    circuit: Trace['inputCircuit'],
    label: string,
  ): void => {
    for (const instr of circuit.instructions) {
      for (const q of instr.qubits) {
        if (q >= circuit.numQubits) {
          issues.push(`${label}: instruction ${instr.id} references qubit ${q} >= ${circuit.numQubits}`);
        }
      }
      for (const c of instr.clbits) {
        if (c >= circuit.numClbits) {
          issues.push(`${label}: instruction ${instr.id} references clbit ${c} >= ${circuit.numClbits}`);
        }
      }
    }
    const totalCreg = circuit.cregs.reduce((a, r) => a + r.size, 0);
    if (totalCreg !== circuit.numClbits) {
      issues.push(`${label}: creg sizes sum to ${totalCreg} but numClbits is ${circuit.numClbits}`);
    }
  };
  checkCircuitBounds(trace.inputCircuit, 'inputCircuit');
  if (trace.compiledCircuit) checkCircuitBounds(trace.compiledCircuit, 'compiledCircuit');

  const checkLayout = (layout: readonly number[] | null, label: string): void => {
    if (!layout) return;
    if (layout.length !== trace.inputCircuit.numQubits) {
      issues.push(`${label}: length ${layout.length} != logical qubit count ${trace.inputCircuit.numQubits}`);
    }
    if (new Set(layout).size !== layout.length) {
      issues.push(`${label}: physical qubit assignments must be distinct`);
    }
  };
  checkLayout(trace.initialLayout, 'initialLayout');
  checkLayout(trace.finalLayout, 'finalLayout');

  // Events must be ordered by logicalTick and reference known instructions.
  const knownIds = new Set<string>();
  for (const c of [trace.inputCircuit, trace.compiledCircuit]) {
    if (c) for (const i of c.instructions) knownIds.add(i.id);
  }
  let lastTick = -1;
  for (const ev of trace.events) {
    if (ev.logicalTick < lastTick) {
      issues.push(`event ${ev.eventId}: logicalTick ${ev.logicalTick} decreases (previous ${lastTick})`);
      break;
    }
    lastTick = ev.logicalTick;
  }
  const eventIds = new Set<string>();
  for (const ev of trace.events) {
    if (eventIds.has(ev.eventId)) {
      issues.push(`duplicate eventId ${ev.eventId}`);
      break;
    }
    eventIds.add(ev.eventId);
    if (ev.instructionId !== null && !knownIds.has(ev.instructionId)) {
      issues.push(`event ${ev.eventId} references unknown instruction ${ev.instructionId}`);
    }
  }

  // Counts totals must match declared shots.
  for (const key of ['idealCounts', 'noisyCounts'] as const) {
    const counts = trace.results[key];
    if (counts) {
      const total = Object.values(counts.counts).reduce((a, b) => a + b, 0);
      if (total !== counts.shots) {
        issues.push(`${key}: counts sum to ${total} but shots is ${counts.shots}`);
      }
    }
  }
  // Probabilities must be normalized when present.
  if (trace.results.idealProbabilities) {
    const total = Object.values(trace.results.idealProbabilities).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 1e-6) {
      issues.push(`idealProbabilities sum to ${total}, expected 1`);
    }
  }

  if (issues.length > 0) {
    throw new TraceValidationError('Trace failed invariant checks', issues);
  }
  return trace;
}

/** Parses and validates a JSON string with size limits applied first. */
export function parseTraceJson(json: string): Trace {
  if (json.length > TRACE_LIMITS.maxImportBytes) {
    throw new TraceValidationError(
      `Trace file exceeds the ${Math.floor(TRACE_LIMITS.maxImportBytes / (1024 * 1024))} MiB import limit`,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new TraceValidationError(`Trace file is not valid JSON: ${(e as Error).message}`);
  }
  return validateTrace(data);
}
