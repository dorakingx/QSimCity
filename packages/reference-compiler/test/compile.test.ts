import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  getDevice,
  hasEdge,
  matEqualUpToGlobalPhase,
  makeCircuit,
  makeInstruction,
  parseQasm,
  getSampleCircuit,
  type Circuit,
  type Instruction,
} from '@qsimcity/domain';
import { compile } from '../src/compile.js';
import { circuitUnitary, reducedCompiledUnitary } from './utils.js';

const LINEAR5 = getDevice('linear-5');
const FULL5 = getDevice('full-5');
const GRID9 = getDevice('grid-3x3');

function gateOnly(circuit: Circuit): Circuit {
  return makeCircuit({
    name: circuit.name,
    numQubits: circuit.numQubits,
    cregs: circuit.cregs.map((r) => ({ name: r.name, size: r.size })),
    instructions: circuit.instructions.filter((i) => i.kind === 'gate') as Instruction[],
  });
}

/** Asserts semantic equivalence of input and compiled circuit. */
function expectEquivalent(circuit: Circuit, result: ReturnType<typeof compile>): void {
  const expected = circuitUnitary(circuit);
  const { unitary, leakage } = reducedCompiledUnitary(
    result.compiled,
    circuit.numQubits,
    result.initialLayout,
    result.finalLayout,
  );
  expect(leakage).toBeLessThan(1e-9);
  expect(matEqualUpToGlobalPhase(unitary, expected, 1 << circuit.numQubits, 1e-6)).toBe(true);
}

function expectCouplingCompliance(result: ReturnType<typeof compile>, deviceId: string): void {
  const device = getDevice(deviceId);
  for (const instr of result.compiled.instructions) {
    if (instr.kind === 'gate' && instr.qubits.length === 2) {
      expect(
        hasEdge(device, instr.qubits[0]!, instr.qubits[1]!),
        `illegal edge ${instr.qubits.join('-')} for ${instr.name}`,
      ).toBe(true);
    }
    if (instr.kind === 'gate') {
      expect([...device.basisGates, 'swap'].includes(instr.name), `non-basis gate ${instr.name}`).toBe(true);
    }
  }
  // After translation, swap must not survive (it is not in the basis).
  expect(result.compiled.instructions.some((i) => i.name === 'swap')).toBe(false);
}

