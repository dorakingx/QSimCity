import { describe, expect, it } from 'vitest';
import {
  circuitMetrics,
  clbitIndex,
  makeCircuit,
  makeInstruction,
  withInstructions,
} from '../src/circuit.js';

function bell() {
  return makeCircuit({
    numQubits: 2,
    cregs: [{ name: 'c', size: 2 }],
    instructions: [
      makeInstruction({ name: 'h', qubits: [0] }),
      makeInstruction({ name: 'cx', qubits: [0, 1] }),
      makeInstruction({ kind: 'measure', name: 'measure', qubits: [0], clbits: [0] }),
      makeInstruction({ kind: 'measure', name: 'measure', qubits: [1], clbits: [1] }),
    ],
  });
}

describe('makeInstruction', () => {
  it('rejects wrong qubit arity', () => {
    expect(() => makeInstruction({ name: 'cx', qubits: [0] })).toThrow(/expects 2 qubit/);
  });

  it('rejects wrong parameter count', () => {
    expect(() => makeInstruction({ name: 'rx', qubits: [0] })).toThrow(/expects 1 parameter/);
    expect(() => makeInstruction({ name: 'h', qubits: [0], params: [1] })).toThrow(
      /expects 0 parameter/,
    );
  });

  it('rejects repeated qubits', () => {
    expect(() => makeInstruction({ name: 'cx', qubits: [1, 1] })).toThrow(/repeats a qubit/);
  });

  it('assigns unique ids', () => {
    const a = makeInstruction({ name: 'h', qubits: [0] });
    const b = makeInstruction({ name: 'h', qubits: [0] });
    expect(a.id).not.toBe(b.id);
  });
});

describe('makeCircuit', () => {
  it('computes creg offsets in declaration order', () => {
    const c = makeCircuit({
      numQubits: 1,
      cregs: [
        { name: 'a', size: 2 },
        { name: 'b', size: 3 },
      ],
    });
    expect(c.numClbits).toBe(5);
    expect(c.cregs[1]).toMatchObject({ name: 'b', offset: 2 });
  });

  it('rejects non-positive qubit counts', () => {
    expect(() => makeCircuit({ numQubits: 0 })).toThrow(/positive integer/);
    expect(() => makeCircuit({ numQubits: 1.5 })).toThrow(/positive integer/);
  });

  it('rejects duplicate creg names', () => {
    expect(() =>
      makeCircuit({
        numQubits: 1,
        cregs: [
          { name: 'c', size: 1 },
          { name: 'c', size: 1 },
        ],
      }),
    ).toThrow(/Duplicate/);
  });

  it('rejects out-of-range qubit references', () => {
    expect(() =>
      makeCircuit({
        numQubits: 1,
        instructions: [makeInstruction({ name: 'h', qubits: [3] })],
      }),
    ).toThrow(/outside 0\.\.0/);
  });

  it('rejects out-of-range clbit references', () => {
    expect(() =>
      makeCircuit({
        numQubits: 1,
        cregs: [{ name: 'c', size: 1 }],
        instructions: [
          makeInstruction({ kind: 'measure', name: 'measure', qubits: [0], clbits: [5] }),
        ],
      }),
    ).toThrow(/classical bit 5/);
  });

  it('rejects conditions on unknown registers', () => {
    expect(() =>
      makeCircuit({
        numQubits: 1,
        cregs: [{ name: 'c', size: 1 }],
        instructions: [
          makeInstruction({ name: 'x', qubits: [0], condition: { creg: 'nope', value: 0 } }),
        ],
      }),
    ).toThrow(/unknown register/);
  });

  it('rejects condition values outside the register range', () => {
    expect(() =>
      makeCircuit({
        numQubits: 1,
        cregs: [{ name: 'c', size: 1 }],
        instructions: [
          makeInstruction({ name: 'x', qubits: [0], condition: { creg: 'c', value: 2 } }),
        ],
      }),
    ).toThrow(/outside register/);
  });
});

describe('circuitMetrics', () => {
  it('counts gates, two-qubit gates, and measures for a Bell circuit', () => {
    const m = circuitMetrics(bell());
    expect(m.gateCount).toBe(2);
    expect(m.twoQubitGateCount).toBe(1);
    expect(m.swapCount).toBe(0);
    expect(m.measureCount).toBe(2);
  });

  it('computes depth over dependent wires', () => {
    const m = circuitMetrics(bell());
    // h(0) -> cx(0,1) -> measure(0), measure(1) both at depth 3
    expect(m.depth).toBe(3);
  });

  it('parallel gates on distinct qubits share a depth level', () => {
    const c = makeCircuit({
      numQubits: 2,
      instructions: [
        makeInstruction({ name: 'h', qubits: [0] }),
        makeInstruction({ name: 'h', qubits: [1] }),
      ],
    });
    expect(circuitMetrics(c).depth).toBe(1);
  });

  it('barriers synchronize wires without adding depth', () => {
    const c = makeCircuit({
      numQubits: 2,
      instructions: [
        makeInstruction({ name: 'h', qubits: [0] }),
        makeInstruction({ kind: 'barrier', name: 'barrier', qubits: [0, 1] }),
        makeInstruction({ name: 'x', qubits: [1] }),
      ],
    });
    // x(1) must come after the barrier which waits for h(0): depth 2.
    expect(circuitMetrics(c).depth).toBe(2);
  });

  it('counts swap gates', () => {
    const c = makeCircuit({
      numQubits: 2,
      instructions: [makeInstruction({ name: 'swap', qubits: [0, 1] })],
    });
    expect(circuitMetrics(c).swapCount).toBe(1);
    expect(circuitMetrics(c).twoQubitGateCount).toBe(1);
  });

  it('conditions serialize against the whole condition register', () => {
    const c = makeCircuit({
      numQubits: 2,
      cregs: [{ name: 'm', size: 1 }],
      instructions: [
        makeInstruction({ kind: 'measure', name: 'measure', qubits: [0], clbits: [0] }),
        makeInstruction({ name: 'x', qubits: [1], condition: { creg: 'm', value: 1 } }),
      ],
    });
    // The conditioned x must wait for the measure writing register m.
    expect(circuitMetrics(c).depth).toBe(2);
  });
});

describe('helpers', () => {
  it('clbitIndex resolves register offsets', () => {
    const c = makeCircuit({
      numQubits: 1,
      cregs: [
        { name: 'a', size: 2 },
        { name: 'b', size: 2 },
      ],
    });
    expect(clbitIndex(c, 'b', 1)).toBe(3);
    expect(() => clbitIndex(c, 'z', 0)).toThrow(/Unknown/);
    expect(() => clbitIndex(c, 'a', 2)).toThrow(/outside register/);
  });

  it('withInstructions revalidates against the circuit', () => {
    const c = makeCircuit({ numQubits: 1 });
    expect(() => withInstructions(c, [makeInstruction({ name: 'h', qubits: [4] })])).toThrow(
      /outside/,
    );
    const ok = withInstructions(c, [makeInstruction({ name: 'h', qubits: [0] })]);
    expect(ok.instructions).toHaveLength(1);
  });
});
