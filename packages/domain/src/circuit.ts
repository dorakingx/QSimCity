import { gateDef, TWO_QUBIT_GATES } from './gates.js';

/** A classical register: a named group of classical bits. */
export interface Creg {
  readonly name: string;
  readonly size: number;
  /** Index of this register's bit 0 in the flattened classical-bit array. */
  readonly offset: number;
}

/** Condition for classically controlled operations (OpenQASM 2 `if`). */
export interface Condition {
  readonly creg: string;
  readonly value: number;
}

export type InstructionKind = 'gate' | 'measure' | 'reset' | 'barrier';

export interface Instruction {
  readonly id: string;
  readonly kind: InstructionKind;
  /** Gate name for kind 'gate'; 'measure' | 'reset' | 'barrier' otherwise. */
  readonly name: string;
  readonly qubits: readonly number[];
  readonly params: readonly number[];
  /** Flattened classical-bit targets, parallel to qubits (measure only). */
  readonly clbits: readonly number[];
  readonly condition: Condition | null;
}

export interface Circuit {
  readonly name: string;
  readonly numQubits: number;
  readonly numClbits: number;
  readonly cregs: readonly Creg[];
  readonly instructions: readonly Instruction[];
}

export interface CircuitMetrics {
  readonly gateCount: number;
  readonly twoQubitGateCount: number;
  readonly swapCount: number;
  readonly measureCount: number;
  readonly depth: number;
}

let instrCounter = 0;

/** Reset the instruction id counter (test isolation only). */
export function resetInstructionIds(): void {
  instrCounter = 0;
}

export function makeInstruction(partial: {
  kind?: InstructionKind;
  name: string;
  qubits: readonly number[];
  params?: readonly number[];
  clbits?: readonly number[];
  condition?: Condition | null;
  id?: string;
}): Instruction {
  const kind = partial.kind ?? 'gate';
  if (kind === 'gate') {
    const def = gateDef(partial.name);
    if (partial.qubits.length !== def.numQubits) {
      throw new Error(
        `Gate ${partial.name} expects ${def.numQubits} qubit(s), got ${partial.qubits.length}`,
      );
    }
    const params = partial.params ?? [];
    if (params.length !== def.numParams) {
      throw new Error(
        `Gate ${partial.name} expects ${def.numParams} parameter(s), got ${params.length}`,
      );
    }
  }
  const unique = new Set(partial.qubits);
  if (unique.size !== partial.qubits.length) {
    throw new Error(`Instruction ${partial.name} repeats a qubit argument`);
  }
  return {
    id: partial.id ?? `i${instrCounter++}`,
    kind,
    name: partial.name,
    qubits: [...partial.qubits],
    params: [...(partial.params ?? [])],
    clbits: [...(partial.clbits ?? [])],
    condition: partial.condition ?? null,
  };
}

export function makeCircuit(partial: {
  name?: string;
  numQubits: number;
  cregs?: readonly { name: string; size: number }[];
  instructions?: readonly Instruction[];
}): Circuit {
  if (!Number.isInteger(partial.numQubits) || partial.numQubits < 1) {
    throw new Error(`Circuit qubit count must be a positive integer, got ${partial.numQubits}`);
  }
  let offset = 0;
  const cregs: Creg[] = [];
  for (const r of partial.cregs ?? []) {
    if (!Number.isInteger(r.size) || r.size < 1) {
      throw new Error(`Classical register ${r.name} must have positive size`);
    }
    if (cregs.some((c) => c.name === r.name)) {
      throw new Error(`Duplicate classical register name: ${r.name}`);
    }
    cregs.push({ name: r.name, size: r.size, offset });
    offset += r.size;
  }
  const circuit: Circuit = {
    name: partial.name ?? 'circuit',
    numQubits: partial.numQubits,
    numClbits: offset,
    cregs,
    instructions: partial.instructions ? [...partial.instructions] : [],
  };
  for (const instr of circuit.instructions) validateInstruction(circuit, instr);
  return circuit;
}

