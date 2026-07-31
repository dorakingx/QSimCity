import { describe, expect, it } from 'vitest';
import { parseQasm, QasmError } from '../src/qasm/parser.js';
import { SAMPLE_CIRCUITS } from '../src/samples.js';
import { circuitMetrics } from '../src/circuit.js';

function expectQasmError(source: string, pattern: RegExp, line?: number): void {
  try {
    parseQasm(source);
  } catch (e) {
    expect(e).toBeInstanceOf(QasmError);
    const err = e as QasmError;
    expect(err.message).toMatch(pattern);
    if (line !== undefined) expect(err.line).toBe(line);
    return;
  }
  throw new Error(`Expected parse to fail: ${pattern}`);
}

describe('parseQasm basics', () => {
  it('parses a minimal Bell circuit', () => {
    const c = parseQasm(`OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
measure q -> c;
`);
    expect(c.numQubits).toBe(2);
    expect(c.numClbits).toBe(2);
    expect(c.instructions.map((i) => i.name)).toEqual(['h', 'cx', 'measure', 'measure']);
  });

  it('parses every bundled sample circuit', () => {
    for (const sample of SAMPLE_CIRCUITS) {
      const c = parseQasm(sample.qasm);
      expect(c.numQubits, sample.id).toBeGreaterThan(0);
      expect(c.instructions.length, sample.id).toBeGreaterThan(0);
    }
  });

  it('requires the OPENQASM header', () => {
    expectQasmError('qreg q[1];', /must begin with/, 1);
  });

  it('rejects OpenQASM 3', () => {
    expectQasmError('OPENQASM 3.0;\nqreg q[1];', /only 2\.0/);
  });

  it('reports line and column for unknown gates', () => {
    try {
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nfrobnicate q[0];');
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as QasmError;
      expect(err).toBeInstanceOf(QasmError);
      expect(err.line).toBe(4);
      expect(err.col).toBe(1);
      expect(err.message).toContain('frobnicate');
    }
  });

  it('reports position for out-of-range register indices', () => {
    expectQasmError('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[5];', /out of range/, 4);
  });

  it('rejects gates that need qelib1 when include is missing', () => {
    expectQasmError('OPENQASM 2.0;\nqreg q[1];\nh q[0];', /requires include/);
  });

  it('allows U and CX primitives without include', () => {
    const c = parseQasm('OPENQASM 2.0;\nqreg q[2];\nU(pi/2,0,pi) q[0];\nCX q[0],q[1];');
    expect(c.instructions.map((i) => i.name)).toEqual(['u', 'cx']);
  });

  it('rejects duplicate register names', () => {
    expectQasmError('OPENQASM 2.0;\nqreg q[1];\ncreg q[1];', /already declared/);
  });

  it('rejects a program with no qreg', () => {
    expectQasmError('OPENQASM 2.0;\ncreg c[1];', /no quantum register/);
  });

  it('rejects opaque declarations with position info', () => {
    expectQasmError('OPENQASM 2.0;\nqreg q[1];\nopaque mystery a;', /not supported/, 3);
  });

  it('rejects repeated qubit arguments', () => {
    expectQasmError(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncx q[0],q[0];',
      /repeats a qubit/,
    );
  });
});

describe('parameter expressions', () => {
  it('evaluates pi arithmetic', () => {
    const c = parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nrz(pi/4) q[0];');
    expect(c.instructions[0]!.params[0]).toBeCloseTo(Math.PI / 4, 12);
  });

  it('evaluates nested expressions with precedence', () => {
    const c = parseQasm(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nrz(1+2*3) q[0];\nrx(-(1+1)) q[0];\nry(2^3) q[0];',
    );
    expect(c.instructions[0]!.params[0]).toBe(7);
    expect(c.instructions[1]!.params[0]).toBe(-2);
    expect(c.instructions[2]!.params[0]).toBe(8);
  });

  it('supports math functions', () => {
    const c = parseQasm(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nrz(cos(0)) q[0];\nrx(sqrt(4)) q[0];',
    );
    expect(c.instructions[0]!.params[0]).toBe(1);
    expect(c.instructions[1]!.params[0]).toBe(2);
  });

  it('rejects division by zero', () => {
    expectQasmError(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nrz(1/0) q[0];',
      /Division by zero/,
    );
  });

  it('supports scientific notation literals', () => {
    const c = parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nrz(1.5e-3) q[0];');
    expect(c.instructions[0]!.params[0]).toBeCloseTo(0.0015, 12);
  });
});

