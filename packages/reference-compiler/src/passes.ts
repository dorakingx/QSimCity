import {
  gateDef,
  hasEdge,
  shortestPath,
  TWO_QUBIT_GATES,
  type Circuit,
  type Device,
  type Instruction,
} from '@qsimcity/domain';
import { normalizeAngle, unitaryToBasisOps } from './euler.js';

/**
 * Compiler passes operate on plain instruction lists; ids are reassigned
 * deterministically by the driver after every pass so traces are stable.
 */

export type MutableInstruction = {
  kind: Instruction['kind'];
  name: string;
  qubits: number[];
  params: number[];
  clbits: number[];
  condition: Instruction['condition'];
};

export function toMutable(instr: Instruction): MutableInstruction {
  return {
    kind: instr.kind,
    name: instr.name,
    qubits: [...instr.qubits],
    params: [...instr.params],
    clbits: [...instr.clbits],
    condition: instr.condition,
  };
}

function gate(name: string, qubits: number[], params: number[] = [], condition: Instruction['condition'] = null): MutableInstruction {
  return { kind: 'gate', name, qubits, params, clbits: [], condition };
}

/**
 * Normalization: expand gates with more than two qubits (and two-qubit gates
 * without a CX-based native path) into {1q, cx} so routing only ever sees
 * two-qubit interactions. Standard textbook decompositions are used.
 */
export function normalizePass(instructions: readonly MutableInstruction[]): {
  instructions: MutableInstruction[];
  decompositions: { name: string; qubits: number[]; count: number }[];
} {
  const out: MutableInstruction[] = [];
  const decompositions: { name: string; qubits: number[]; count: number }[] = [];
  for (const instr of instructions) {
    if (instr.kind !== 'gate') {
      out.push(instr);
      continue;
    }
    const c = instr.condition;
    switch (instr.name) {
      case 'ccx': {
        const [a, b, t] = instr.qubits as [number, number, number];
        // Standard 6-CX Toffoli decomposition.
        const seq = [
          gate('h', [t], [], c),
          gate('cx', [b, t], [], c),
          gate('tdg', [t], [], c),
          gate('cx', [a, t], [], c),
          gate('t', [t], [], c),
          gate('cx', [b, t], [], c),
          gate('tdg', [t], [], c),
          gate('cx', [a, t], [], c),
          gate('t', [b], [], c),
          gate('t', [t], [], c),
          gate('h', [t], [], c),
          gate('cx', [a, b], [], c),
          gate('t', [a], [], c),
          gate('tdg', [b], [], c),
          gate('cx', [a, b], [], c),
        ];
        out.push(...seq);
        decompositions.push({ name: 'ccx', qubits: instr.qubits, count: seq.length });
        break;
      }
      default:
        out.push(instr);
    }
  }
  return { instructions: out, decompositions };
}

export interface LayoutResult {
  /** logical qubit index -> physical qubit index */
  readonly layout: number[];
  readonly method: 'trivial' | 'interaction' | 'manual';
}

/** Interaction count between logical qubit pairs. */
function interactionGraph(instructions: readonly MutableInstruction[], numQubits: number): number[][] {
  const w: number[][] = Array.from({ length: numQubits }, () => new Array<number>(numQubits).fill(0));
  for (const instr of instructions) {
    if (instr.kind !== 'gate' || instr.qubits.length !== 2) continue;
    const [a, b] = instr.qubits as [number, number];
    w[a]![b]!++;
    w[b]![a]!++;
  }
  return w;
}

/**
 * Initial layout. 'trivial' maps logical i to physical i. 'interaction'
 * greedily places the most-interacting logical pair on the highest-degree
 * physical edge, then grows outward — a deterministic, explainable heuristic
 * (deliberately simpler than Qiskit's VF2/SABRE; see docs).
 */