describe('compile: semantic equivalence (spec §18.3)', () => {
  it('Bell circuit compiles to an equivalent circuit on linear-5', () => {
    const circuit = gateOnly(parseQasm(getSampleCircuit('bell').qasm));
    const result = compile(circuit, { device: LINEAR5 });
    expectEquivalent(circuit, result);
    expectCouplingCompliance(result, 'linear-5');
  });

  it('GHZ-4 compiles equivalently with trivial layout', () => {
    const circuit = gateOnly(parseQasm(getSampleCircuit('ghz-4').qasm));
    const result = compile(circuit, { device: LINEAR5, layoutMethod: 'trivial' });
    expectEquivalent(circuit, result);
  });

  it('QFT-3 (with swap and controlled phases) compiles equivalently', () => {
    const circuit = gateOnly(parseQasm(getSampleCircuit('qft-3').qasm));
    const result = compile(circuit, { device: LINEAR5 });
    expectEquivalent(circuit, result);
    expectCouplingCompliance(result, 'linear-5');
  });

  it('Toffoli decomposes and compiles equivalently', () => {
    const circuit = gateOnly(parseQasm(getSampleCircuit('toffoli').qasm));
    const result = compile(circuit, { device: LINEAR5 });
    expectEquivalent(circuit, result);
    expect(result.compiledMetrics.twoQubitGateCount).toBeGreaterThanOrEqual(6);
  });

  it('SWAP storm forces swap insertion on linear-5 but stays equivalent', () => {
    const circuit = gateOnly(parseQasm(getSampleCircuit('swap-storm').qasm));
    const result = compile(circuit, { device: LINEAR5, layoutMethod: 'trivial' });
    expect(result.swapCount).toBeGreaterThan(0);
    expectEquivalent(circuit, result);
    expectCouplingCompliance(result, 'linear-5');
  });

  it('all-to-all topology needs no swaps', () => {
    const circuit = gateOnly(parseQasm(getSampleCircuit('swap-storm').qasm));
    const result = compile(circuit, { device: FULL5, layoutMethod: 'trivial' });
    expect(result.swapCount).toBe(0);
    expectEquivalent(circuit, result);
  });

  it('property: random 3-qubit circuits compile equivalently on linear-5 and grid-9', () => {
    const gatePool = ['h', 'x', 'z', 's', 't', 'cx', 'cz', 'swap'] as const;
    const arbGate = fc.tuple(
      fc.constantFrom(...gatePool),
      fc.nat({ max: 2 }),
      fc.nat({ max: 2 }),
      fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    );
    fc.assert(
      fc.property(fc.array(arbGate, { minLength: 1, maxLength: 12 }), (specs) => {
        const instructions: Instruction[] = [];
        for (const [name, q0, q1raw] of specs) {
          const q1 = q1raw === q0 ? (q0 + 1) % 3 : q1raw;
          if (name === 'cx' || name === 'cz' || name === 'swap') {
            instructions.push(makeInstruction({ name, qubits: [q0, q1] }));
          } else {
            instructions.push(makeInstruction({ name, qubits: [q0] }));
          }
        }
        const circuit = makeCircuit({ name: 'random', numQubits: 3, instructions });
        for (const device of [LINEAR5, GRID9]) {
          const result = compile(circuit, { device });
          const expected = circuitUnitary(circuit);
          const { unitary, leakage } = reducedCompiledUnitary(
            result.compiled,
            3,
            result.initialLayout,
            result.finalLayout,
          );
          if (leakage > 1e-9) return false;
          if (!matEqualUpToGlobalPhase(unitary, expected, 8, 1e-6)) return false;
        }
        return true;
      }),
      { numRuns: 40 },
    );
    // Building full unitaries for two devices per case is heavy under
    // coverage instrumentation; allow the extra time rather than shrink
    // the search space.
  }, 30_000);

  it('property: parameterized rotations survive compilation', () => {
    const angle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });
    fc.assert(
      fc.property(angle, angle, angle, (a, b, c) => {
        const circuit = makeCircuit({
          numQubits: 2,
          instructions: [
            makeInstruction({ name: 'rx', qubits: [0], params: [a] }),
            makeInstruction({ name: 'cx', qubits: [0, 1] }),
            makeInstruction({ name: 'ry', qubits: [1], params: [b] }),
            makeInstruction({ name: 'cp', qubits: [0, 1], params: [c] }),
          ],
        });
        const result = compile(circuit, { device: LINEAR5 });
        const expected = circuitUnitary(circuit);
        const { unitary, leakage } = reducedCompiledUnitary(
          result.compiled,
          2,
          result.initialLayout,
          result.finalLayout,
        );
        return leakage < 1e-9 && matEqualUpToGlobalPhase(unitary, expected, 4, 1e-6);
      }),
      { numRuns: 60 },
    );
  });
});