describe('register broadcasting', () => {
  it('broadcasts single-qubit gates over a register', () => {
    const c = parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\nh q;');
    expect(c.instructions.map((i) => [i.name, i.qubits[0]])).toEqual([
      ['h', 0],
      ['h', 1],
      ['h', 2],
    ]);
  });

  it('broadcasts two-qubit gates over equal-size registers', () => {
    const c = parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg a[2];\nqreg b[2];\ncx a,b;');
    expect(c.instructions.map((i) => i.qubits)).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it('mixes indexed and broadcast arguments', () => {
    const c = parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg a[2];\nqreg b[2];\ncx a[0],b;');
    expect(c.instructions.map((i) => i.qubits)).toEqual([
      [0, 2],
      [0, 3],
    ]);
  });

  it('rejects mismatched broadcast sizes', () => {
    expectQasmError(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg a[2];\nqreg b[3];\ncx a,b;',
      /equal sizes/,
    );
  });

  it('broadcasts measure over whole registers', () => {
    const c = parseQasm(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nmeasure q -> c;',
    );
    expect(c.instructions).toHaveLength(2);
    expect(c.instructions[1]!.clbits).toEqual([1]);
  });

  it('rejects measure with mismatched register sizes', () => {
    expectQasmError(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[3];\nmeasure q -> c;',
      /sizes differ/,
    );
  });
});

describe('custom gate definitions', () => {
  it('expands a user-defined gate into native instructions', () => {
    const c = parseQasm(`OPENQASM 2.0;
include "qelib1.inc";
gate bellpair a,b { h a; cx a,b; }
qreg q[2];
bellpair q[0],q[1];
`);
    expect(c.instructions.map((i) => i.name)).toEqual(['h', 'cx']);
  });

  it('binds gate parameters through expansion', () => {
    const c = parseQasm(`OPENQASM 2.0;
include "qelib1.inc";
gate wiggle(t) a { rz(t/2) a; rx(-t) a; }
qreg q[1];
wiggle(pi) q[0];
`);
    expect(c.instructions[0]!.params[0]).toBeCloseTo(Math.PI / 2, 12);
    expect(c.instructions[1]!.params[0]).toBeCloseTo(-Math.PI, 12);
  });

  it('supports nested custom gates', () => {
    const c = parseQasm(`OPENQASM 2.0;
include "qelib1.inc";
gate inner a { x a; }
gate outer a,b { inner a; cx a,b; inner b; }
qreg q[2];
outer q[0],q[1];
`);
    expect(c.instructions.map((i) => i.name)).toEqual(['x', 'cx', 'x']);
  });

  it('rejects redefining an existing gate', () => {
    expectQasmError(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\ngate h a { x a; }\nqreg q[1];',
      /already defined/,
    );
  });

  it('rejects unknown qubit names inside gate bodies', () => {
    expectQasmError(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\ngate bad a { x b; }\nqreg q[1];',
      /Unknown qubit argument/,
    );
  });

  it('expands qelib1 macros (cy, crz, rzz, cswap)', () => {
    const c = parseQasm(`OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
cy q[0],q[1];
crz(pi/2) q[0],q[1];
rzz(pi/4) q[0],q[1];
cswap q[0],q[1],q[2];
`);
    // All expand to native gates only.
    const names = new Set(c.instructions.map((i) => i.name));
    for (const n of names) {
      expect(['sdg', 'cx', 's', 'rz', 'p', 'ccx']).toContain(n);
    }
  });
});

describe('classical control and structure', () => {
  it('parses if-conditions onto gates', () => {
    const c = parseQasm(`OPENQASM 2.0;
include "qelib1.inc";
qreg q[1];
creg m[1];
measure q[0] -> m[0];
if (m == 1) x q[0];
`);
    expect(c.instructions[1]!.condition).toEqual({ creg: 'm', value: 1 });
  });

  it('parses if-conditions onto measure and reset', () => {
    const c = parseQasm(`OPENQASM 2.0;
include "qelib1.inc";
qreg q[1];
creg m[1];
if (m == 0) reset q[0];
if (m == 0) measure q[0] -> m[0];
`);
    expect(c.instructions[0]!.kind).toBe('reset');
    expect(c.instructions[0]!.condition).toEqual({ creg: 'm', value: 0 });
    expect(c.instructions[1]!.kind).toBe('measure');
  });

  it('rejects if on unknown registers', () => {
    expectQasmError(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nif (zz == 1) x q[0];',
      /Unknown classical register/,
    );
  });

  it('parses barrier with mixed arguments', () => {
    const c = parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\nbarrier q[0],q;');
    expect(c.instructions[0]!.kind).toBe('barrier');
    expect(c.instructions[0]!.qubits).toEqual([0, 1, 2]);
  });

  it('parses reset over a whole register', () => {
    const c = parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nreset q;');
    expect(c.instructions).toHaveLength(2);
    expect(c.instructions.every((i) => i.kind === 'reset')).toBe(true);
  });
});

describe('input limits and hostile input', () => {
  it('rejects programs exceeding the qubit limit', () => {
    expectQasmError('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[100];', /supported limit/);
  });

  it('rejects oversized sources', () => {
    const big = `OPENQASM 2.0;\n// ${'x'.repeat(600 * 1024)}\nqreg q[1];`;
    expectQasmError(big, /input limit/);
  });

  it('rejects unterminated strings', () => {
    expectQasmError('OPENQASM 2.0;\ninclude "qelib1', /Unterminated string/);
  });

  it('rejects unexpected characters with position', () => {
    expectQasmError('OPENQASM 2.0;\nqreg q[1];\n@bad', /Unexpected character/, 3);
  });

  it('rejects non-qelib includes', () => {
    expectQasmError('OPENQASM 2.0;\ninclude "evil.inc";\nqreg q[1];', /Only include "qelib1.inc"/);
  });

  it('rejects deep recursive gate expansion', () => {
    let src = 'OPENQASM 2.0;\ninclude "qelib1.inc";\ngate g0 a { x a; }\n';
    for (let i = 1; i <= 40; i++) src += `gate g${i} a { g${i - 1} a; }\n`;
    src += 'qreg q[1];\ng40 q[0];\n';
    expectQasmError(src, /depth limit/);
  });

  it('does not crash on malformed nonsense', () => {
    for (const bad of [
      '',
      ';;;;',
      'OPENQASM 2.0; ()[]{}',
      'OPENQASM 2.0;\nqreg;',
      'OPENQASM 2.0;\nqreg q[];',
    ]) {
      expect(() => parseQasm(bad)).toThrow(QasmError);
    }
  });

  it('metrics of parsed teleportation sample are sensible', () => {
    const sample = SAMPLE_CIRCUITS.find((s) => s.id === 'teleportation')!;
    const c = parseQasm(sample.qasm);
    const m = circuitMetrics(c);
    expect(c.numQubits).toBe(3);
    expect(c.numClbits).toBe(3);
    expect(m.measureCount).toBe(3);
    expect(c.instructions.some((i) => i.condition !== null)).toBe(true);
  });
});
