import type { ExplanationLevel } from '../content/explanations.js';

/**
 * Pure data model for the drag-and-drop circuit builder (spec section 7.2).
 * The grid compiles to OpenQASM 2.0 text that is fed through the exact same
 * parser and pipeline the Quantum Lab uses — the builder introduces no
 * separate science, only a friendlier way to write the same program.
 */

export const BUILDER_MAX_COLUMNS = 12;
export const BUILDER_MIN_QUBITS = 2;
export const BUILDER_MAX_QUBITS = 4;

export type BuilderGateId = 'h' | 'x' | 'z' | 'y' | 's' | 't' | 'rz' | 'cx' | 'swap' | 'measure';

export interface PaletteGate {
  readonly id: BuilderGateId;
  readonly label: string;
  readonly symbol: string;
  readonly twoQubit: boolean;
  readonly description: string;
}

const PALETTE: readonly PaletteGate[] = [
  { id: 'h', label: 'Hadamard', symbol: 'H', twoQubit: false, description: 'Half-and-half maker' },
  { id: 'x', label: 'X (flip)', symbol: 'X', twoQubit: false, description: 'Flips 0 and 1' },
  { id: 'z', label: 'Z (phase flip)', symbol: 'Z', twoQubit: false, description: 'Phase flip' },
  { id: 'cx', label: 'CX (link)', symbol: 'CX', twoQubit: true, description: 'Links two qubits' },
  {
    id: 'measure',
    label: 'Measure',
    symbol: 'M',
    twoQubit: false,
    description: 'Reads the qubit into a bit',
  },
  { id: 'y', label: 'Y', symbol: 'Y', twoQubit: false, description: 'Flip plus phase flip' },
  { id: 's', label: 'S', symbol: 'S', twoQubit: false, description: 'Quarter phase turn' },
  { id: 't', label: 'T', symbol: 'T', twoQubit: false, description: 'Eighth phase turn' },
  {
    id: 'rz',
    label: 'RZ (turn)',
    symbol: 'RZ',
    twoQubit: false,
    description: 'Turns the phase by a chosen angle',
  },
  {
    id: 'swap',
    label: 'SWAP',
    symbol: 'SW',
    twoQubit: true,
    description: 'Two qubits trade places',
  },
];

const CHILD_GATE_IDS: readonly BuilderGateId[] = ['h', 'x', 'z', 'cx', 'measure'];

/** Palette contents per explanation level (child sees the small set). */
export function paletteForLevel(level: ExplanationLevel): readonly PaletteGate[] {
  if (level === 'child') return PALETTE.filter((g) => CHILD_GATE_IDS.includes(g.id));
  return PALETTE;
}

export function paletteGate(id: BuilderGateId): PaletteGate {
  const gate = PALETTE.find((g) => g.id === id);
  if (!gate) throw new Error(`Unknown builder gate: ${id}`);
  return gate;
}

export interface BuilderPlacement {
  readonly id: number;
  readonly gate: BuilderGateId;
  readonly column: number;
  readonly qubit: number;
  /** Second lane for CX (target) and SWAP; null for one-qubit tiles. */
  readonly targetQubit: number | null;
}

export interface BuilderGridState {
  readonly numQubits: number;
  readonly placements: readonly BuilderPlacement[];
  readonly nextId: number;
}

export const EMPTY_BUILDER_STATE: BuilderGridState = {
  numQubits: 2,
  placements: [],
  nextId: 1,
};

/** Lanes a placement occupies (both lanes for two-qubit gates). */
export function occupiedLanes(placement: BuilderPlacement): readonly number[] {
  return placement.targetQubit === null
    ? [placement.qubit]
    : [placement.qubit, placement.targetQubit];
}

/** The placement occupying a specific cell, if any. */
export function placementAt(
  state: BuilderGridState,
  column: number,
  qubit: number,
): BuilderPlacement | null {
  return (
    state.placements.find((p) => p.column === column && occupiedLanes(p).includes(qubit)) ?? null
  );
}

