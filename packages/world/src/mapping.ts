import type { Trace, TraceEvent } from 'qsimcity-trace';

/**
 * Logical-to-physical qubit identity tracking (spec §5.2, acceptance W4.2):
 * the mapping in effect at any playback tick, derived purely from trace
 * events. Pylon banners, the coupling map overlay, and the inspector table
 * all consume this one derivation so they can never disagree.
 *
 * Two producer shapes exist for `routing.swap_inserted`:
 *
 * 1. The reference compiler emits one event per inserted SWAP with
 *    `physicalQubits: [a, b]` — the logical qubits living on physical `a`
 *    and `b` exchange homes from that tick onward (mirroring
 *    `swapPhysical` in the compiler's routing pass).
 * 2. The Qiskit bridge emits a single aggregate event whose
 *    `payload.finalLayout` is the complete post-routing layout; the mapping
 *    adopts it wholesale at that tick.
 */

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'number');
}

function applyLayoutAssigned(map: Map<number, number>, event: TraceEvent): void {
  map.clear();
  const layout = event.payload['layout'];
  if (isNumberArray(layout)) {
    layout.forEach((physical, logical) => map.set(logical, physical));
    return;
  }
  // Fallback: zip the event's logical and physical qubit lists.
  event.logicalQubits.forEach((logical, i) => {
    const physical = event.physicalQubits[i];
    if (physical !== undefined) map.set(logical, physical);
  });
}

function applySwapInserted(map: Map<number, number>, event: TraceEvent): void {
  const finalLayout = event.payload['finalLayout'];
  if (isNumberArray(finalLayout)) {
    // Aggregate form (Qiskit bridge): the whole post-routing permutation.
    map.clear();
    finalLayout.forEach((physical, logical) => map.set(logical, physical));
    return;
  }
  if (event.physicalQubits.length !== 2) return;
  const [a, b] = event.physicalQubits as readonly [number, number];
  let logicalOnA: number | undefined;
  let logicalOnB: number | undefined;
  for (const [logical, physical] of map) {
    if (physical === a) logicalOnA = logical;
    if (physical === b) logicalOnB = logical;
  }
  if (logicalOnA !== undefined) map.set(logicalOnA, b);
  if (logicalOnB !== undefined) map.set(logicalOnB, a);
}

/**
 * Logical-to-physical qubit assignment in effect at a playback tick,
 * derived from layout.assigned events and routing.swap_inserted exchanges
 * up to and including the tick. Pure function of (trace, tick).
 */
export function logicalToPhysicalAt(trace: Trace, tick: number): ReadonlyMap<number, number> {
  const map = new Map<number, number>();
  for (const event of trace.events) {
    if (event.logicalTick > tick) continue;
    if (event.eventType === 'layout.assigned') applyLayoutAssigned(map, event);
    else if (event.eventType === 'routing.swap_inserted') applySwapInserted(map, event);
  }
  return map;
}

/**
 * Whether the trace ever records a layout decision at all.
 *
 * Traces produced by the reference compiler or the Qiskit bridge always
 * emit `layout.assigned`; a hand-authored or partial trace may carry only
 * a header `initialLayout`. Surfaces use this to tell "the compiler has
 * not chosen a layout yet at this tick" (show nothing) apart from "this
 * trace records no layout stage" (the header value is all there is).
 */
export function hasLayoutAssignment(trace: Trace): boolean {
  return trace.events.some((event) => event.eventType === 'layout.assigned');
}

/** Inverse view: physical qubit -> logical qubit at the tick. */
export function physicalToLogicalAt(trace: Trace, tick: number): ReadonlyMap<number, number> {
  const inverse = new Map<number, number>();
  for (const [logical, physical] of logicalToPhysicalAt(trace, tick)) {
    inverse.set(physical, logical);
  }
  return inverse;
}
