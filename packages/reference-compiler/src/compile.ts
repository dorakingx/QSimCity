import {
  circuitMetrics,
  makeCircuit,
  type Circuit,
  type CircuitMetrics,
  type Device,
  type Instruction,
} from '@qsimcity/domain';
import type { TraceBuilder } from 'qsimcity-trace';
import {
  layoutPass,
  normalizePass,
  optimizePass,
  routingPass,
  schedulePass,
  toMutable,
  translationPass,
  type MutableInstruction,
  type ScheduledInstruction,
} from './passes.js';

export const COMPILER_VERSION = '1.0.0';
export const COMPILER_NAME = 'qsimcity-reference-compiler';

export interface CompileOptions {
  readonly device: Device;
  readonly layoutMethod?: 'trivial' | 'interaction' | readonly number[];
  readonly optimize?: boolean;
  /** When provided, compiler passes emit trace events into this builder. */
  readonly traceBuilder?: TraceBuilder;
}

export interface CompileResult {
  readonly compiled: Circuit;
  readonly initialLayout: readonly number[];
  readonly finalLayout: readonly number[];
  readonly inputMetrics: CircuitMetrics;
  readonly compiledMetrics: CircuitMetrics;
  readonly schedule: readonly ScheduledInstruction[];
  readonly totalDurationNs: number;
  readonly swapCount: number;
  readonly translatedCount: number;
  readonly cancelledCount: number;
  readonly mergedCount: number;
}

function rebuild(
  numQubits: number,
  cregs: Circuit['cregs'],
  name: string,
  instructions: readonly MutableInstruction[],
  idPrefix: string,
): Circuit {
  const withIds: Instruction[] = instructions.map((instr, k) => ({
    id: `${idPrefix}${k}`,
    kind: instr.kind,
    name: instr.name,
    qubits: [...instr.qubits],
    params: [...instr.params],
    clbits: [...instr.clbits],
    condition: instr.condition,
  }));
  return makeCircuit({
    name,
    numQubits,
    cregs: cregs.map((r) => ({ name: r.name, size: r.size })),
    instructions: withIds,
  });
}

/**
 * The QSimCity Reference Compiler: a vendor-neutral, deterministic pipeline
 * (normalize -> layout -> route -> translate -> optimize -> schedule).
 * It is intentionally simpler than production transpilers such as Qiskit's
 * and makes no claim of producing identical output — equivalence is checked
 * semantically (unitary equality up to layout permutations), not
 * syntactically.
 */
export function compile(circuit: Circuit, options: CompileOptions): CompileResult {
  const device = options.device;
  const doOptimize = options.optimize ?? true;
  const tb = options.traceBuilder ?? null;
  const inputMetrics = circuitMetrics(circuit);

  // 1. Normalize: expand 3-qubit gates into {1q, cx}.
  const mutable = circuit.instructions.map(toMutable);
  const normalized = normalizePass(mutable);
  tb?.emit({
    eventType: 'circuit.normalized',
    stage: 'normalize',
    source: 'reference_compiler',
    payload: { instructionCount: normalized.instructions.length },
  });
  for (const d of normalized.decompositions) {
    tb?.emit({
      eventType: 'gate.decomposed',
      stage: 'normalize',
      source: 'reference_compiler',
      logicalQubits: d.qubits,
      payload: { gate: d.name, expandedInto: d.count },
    });
  }

  // 2. Initial layout.
  const layoutMethod: 'trivial' | 'interaction' | number[] = Array.isArray(options.layoutMethod)
    ? [...options.layoutMethod]
    : ((options.layoutMethod as 'trivial' | 'interaction' | undefined) ?? 'interaction');
  const { layout, method } = layoutPass(normalized.instructions, circuit.numQubits, device, layoutMethod);
  tb?.emit({
    eventType: 'layout.assigned',
    stage: 'layout',
    source: 'reference_compiler',
    logicalQubits: layout.map((_, l) => l),
    physicalQubits: [...layout],
    payload: { method, layout: [...layout], deviceId: device.id },
  });

  // 3. Routing with SWAP insertion.
  const routed = routingPass(normalized.instructions, circuit.numQubits, device, layout);
  for (const ev of routed.events) {
    if (ev.kind === 'route') {
      tb?.emit({
        eventType: 'route.selected',
        stage: 'routing',
        source: 'reference_compiler',
        logicalQubits: ev.logicalQubits,
        physicalQubits: ev.physicalPath,
        payload: { path: ev.physicalPath, length: ev.physicalPath.length },
      });
    } else {
      tb?.emit({
        eventType: 'routing.swap_inserted',
        stage: 'routing',
        source: 'reference_compiler',
        logicalQubits: ev.logicalQubits,
        physicalQubits: ev.physicalQubits,
        payload: { physicalQubits: ev.physicalQubits },
      });
    }
  }

  // 4. Basis translation.
  const translated = translationPass(routed.instructions, device.basisGates);
  if (translated.translatedCount > 0) {
    tb?.emit({
      eventType: 'gate.translated',
      stage: 'translation',
      source: 'reference_compiler',
      payload: {
        translatedCount: translated.translatedCount,
        basisGates: [...device.basisGates],
      },
    });
  }

  // 5. Peephole optimization.
  let finalInstructions = translated.instructions;
  let cancelledCount = 0;
  let mergedCount = 0;
  if (doOptimize) {
    const optimized = optimizePass(translated.instructions);
    finalInstructions = optimized.instructions;
    cancelledCount = optimized.cancelledCount;
    mergedCount = optimized.mergedCount;
    if (cancelledCount > 0) {
      tb?.emit({
        eventType: 'gate.cancelled',
        stage: 'optimization',
        source: 'reference_compiler',
        payload: { cancelledCount },
      });
    }
    tb?.emit({
      eventType: 'circuit.optimized',
      stage: 'optimization',
      source: 'reference_compiler',
      payload: { cancelledCount, mergedCount, instructionCount: finalInstructions.length },
    });
  }

  const compiled = rebuild(device.numQubits, circuit.cregs, `${circuit.name}@${device.id}`, finalInstructions, 'c');
  const compiledMetrics = circuitMetrics(compiled);

  // 6. ASAP scheduling with model durations.
  const { schedule, totalDurationNs } = schedulePass(
    finalInstructions,
    device.numQubits,
    circuit.numClbits,
    device,
  );
  for (const s of schedule) {
    const instr = compiled.instructions[s.index]!;
    tb?.emit({
      eventType: 'instruction.scheduled',
      stage: 'scheduling',
      source: 'reference_compiler',
      certainty: 'ESTIMATED',
      instructionId: instr.id,
      physicalQubits: [...instr.qubits],
      payload: { startNs: s.startNs, durationNs: s.durationNs },
      sourceDurationNs: s.durationNs,
      advanceTick: false,
    });
  }

  return {
    compiled,
    initialLayout: layout,
    finalLayout: routed.finalLayout,
    inputMetrics,
    compiledMetrics,
    schedule,
    totalDurationNs,
    swapCount: routed.swapCount,
    translatedCount: translated.translatedCount,
    cancelledCount,
    mergedCount,
  };
}