describe('compile: structural guarantees', () => {
  it('is deterministic', () => {
    const circuit = gateOnly(parseQasm(getSampleCircuit('swap-storm').qasm));
    const a = compile(circuit, { device: LINEAR5 });
    const b = compile(circuit, { device: LINEAR5 });
    expect(a.compiled.instructions).toEqual(b.compiled.instructions);
    expect(a.initialLayout).toEqual(b.initialLayout);
    expect(a.finalLayout).toEqual(b.finalLayout);
  });

  it('respects manual layouts and rejects invalid ones', () => {
    const circuit = gateOnly(parseQasm(getSampleCircuit('bell').qasm));
    const result = compile(circuit, { device: LINEAR5, layoutMethod: [3, 4] });
    expect(result.initialLayout).toEqual([3, 4]);
    expectEquivalent(circuit, result);
    expect(() => compile(circuit, { device: LINEAR5, layoutMethod: [0] })).toThrow(/assign all/);
    expect(() => compile(circuit, { device: LINEAR5, layoutMethod: [0, 0] })).toThrow(/repeats/);
    expect(() => compile(circuit, { device: LINEAR5, layoutMethod: [0, 9] })).toThrow(/outside device/);
  });

  it('rejects circuits larger than the device', () => {
    const circuit = makeCircuit({
      numQubits: 6,
      instructions: [makeInstruction({ name: 'h', qubits: [5] })],
    });
    expect(() => compile(circuit, { device: LINEAR5 })).toThrow(/device .* has 5/);
  });

  it('optimization reduces gate count without changing semantics', () => {
    const circuit = makeCircuit({
      numQubits: 2,
      instructions: [
        makeInstruction({ name: 'cx', qubits: [0, 1] }),
        makeInstruction({ name: 'cx', qubits: [0, 1] }),
        makeInstruction({ name: 'x', qubits: [0] }),
        makeInstruction({ name: 'x', qubits: [0] }),
        makeInstruction({ name: 'h', qubits: [1] }),
      ],
    });
    const opt = compile(circuit, { device: FULL5, optimize: true, layoutMethod: 'trivial' });
    const raw = compile(circuit, { device: FULL5, optimize: false, layoutMethod: 'trivial' });
    expect(opt.compiledMetrics.gateCount).toBeLessThan(raw.compiledMetrics.gateCount);
    expect(opt.compiledMetrics.twoQubitGateCount).toBe(0);
    expectEquivalent(circuit, opt);
    expectEquivalent(circuit, raw);
  });

  it('disabling optimization preserves translated gates verbatim', () => {
    const circuit = makeCircuit({
      numQubits: 1,
      instructions: [
        makeInstruction({ name: 'z', qubits: [0] }),
        makeInstruction({ name: 'z', qubits: [0] }),
      ],
    });
    const raw = compile(circuit, { device: LINEAR5, optimize: false });
    const opt = compile(circuit, { device: LINEAR5, optimize: true });
    expect(raw.compiledMetrics.gateCount).toBe(2);
    expect(opt.compiledMetrics.gateCount).toBe(0); // z z = identity
  });

  it('measure and conditioned instructions pass through with mapped qubits', () => {
    const circuit = parseQasm(getSampleCircuit('dynamic-feedforward').qasm);
    const result = compile(circuit, { device: LINEAR5, layoutMethod: 'trivial' });
    const measures = result.compiled.instructions.filter((i) => i.kind === 'measure');
    expect(measures).toHaveLength(2);
    const conditioned = result.compiled.instructions.filter((i) => i.condition !== null);
    expect(conditioned.length).toBeGreaterThan(0);
    expect(result.compiled.cregs.map((r) => r.name)).toEqual(['m', 'c']);
  });

  it('metrics report input vs compiled honestly', () => {
    const circuit = gateOnly(parseQasm(getSampleCircuit('swap-storm').qasm));
    const result = compile(circuit, { device: LINEAR5, layoutMethod: 'trivial' });
    expect(result.inputMetrics.gateCount).toBe(circuit.instructions.length);
    expect(result.compiledMetrics.depth).toBeGreaterThanOrEqual(result.inputMetrics.depth);
    expect(result.swapCount).toBeGreaterThan(0);
  });

  it('produces a schedule covering every instruction with model durations', () => {
    const circuit = gateOnly(parseQasm(getSampleCircuit('bell').qasm));
    const result = compile(circuit, { device: LINEAR5 });
    expect(result.schedule).toHaveLength(result.compiled.instructions.length);
    expect(result.totalDurationNs).toBeGreaterThan(0);
    for (const s of result.schedule) {
      expect(s.startNs).toBeGreaterThanOrEqual(0);
      expect(s.durationNs).toBeGreaterThanOrEqual(0);
    }
  });

  it('parallel gates overlap in the schedule; dependent gates do not', () => {
    const circuit = makeCircuit({
      numQubits: 2,
      instructions: [
        makeInstruction({ name: 'sx', qubits: [0] }),
        makeInstruction({ name: 'sx', qubits: [1] }),
        makeInstruction({ name: 'cx', qubits: [0, 1] }),
      ],
    });
    const result = compile(circuit, { device: LINEAR5, layoutMethod: 'trivial', optimize: false });
    const [s0, s1, s2] = result.schedule;
    expect(s0!.startNs).toBe(0);
    expect(s1!.startNs).toBe(0);
    expect(s2!.startNs).toBeGreaterThanOrEqual(Math.max(s0!.durationNs, s1!.durationNs));
  });
});