export function canPlace(
  state: BuilderGridState,
  gate: BuilderGateId,
  column: number,
  qubit: number,
  targetQubit: number | null,
): boolean {
  if (column < 0 || column >= BUILDER_MAX_COLUMNS) return false;
  if (qubit < 0 || qubit >= state.numQubits) return false;
  if (placementAt(state, column, qubit) !== null) return false;
  const def = paletteGate(gate);
  if (def.twoQubit) {
    if (targetQubit === null) return false;
    if (targetQubit === qubit) return false;
    if (targetQubit < 0 || targetQubit >= state.numQubits) return false;
    if (placementAt(state, column, targetQubit) !== null) return false;
  } else if (targetQubit !== null) {
    return false;
  }
  return true;
}

export function withPlacement(
  state: BuilderGridState,
  gate: BuilderGateId,
  column: number,
  qubit: number,
  targetQubit: number | null,
): BuilderGridState {
  if (!canPlace(state, gate, column, qubit, targetQubit)) return state;
  return {
    ...state,
    placements: [...state.placements, { id: state.nextId, gate, column, qubit, targetQubit }],
    nextId: state.nextId + 1,
  };
}

export function withoutPlacement(state: BuilderGridState, id: number): BuilderGridState {
  return { ...state, placements: state.placements.filter((p) => p.id !== id) };
}

export function withQubitCount(state: BuilderGridState, numQubits: number): BuilderGridState {
  const clamped = Math.max(BUILDER_MIN_QUBITS, Math.min(BUILDER_MAX_QUBITS, numQubits));
  return {
    ...state,
    numQubits: clamped,
    placements: state.placements.filter((p) => occupiedLanes(p).every((lane) => lane < clamped)),
  };
}

/** The Bell-pair template (spec section 7.2): H, CX, measure both. */
export function bellTemplateState(): BuilderGridState {
  let state: BuilderGridState = { ...EMPTY_BUILDER_STATE, numQubits: 2 };
  state = withPlacement(state, 'h', 0, 0, null);
  state = withPlacement(state, 'cx', 1, 0, 1);
  state = withPlacement(state, 'measure', 2, 0, null);
  state = withPlacement(state, 'measure', 2, 1, null);
  return state;
}

/** A three-qubit GHZ chain, used by mission 2's reference configuration. */
export function ghzTemplateState(): BuilderGridState {
  let state: BuilderGridState = { ...EMPTY_BUILDER_STATE, numQubits: 3 };
  state = withPlacement(state, 'h', 0, 0, null);
  state = withPlacement(state, 'cx', 1, 0, 1);
  state = withPlacement(state, 'cx', 2, 1, 2);
  state = withPlacement(state, 'measure', 3, 0, null);
  state = withPlacement(state, 'measure', 3, 1, null);
  state = withPlacement(state, 'measure', 3, 2, null);
  return state;
}

function instructionQasm(p: BuilderPlacement): string {
  switch (p.gate) {
    case 'cx':
      return `cx q[${p.qubit}],q[${p.targetQubit}];`;
    case 'swap':
      return `swap q[${p.qubit}],q[${p.targetQubit}];`;
    case 'measure':
      return `measure q[${p.qubit}] -> c[${p.qubit}];`;
    case 'rz':
      return `rz(pi/2) q[${p.qubit}];`;
    default:
      return `${p.gate} q[${p.qubit}];`;
  }
}

/**
 * Compiles the grid to OpenQASM 2.0. Columns run left to right; within a
 * column, lower lanes come first. The output goes through the standard
 * parser, so the builder and the text editor share one science path.
 */
export function compileBuilderQasm(state: BuilderGridState): string {
  const ordered = [...state.placements].sort((a, b) => a.column - b.column || a.qubit - b.qubit);
  const lines = [
    'OPENQASM 2.0;',
    'include "qelib1.inc";',
    `qreg q[${state.numQubits}];`,
    `creg c[${state.numQubits}];`,
    ...ordered.map(instructionQasm),
  ];
  return `${lines.join('\n')}\n`;
}
