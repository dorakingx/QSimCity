import type { Trace, TraceEvent } from 'qsimcity-trace';
import { districtForStage, type DistrictId } from './districts.js';

/**
 * Pure playback model: world activity as a function of (trace, tick).
 * The 3D engine, Accessible 2D Mode, Observatory, and tour all consume the
 * same derivation, guaranteeing identical scientific state everywhere.
 */

export interface DistrictActivity {
  readonly districtId: DistrictId;
  /** Events firing in this district at the current tick. */
  readonly events: readonly TraceEvent[];
}

export interface WorldActivity {
  readonly tick: number;
  readonly maxTick: number;
  readonly eventsAtTick: readonly TraceEvent[];
  readonly districts: readonly DistrictActivity[];
  /** Cumulative representative measurement outcomes up to the tick. */
  readonly measuredBits: ReadonlyMap<number, 0 | 1>;
  /** Instruction ids that have executed up to and including the tick. */
  readonly executedInstructionIds: ReadonlySet<string>;
  /** Physical qubit pairs whose coupling fired at this tick. */
  readonly activeCouplings: readonly (readonly [number, number])[];
  /** Physical/logical qubits active at this tick. */
  readonly activeQubits: readonly number[];
}

export function maxTickOf(trace: Trace): number {
  return trace.events.length > 0 ? trace.events[trace.events.length - 1]!.logicalTick : 0;
}

export function eventsAt(trace: Trace, tick: number): TraceEvent[] {
  return trace.events.filter((e) => e.logicalTick === tick);
}

export function eventsUpTo(trace: Trace, tick: number): TraceEvent[] {
  return trace.events.filter((e) => e.logicalTick <= tick);
}

export function activityAtTick(trace: Trace, tick: number): WorldActivity {
  const maxTick = maxTickOf(trace);
  const clamped = Math.max(0, Math.min(tick, maxTick));
  const atTick = eventsAt(trace, clamped);
  const upTo = eventsUpTo(trace, clamped);

  const byDistrict = new Map<DistrictId, TraceEvent[]>();
  for (const ev of atTick) {
    const district = districtForStage(ev.stage);
    const list = byDistrict.get(district.id) ?? [];
    list.push(ev);
    byDistrict.set(district.id, list);
  }

  const measuredBits = new Map<number, 0 | 1>();
  const executed = new Set<string>();
  for (const ev of upTo) {
    if (ev.eventType === 'measurement.sampled') {
      const clbit = ev.payload['clbit'];
      const outcome = ev.payload['outcome'];
      if (typeof clbit === 'number' && (outcome === 0 || outcome === 1)) {
        measuredBits.set(clbit, outcome);
      }
    }
    if (
      ev.instructionId &&
      (ev.eventType === 'gate.executed' || ev.eventType === 'measurement.sampled')
    ) {
      executed.add(ev.instructionId);
    }
  }

  // The QPU Grid draws device qubits and device coupling edges, so only
  // physical identities may light it. This previously fell back to
  // `logicalQubits` when an event had no physical ones, which lit pylon N for
  // logical qubit N — a different qubit entirely under any non-trivial
  // layout, and a coupling edge that may not exist on the device.
  const activeCouplings: [number, number][] = [];
  const activeQubits = new Set<number>();
  for (const ev of atTick) {
    for (const q of ev.physicalQubits) activeQubits.add(q);
    if (ev.eventType === 'gate.executed' && ev.physicalQubits.length === 2) {
      activeCouplings.push([ev.physicalQubits[0]!, ev.physicalQubits[1]!]);
    }
  }

  return {
    tick: clamped,
    maxTick,
    eventsAtTick: atTick,
    districts: [...byDistrict.entries()].map(([districtId, events]) => ({ districtId, events })),
    measuredBits,
    executedInstructionIds: executed,
    activeCouplings,
    activeQubits: [...activeQubits].sort((a, b) => a - b),
  };
}

/**
 * Cumulative measured counts by bitstring up to the tick (harbor stacks).
 *
 * What this counts, exactly: trace events carry one REPRESENTATIVE shot per
 * measurement (`measurement.sampled` payloads hold a single `clbit` and
 * `outcome`; aggregate histograms live only in `trace.results`). This
 * derivation therefore counts representative shot records, never invented
 * shots. Events are grouped into records in emission order: a record grows
 * while measurements land on new clbits within the same `phase` payload; a
 * repeated clbit or a phase change closes the record and starts the next
 * (mid-circuit re-measurement and ideal/noisy passes each produce their own
 * record). Each record — including the one still in progress at the tick —
 * contributes exactly 1 to the bitstring of its measured clbits so far,
 * rendered with clbit 0 rightmost at the circuit's classical width;
 * positions the record has not measured yet render as '?'. At the final
 * tick the keys of completed records match the bitstring format of
 * `trace.results` counts, and the total equals the number of representative
 * measurement records in the events.
 */
export function countsAtTick(trace: Trace, tick: number): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  const circuitWidth = Math.max(
    trace.compiledCircuit?.numClbits ?? 0,
    trace.inputCircuit.numClbits,
  );
  let record = new Map<number, 0 | 1>();
  let recordPhase: unknown;
  const finalizeRecord = (): void => {
    if (record.size === 0) return;
    let width = circuitWidth;
    for (const clbit of record.keys()) width = Math.max(width, clbit + 1);
    let bits = '';
    for (let i = width - 1; i >= 0; i--) {
      const bit = record.get(i);
      bits += bit === undefined ? '?' : String(bit);
    }
    counts.set(bits, (counts.get(bits) ?? 0) + 1);
  };
  for (const ev of trace.events) {
    if (ev.logicalTick > tick || ev.eventType !== 'measurement.sampled') continue;
    const clbit = ev.payload['clbit'];
    const outcome = ev.payload['outcome'];
    if (typeof clbit !== 'number' || (outcome !== 0 && outcome !== 1)) continue;
    const phase = ev.payload['phase'];
    if (record.size > 0 && (phase !== recordPhase || record.has(clbit))) {
      finalizeRecord();
      record = new Map();
    }
    recordPhase = phase;
    record.set(clbit, outcome);
  }
  finalizeRecord();
  return counts;
}

/**
 * SWAP exchanges happening exactly at this tick: physical qubit pairs.
 *
 * Only pairwise reference-compiler events qualify (physicalQubits of length
 * 2 without an aggregate `finalLayout` payload); the Qiskit bridge's single
 * post-routing summary event describes a whole permutation, not one
 * exchange, and is handled by the mapping module instead.
 */
export function swapExchangesAt(
  trace: Trace,
  tick: number,
): readonly (readonly [number, number])[] {
  return trace.events
    .filter(
      (ev) =>
        ev.logicalTick === tick &&
        ev.eventType === 'routing.swap_inserted' &&
        ev.physicalQubits.length === 2 &&
        !Array.isArray(ev.payload['finalLayout']),
    )
    .map((ev) => [ev.physicalQubits[0]!, ev.physicalQubits[1]!] as const);
}

/**
 * Wall-clock pacing: playback duration per logical tick in milliseconds at
 * 1x speed. This is presentation pacing only and is deliberately separate
 * from sourceDurationNs (spec §10: source duration vs playback duration).
 */
export const BASE_TICK_MS = 600;

export function tickDurationMs(speed: number): number {
  const clamped = Math.max(0.1, Math.min(5, speed));
  return BASE_TICK_MS / clamped;
}
