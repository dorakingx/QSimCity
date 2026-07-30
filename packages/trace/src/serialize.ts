import { canonicalJson, hashValue } from './hash.js';
import type { Trace } from './types.js';
import { validateTrace } from './validate.js';

export const TRACE_FILE_EXTENSION = '.qsimcity.json';

/** Serializes a trace to pretty-printed JSON for export. */
export function serializeTrace(trace: Trace): string {
  return JSON.stringify(trace, null, 2);
}

/** Canonical single-line form used for hashing and reproducibility checks. */
export function canonicalTraceJson(trace: Trace): string {
  return canonicalJson(trace);
}

/**
 * Deterministic content hash of a trace, excluding volatile identity fields
 * (traceId, createdAt) so regenerated traces with identical content match.
 */
export function traceContentHash(trace: Trace): string {
  const { traceId: _id, createdAt: _at, ...content } = trace;
  return hashValue(content);
}

/** Round-trips a trace through JSON, revalidating on the way in. */
export function deserializeTrace(json: string): Trace {
  return validateTrace(JSON.parse(json));
}

export function traceFileName(trace: Trace): string {
  const safe =
    trace.inputCircuit.name
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'trace';
  return `${safe}-${trace.traceId.slice(0, 8)}${TRACE_FILE_EXTENSION}`;
}
