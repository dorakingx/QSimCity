import { gateDef, type Circuit, type ComplexMatrix } from '@qsimcity/domain';
import { applyGate1, applyGate2, applyGate3, createState } from '@qsimcity/simulator';

/**
 * Builds the full unitary of a measurement-free circuit by simulating each
 * basis column. Exponential in qubits — test-only, small circuits.
 */
export function circuitUnitary(circuit: Circuit): ComplexMatrix {
  const dim = 1 << circuit.numQubits;
  const u = new Float64Array(dim * dim * 2);
  for (let col = 0; col < dim; col++) {
    const state = createState(circuit.numQubits);
    // Prepare basis state |col>.
    state.re[0] = 0;
    state.re[col] = 1;
    for (const instr of circuit.instructions) {
      if (instr.kind === 'barrier') continue;
      if (instr.kind !== 'gate') {
        throw new Error(`circuitUnitary requires measurement-free circuits, found ${instr.kind}`);
      }
      if (instr.condition) throw new Error('circuitUnitary cannot handle conditions');
      const def = gateDef(instr.name);
      const m = def.matrix(instr.params);
      if (def.numQubits === 1) applyGate1(state, m, instr.qubits[0]!);
      else if (def.numQubits === 2) applyGate2(state, m, instr.qubits[0]!, instr.qubits[1]!);
      else applyGate3(state, m, instr.qubits[0]!, instr.qubits[1]!, instr.qubits[2]!);
    }
    for (let row = 0; row < dim; row++) {
      u[2 * (row * dim + col)] = state.re[row]!;
      u[2 * (row * dim + col) + 1] = state.im[row]!;
    }
  }
  return u;
}

/**
 * Reduces a compiled circuit's unitary (on physical qubits) to the logical
 * space: column basis states are injected through `initialLayout`, rows are
 * read back through `finalLayout`, and any amplitude left on ancilla
 * physical qubits is reported as leakage (must be ~0 for a correct compile).
 */
export function reducedCompiledUnitary(
  compiled: Circuit,
  numLogical: number,
  initialLayout: readonly number[],
  finalLayout: readonly number[],
): { unitary: ComplexMatrix; leakage: number } {
  const dimL = 1 << numLogical;
  const dimP = 1 << compiled.numQubits;
  const out = new Float64Array(dimL * dimL * 2);
  let leakage = 0;
  const full = circuitUnitary(compiled);
  const usedPhysical = new Set([...initialLayout, ...finalLayout]);
  for (let col = 0; col < dimL; col++) {
    // Physical input index: logical bit l sits on initialLayout[l].
    let physCol = 0;
    for (let l = 0; l < numLogical; l++) {
      if ((col >> l) & 1) physCol |= 1 << initialLayout[l]!;
    }
    for (let physRow = 0; physRow < dimP; physRow++) {
      const re = full[2 * (physRow * dimP + physCol)]!;
      const im = full[2 * (physRow * dimP + physCol) + 1]!;
      const mag2 = re * re + im * im;
      if (mag2 < 1e-20) continue;
      // Ancilla physical qubits must stay |0>.
      let ancillaSet = false;
      for (let p = 0; p < compiled.numQubits; p++) {
        if (!usedPhysical.has(p) && ((physRow >> p) & 1) === 1) ancillaSet = true;
      }
      if (ancillaSet) {
        leakage += mag2;
        continue;
      }
      let logicalRow = 0;
      let mapped = true;
      for (let p = 0; p < compiled.numQubits; p++) {
        if (((physRow >> p) & 1) === 0) continue;
        const l = finalLayout.indexOf(p);
        if (l === -1) {
          mapped = false;
          break;
        }
        logicalRow |= 1 << l;
      }
      if (!mapped) {
        leakage += mag2;
        continue;
      }
      out[2 * (logicalRow * dimL + col)] = out[2 * (logicalRow * dimL + col)]! + re;
      out[2 * (logicalRow * dimL + col) + 1] = out[2 * (logicalRow * dimL + col) + 1]! + im;
    }
  }
  return { unitary: out, leakage };
}
