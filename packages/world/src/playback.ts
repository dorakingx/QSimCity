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

  const activeCouplings: [number, number][] = [];
  const activeQubits = new Set<number>();
  for (const ev of atTick) {
    for (const q of ev.physicalQubits) activeQubits.add(q);
    for (const q of ev.logicalQubits) activeQubits.add(q);
    if (ev.eventType === 'gate.executed') {
      const qubits = ev.physicalQubits.length >= 2 ? ev.physicalQubits : ev.logicalQubits;
      if (qubits.length === 2) activeCouplings.push([qubits[0]!, qubits[1]!]);
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
 * Wall-clock pacing: playback duration per logical tick in milliseconds at
 * 1x speed. This is presentation pacing only and is deliberately separate
 * from sourceDurationNs (spec §10: source duration vs playback duration).
 */
export const BASE_TICK_MS = 600;

export function tickDurationMs(speed: number): number {
  const clamped = Math.max(0.1, Math.min(5, speed));
  return BASE_TICK_MS / clamped;
}