export function layoutPass(
  instructions: readonly MutableInstruction[],
  numQubits: number,
  device: Device,
  method: 'trivial' | 'interaction' | number[],
): LayoutResult {
  if (Array.isArray(method)) {
    if (method.length !== numQubits) {
      throw new Error(`Manual layout must assign all ${numQubits} logical qubits`);
    }
    const seen = new Set<number>();
    for (const p of method) {
      if (!Number.isInteger(p) || p < 0 || p >= device.numQubits) {
        throw new Error(`Manual layout physical qubit ${p} outside device range`);
      }
      if (seen.has(p)) throw new Error(`Manual layout repeats physical qubit ${p}`);
      seen.add(p);
    }
    return { layout: [...method], method: 'manual' };
  }
  if (numQubits > device.numQubits) {
    throw new Error(
      `Circuit needs ${numQubits} qubits but device ${device.id} has ${device.numQubits}`,
    );
  }
  if (method === 'trivial') {
    return { layout: Array.from({ length: numQubits }, (_, i) => i), method: 'trivial' };
  }
  const weights = interactionGraph(instructions, numQubits);
  const degree = (p: number): number => device.edges.filter(([a, b]) => a === p || b === p).length;
  const physByDegree = Array.from({ length: device.numQubits }, (_, i) => i).sort(
    (a, b) => degree(b) - degree(a) || a - b,
  );
  const logicalByWeight = Array.from({ length: numQubits }, (_, i) => i).sort((a, b) => {
    const wa = weights[a]!.reduce((x, y) => x + y, 0);
    const wb = weights[b]!.reduce((x, y) => x + y, 0);
    return wb - wa || a - b;
  });
  const layout = new Array<number>(numQubits).fill(-1);
  const used = new Set<number>();
  for (const l of logicalByWeight) {
    // Prefer a free physical qubit adjacent to already-placed partners.
    const partners = layout
      .map((p, ql) => ({ p, ql }))
      .filter(({ p, ql }) => p !== -1 && weights[l]![ql]! > 0)
      .sort((x, y) => weights[l]![y.ql]! - weights[l]![x.ql]!);
    let chosen = -1;
    for (const { p } of partners) {
      const candidates = device.edges
        .flatMap(([a, b]) => (a === p ? [b] : b === p ? [a] : []))
        .filter((q) => !used.has(q))
        .sort((a, b) => degree(b) - degree(a) || a - b);
      if (candidates.length > 0) {
        chosen = candidates[0]!;
        break;
      }
    }
    if (chosen === -1) chosen = physByDegree.find((p) => !used.has(p))!;
    layout[l] = chosen;
    used.add(chosen);
  }
  return { layout, method: 'interaction' };
}

export interface RoutingEvent {
  readonly kind: 'route' | 'swap';
  readonly logicalQubits: number[];
  readonly physicalPath: number[];
  /** For swaps: the two physical qubits exchanged. */
  readonly physicalQubits: number[];
}

export interface RoutingResult {
  readonly instructions: MutableInstruction[];
  /** Final mapping logical -> physical after routing permutations. */
  readonly finalLayout: number[];
  readonly swapCount: number;
  readonly events: RoutingEvent[];
}

/**
 * Routing: rewrites logical-qubit instructions onto physical qubits under
 * `initialLayout`, inserting SWAPs along BFS shortest paths when a two-qubit
 * gate spans non-adjacent physical qubits. Deterministic (lowest-index
 * tie-breaking inside shortestPath).
 */