export function validateInstruction(circuit: Circuit, instr: Instruction): void {
  for (const q of instr.qubits) {
    if (!Number.isInteger(q) || q < 0 || q >= circuit.numQubits) {
      throw new Error(
        `Instruction ${instr.name} references qubit ${q} outside 0..${circuit.numQubits - 1}`,
      );
    }
  }
  for (const c of instr.clbits) {
    if (!Number.isInteger(c) || c < 0 || c >= circuit.numClbits) {
      throw new Error(
        `Instruction ${instr.name} references classical bit ${c} outside 0..${circuit.numClbits - 1}`,
      );
    }
  }
  if (instr.condition) {
    const reg = circuit.cregs.find((r) => r.name === instr.condition!.creg);
    if (!reg) throw new Error(`Condition references unknown register ${instr.condition.creg}`);
    if (instr.condition.value < 0 || instr.condition.value >= 2 ** reg.size) {
      throw new Error(
        `Condition value ${instr.condition.value} outside register ${reg.name} range`,
      );
    }
  }
  if (instr.kind === 'measure' && instr.clbits.length !== instr.qubits.length) {
    throw new Error('Measure requires one classical bit per qubit');
  }
}

export function withInstructions(circuit: Circuit, instructions: readonly Instruction[]): Circuit {
  const next: Circuit = { ...circuit, instructions: [...instructions] };
  for (const instr of instructions) validateInstruction(next, instr);
  return next;
}

/**
 * Circuit depth counted over qubit and classical wires; barriers are
 * synchronization points but contribute no depth themselves.
 */
export function circuitMetrics(circuit: Circuit): CircuitMetrics {
  let gateCount = 0;
  let twoQubit = 0;
  let swaps = 0;
  let measures = 0;
  const qubitFront = new Array<number>(circuit.numQubits).fill(0);
  const clbitFront = new Array<number>(circuit.numClbits).fill(0);
  let depth = 0;
  for (const instr of circuit.instructions) {
    if (instr.kind === 'gate') {
      gateCount++;
      if (TWO_QUBIT_GATES.has(instr.name)) twoQubit++;
      if (instr.name === 'swap') swaps++;
    } else if (instr.kind === 'measure') {
      measures += instr.qubits.length;
    }
    const wires: number[] = [];
    for (const q of instr.qubits) wires.push(qubitFront[q]!);
    for (const c of instr.clbits) wires.push(clbitFront[c]!);
    if (instr.condition) {
      const reg = circuit.cregs.find((r) => r.name === instr.condition!.creg)!;
      for (let i = 0; i < reg.size; i++) wires.push(clbitFront[reg.offset + i]!);
    }
    const level = Math.max(0, ...wires) + (instr.kind === 'barrier' ? 0 : 1);
    for (const q of instr.qubits) qubitFront[q] = level;
    for (const c of instr.clbits) clbitFront[c] = level;
    if (instr.condition) {
      const reg = circuit.cregs.find((r) => r.name === instr.condition!.creg)!;
      for (let i = 0; i < reg.size; i++) clbitFront[reg.offset + i] = level;
    }
    depth = Math.max(depth, level);
  }
  return {
    gateCount,
    twoQubitGateCount: twoQubit,
    swapCount: swaps,
    measureCount: measures,
    depth,
  };
}

/** Flattened classical-bit index for a (register, bit) pair. */
export function clbitIndex(circuit: Circuit, cregName: string, bit: number): number {
  const reg = circuit.cregs.find((r) => r.name === cregName);
  if (!reg) throw new Error(`Unknown classical register: ${cregName}`);
  if (bit < 0 || bit >= reg.size)
    throw new Error(`Bit ${bit} outside register ${cregName}[${reg.size}]`);
  return reg.offset + bit;
}
