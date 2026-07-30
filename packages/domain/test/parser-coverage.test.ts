import { describe, expect, it } from 'vitest';
import { parseQasm, QasmError, DEFAULT_PARSE_LIMITS } from '../src/qasm/parser.js';
import { tokenize } from '../src/qasm/lexer.js';
import { SAMPLE_CIRCUITS, getSampleCircuit } from '../src/samples.js';

/** Edge paths of the lexer/parser that the main suite does not reach. */

describe('lexer edges', () => {
  it('skips line comments and whitespace variants', () => {
    const tokens = tokenize('// comment\r\n\tOPENQASM\t2.0;// trailing');
    expect(tokens.map((t) => t.value)).toEqual(['OPENQASM', '2.0', ';', '']);
  });

  it('tracks line and column across newlines', () => {
    const tokens = tokenize('a\nbb\n  ccc');
    expect(tokens[1]).toMatchObject({ value: 'bb', line: 2, col: 1 });
    expect(tokens[2]).toMatchObject({ value: 'ccc', line: 3, col: 3 });
  });

  it('lexes two-character symbols', () => {
    expect(tokenize('== ->').map((t) => t.value)).toEqual(['==', '->', '']);
  });

  it('lexes leading-dot decimals and rejects malformed numbers', () => {
    expect(tokenize('.5').map((t) => t.value)).toEqual(['.5', '']);
    expect(() => tokenize('1.2.3')).toThrow(/Malformed number/);
  });

  it('rejects a string that hits end of input', () => {
    expect(() => tokenize('"abc')).toThrow(/Unterminated string/);
  });

  it('rejects a string interrupted by a newline', () => {
    expect(() => tokenize('"abc\ndef"')).toThrow(/Unterminated string/);
  });
});

describe('parser edges', () => {
  it('reports a missing semicolon with position', () => {
    try {
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2]\nh q[0];');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(QasmError);
      expect((e as QasmError).message).toMatch(/Expected ";"/);
    }
  });

  it('rejects a non-identifier where an identifier is required', () => {
    expect(() => parseQasm('OPENQASM 2.0;\nqreg 5[2];')).toThrow(/Expected an identifier/);
  });

  it('rejects a non-integer register size', () => {
    expect(() => parseQasm('OPENQASM 2.0;\nqreg q[x];')).toThrow(/Expected an integer/);
  });

  it('rejects gates applied to classical registers', () => {
    expect(() =>
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nh c[0];'),
    ).toThrow(/expects quantum arguments/);
  });

  it('rejects measure with a quantum destination', () => {
    expect(() =>
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nmeasure q[0] -> q[1];'),
    ).toThrow(/target must be a classical register/);
  });

  it('rejects measure from a classical source', () => {
    expect(() =>
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[2];\nmeasure c[0] -> c[1];'),
    ).toThrow(/source must be a quantum register/);
  });

  it('rejects half-indexed measure broadcasts', () => {
    expect(() =>
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nmeasure q[0] -> c;'),
    ).toThrow(/both sides indexed/);
  });

  it('rejects barrier on classical registers and reset on classical registers', () => {
    expect(() =>
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nbarrier c;'),
    ).toThrow(/barrier expects quantum registers/);
    expect(() =>
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nreset c;'),
    ).toThrow(/reset expects a quantum register/);
  });

  it('rejects unknown registers in arguments', () => {
    expect(() => parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nh z[0];')).toThrow(
      /Unknown register "z"/,
    );
  });

  it('rejects a gate definition with no qubit parameters', () => {
    expect(() => parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\ngate g { }\nqreg q[1];')).toThrow(
      /at least one qubit/,
    );
  });

  it('rejects an unterminated gate body', () => {
    expect(() => parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\ngate g a { x a;')).toThrow(
      /Unterminated gate body/,
    );
  });

  it('allows barriers inside gate bodies', () => {
    const c = parseQasm(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\ngate g a,b { x a; barrier a,b; x b; }\nqreg q[2];\ng q[0],q[1];',
    );
    expect(c.instructions.map((i) => i.name)).toEqual(['x', 'x']);
  });

  it('rejects wrong argument counts on macro gates', () => {
    expect(() =>
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\ngate g a,b { cx a,b; }\nqreg q[2];\ng q[0];'),
    ).toThrow(/expects 2 qubit/);
    expect(() =>
      parseQasm(
        'OPENQASM 2.0;\ninclude "qelib1.inc";\ngate g(t) a { rz(t) a; }\nqreg q[1];\ng q[0];',
      ),
    ).toThrow(/expects 1 parameter/);
  });

  it('rejects repeated qubits passed to a macro gate', () => {
    expect(() =>
      parseQasm(
        'OPENQASM 2.0;\ninclude "qelib1.inc";\ngate g a,b { cx a,b; }\nqreg q[2];\ng q[0],q[0];',
      ),
    ).toThrow(/repeats a qubit/);
  });

  it('rejects malformed expressions and unknown functions', () => {
    expect(() => parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nrz(;) q[0];')).toThrow(
      /Unexpected token/,
    );
    expect(() =>
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nrz(bogus) q[0];'),
    ).toThrow(/Unknown parameter or function/);
  });

  it('supports parenthesized expressions', () => {
    const c = parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nrz((1+2)*3) q[0];');
    expect(c.instructions[0]!.params[0]).toBe(9);
  });

  it('supports remaining math functions', () => {
    const c = parseQasm(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nrz(sin(0)) q[0];\nrz(tan(0)) q[0];\nrz(exp(0)) q[0];\nrz(ln(1)) q[0];',
    );
    expect(c.instructions.map((i) => i.params[0])).toEqual([0, 0, 1, 0]);
  });

  it('rejects an empty parameter list on a parameterized gate', () => {
    expect(() => parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nrz() q[0];')).toThrow(
      /expects 1 parameter/,
    );
  });

  it('rejects redefining a qelib macro and unknown gates in bodies', () => {
    expect(() => parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\ngate cy a,b { x a; }')).toThrow(
      /already defined/,
    );
    expect(() => parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\ngate g a { nope a; }')).toThrow(
      /Unknown gate "nope" in gate body/,
    );
  });

  it('rejects clbit indices beyond the register', () => {
    expect(() =>
      parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nmeasure q[0] -> c[3];'),
    ).toThrow(/out of range/);
  });

  it('enforces the classical-bit limit', () => {
    expect(() => parseQasm('OPENQASM 2.0;\nqreg q[1];\ncreg c[100];')).toThrow(/supported limit/);
  });

  it('enforces the instruction limit', () => {
    const limits = { ...DEFAULT_PARSE_LIMITS, maxInstructions: 3 };
    const src = `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\n${'h q[0];\n'.repeat(10)}`;
    expect(() => parseQasm(src, limits)).toThrow(/supported limit of 3 instructions/);
  });

  it('handles zero-size register declarations', () => {
    expect(() => parseQasm('OPENQASM 2.0;\nqreg q[0];')).toThrow(/positive size/);
  });

  it('rejects a bare version-less header token', () => {
    expect(() => parseQasm('include "qelib1.inc";')).toThrow(/must begin with/);
  });
});

describe('sample catalog', () => {
  it('every sample has an id, title, and description', () => {
    for (const s of SAMPLE_CIRCUITS) {
      expect(s.id.length).toBeGreaterThan(2);
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.description.length).toBeGreaterThan(20);
    }
  });

  it('getSampleCircuit throws for unknown ids', () => {
    expect(() => getSampleCircuit('missing')).toThrow(/Unknown sample circuit/);
  });
});