export function routingPass(
  instructions: readonly MutableInstruction[],
  numLogical: number,
  device: Device,
  initialLayout: readonly number[],
): RoutingResult {
  const logToPhys = [...initialLayout];
  const physToLog = new Map<number, number>();
  logToPhys.forEach((p, l) => physToLog.set(p, l));
  const out: MutableInstruction[] = [];
  const events: RoutingEvent[] = [];
  let swapCount = 0;

  const swapPhysical = (pa: number, pb: number, condition: Instruction['condition']): void => {
    out.push(gate('swap', [pa, pb], [], condition));
    const la = physToLog.get(pa);
    const lb = physToLog.get(pb);
    if (la !== undefined) logToPhys[la] = pb;
    if (lb !== undefined) logToPhys[lb] = pa;
    if (la !== undefined) physToLog.set(pb, la);
    else physToLog.delete(pb);
    if (lb !== undefined) physToLog.set(pa, lb);
    else physToLog.delete(pa);
    swapCount++;
    events.push({ kind: 'swap', logicalQubits: [la ?? -1, lb ?? -1].filter((x) => x >= 0), physicalPath: [], physicalQubits: [pa, pb] });
  };

  for (const instr of instructions) {
    if (instr.kind !== 'gate' || instr.qubits.length === 1) {
      out.push({ ...instr, qubits: instr.qubits.map((q) => logToPhys[q]!) });
      continue;
    }
    if (instr.qubits.length !== 2) {
      throw new Error(`Routing expects <=2 qubit gates after normalization, got ${instr.name}`);
    }
    const [la, lb] = instr.qubits as [number, number];
    let pa = logToPhys[la]!;
    let pb = logToPhys[lb]!;
    if (!hasEdge(device, pa, pb)) {
      const path = shortestPath(device, pa, pb);
      if (!path) throw new Error(`No path between physical qubits ${pa} and ${pb} on ${device.id}`);
      events.push({ kind: 'route', logicalQubits: [la, lb], physicalPath: path, physicalQubits: [] });
      // Swap la along the path until adjacent to pb.
      for (let i = 0; i + 2 < path.length; i++) {
        // SWAPs cannot be classically conditioned on hardware paths; the
        // reference model treats routing swaps as unconditional.
        swapPhysical(path[i]!, path[i + 1]!, null);
      }
      pa = logToPhys[la]!;
      pb = logToPhys[lb]!;
    }
    out.push({ ...instr, qubits: [pa, pb] });
  }
  return { instructions: out, finalLayout: logToPhys, swapCount, events };
}

export interface TranslationResult {
  readonly instructions: MutableInstruction[];
  readonly translatedCount: number;
}

/**
 * Basis translation into {rz, sx, x, cx}: swap -> 3 cx; cz/cp -> cx + phase
 * gates; every remaining 1-qubit gate -> ZYZ/SX sequence via Euler angles.
 */
export function translationPass(
  instructions: readonly MutableInstruction[],
  basisGates: readonly string[],
): TranslationResult {
  const basis = new Set(basisGates);
  const out: MutableInstruction[] = [];
  let translatedCount = 0;
  const emit1q = (name: string, params: number[], qubit: number, condition: Instruction['condition']): void => {
    const u = gateDef(name).matrix(params);
    for (const op of unitaryToBasisOps(u)) {
      out.push(gate(op.name, [qubit], op.param !== undefined ? [op.param] : [], condition));
    }
  };
  for (const instr of instructions) {
    if (instr.kind !== 'gate') {
      out.push(instr);
      continue;
    }
    if (basis.has(instr.name)) {
      out.push(instr);
      continue;
    }
    const c = instr.condition;
    translatedCount++;
    if (instr.qubits.length === 1) {
      emit1q(instr.name, instr.params, instr.qubits[0]!, c);
      continue;
    }
    const [a, b] = instr.qubits as [number, number];
    switch (instr.name) {
      case 'swap':
        out.push(gate('cx', [a, b], [], c), gate('cx', [b, a], [], c), gate('cx', [a, b], [], c));
        break;
      case 'cz':
        // cz = (I x H) cx (I x H)
        emit1q('h', [], b, c);
        out.push(gate('cx', [a, b], [], c));
        emit1q('h', [], b, c);
        break;
      case 'cp': {
        const l = instr.params[0]!;
        emit1q('p', [l / 2], a, c);
        out.push(gate('cx', [a, b], [], c));
        emit1q('p', [-l / 2], b, c);
        out.push(gate('cx', [a, b], [], c));
        emit1q('p', [l / 2], b, c);
        break;
      }
      default:
        throw new Error(`No basis translation for two-qubit gate ${instr.name}`);
    }
  }
  return { instructions: out, translatedCount };
}

export interface OptimizationResult {
  readonly instructions: MutableInstruction[];
  readonly cancelledCount: number;
  readonly mergedCount: number;
}

/**
 * Deterministic peephole optimization to a fixpoint (bounded):
 * adjacent cx-cx and x-x cancellation, sx-sx fusion to x, rz merging,
 * and removal of zero rotations. "Adjacent" means no intervening
 * instruction touches the involved qubits or a shared condition register.
 */
export function optimizePass(instructions: readonly MutableInstruction[]): OptimizationResult {
  const current = instructions.map((i) => ({
    ...i,
    qubits: [...i.qubits],
    params: [...i.params],
    clbits: [...i.clbits],
  }));
  let cancelledCount = 0;
  let mergedCount = 0;
  for (let round = 0; round < 20; round++) {
    let changed = false;
    let i = 0;
    while (i < current.length) {
      const a = current[i]!;
      if (a.kind !== 'gate' || a.condition) {
        i++;
        continue;
      }
      if (a.name === 'id' || (a.name === 'rz' && Math.abs(normalizeAngle(a.params[0]!)) < 1e-10)) {
        current.splice(i, 1);
        cancelledCount++;
        changed = true;
        continue;
      }
      // Find the next instruction touching any of a's qubits. Conditioned
      // instructions act as barriers because their firing depends on
      // classical state the optimizer does not track.
      let j = i + 1;
      let partner: MutableInstruction | null = null;
      while (j < current.length) {
        const b = current[j]!;
        const touches = b.qubits.some((q) => a.qubits.includes(q)) || b.condition !== null;
        if (touches) {
          const combinable =
            b.kind === 'gate' &&
            b.condition === null &&
            b.qubits.length === a.qubits.length &&
            b.qubits.every((q, k) => q === a.qubits[k]);
          partner = combinable ? b : null;
          break;
        }
        j++;
      }
      if (partner && ((a.name === 'cx' && partner.name === 'cx') || (a.name === 'x' && partner.name === 'x'))) {
        current.splice(j, 1);
        current.splice(i, 1);
        cancelledCount += 2;
        changed = true;
        continue;
      }
      if (partner && a.name === 'sx' && partner.name === 'sx') {
        current.splice(j, 1);
        current[i] = gate('x', [...a.qubits]);
        mergedCount++;
        changed = true;
        continue;
      }
      if (partner && a.name === 'rz' && partner.name === 'rz') {
        const merged = normalizeAngle(a.params[0]! + partner.params[0]!);
        current.splice(j, 1);
        if (Math.abs(merged) < 1e-10) {
          current.splice(i, 1);
          cancelledCount += 2;
        } else {
          current[i] = gate('rz', [...a.qubits], [merged]);
          mergedCount++;
        }
        changed = true;
        continue;
      }
      i++;
    }
    if (!changed) break;
  }
  return { instructions: current, cancelledCount, mergedCount };
}

export interface ScheduledInstruction {
  readonly index: number;
  readonly startNs: number;
  readonly durationNs: number;
}

/**
 * ASAP scheduling using the device's model durations. Purely a model of
 * instruction-level parallelism (certainty: ESTIMATED) — never a claim
 * about real hardware timing.
 */
export function schedulePass(
  instructions: readonly MutableInstruction[],
  numPhysical: number,
  numClbits: number,
  device: Device,
): { schedule: ScheduledInstruction[]; totalDurationNs: number } {
  const qubitFree = new Array<number>(numPhysical).fill(0);
  const clbitFree = new Array<number>(Math.max(1, numClbits)).fill(0);
  const schedule: ScheduledInstruction[] = [];
  let total = 0;
  instructions.forEach((instr, index) => {
    const duration =
      instr.kind === 'gate'
        ? (device.durations[instr.name] ?? device.durations['cx'] ?? 300)
        : instr.kind === 'measure'
          ? (device.durations['measure'] ?? 800)
          : instr.kind === 'reset'
            ? (device.durations['reset'] ?? 900)
            : 0;
    let start = 0;
    for (const q of instr.qubits) start = Math.max(start, qubitFree[q] ?? 0);
    for (const cb of instr.clbits) start = Math.max(start, clbitFree[cb] ?? 0);
    if (instr.condition) {
      // Conditioned instructions wait for every bit of the register; the
      // model approximates register lookup as instantaneous.
      for (let k = 0; k < clbitFree.length; k++) start = Math.max(start, clbitFree[k]!);
    }
    const end = start + duration;
    for (const q of instr.qubits) qubitFree[q] = end;
    for (const cb of instr.clbits) clbitFree[cb] = end;
    schedule.push({ index, startNs: start, durationNs: duration });
    total = Math.max(total, end);
  });
  return { schedule, totalDurationNs: total };
}
