import {
  makeCircuit,
  makeInstruction,
  type Circuit,
  type Condition,
  type Instruction,
} from '../circuit.js';
import { isKnownGate, gateDef } from '../gates.js';
import { QasmError, tokenize, type Token } from './lexer.js';

/**
 * OpenQASM 2.0 parser (subset). Supported: OPENQASM header,
 * include "qelib1.inc", qreg/creg, built-in and qelib1 gate applications,
 * user `gate` definitions (expanded inline), measure, reset, barrier,
 * if (creg == n) <op>, register broadcasting, and constant parameter
 * expressions with pi, + - * / ^, unary minus, and sin/cos/tan/exp/ln/sqrt.
 * Unsupported (rejected with position info): opaque declarations and
 * OpenQASM 3 syntax.
 */

export interface ParseLimits {
  readonly maxQubits: number;
  readonly maxClbits: number;
  readonly maxInstructions: number;
  readonly maxSourceLength: number;
  readonly maxGateDepth: number;
}

export const DEFAULT_PARSE_LIMITS: ParseLimits = {
  maxQubits: 24,
  maxClbits: 64,
  maxInstructions: 20000,
  maxSourceLength: 512 * 1024,
  maxGateDepth: 32,
};

interface GateDefinition {
  readonly name: string;
  readonly params: readonly string[];
  readonly qubits: readonly string[];
  readonly body: readonly BodyOp[];
}

interface BodyOp {
  readonly name: string;
  readonly paramExprs: readonly Expr[];
  readonly qubitArgs: readonly string[];
  readonly line: number;
  readonly col: number;
  readonly isBarrier?: boolean;
}

type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'pi' }
  | { kind: 'param'; name: string }
  | { kind: 'neg'; operand: Expr }
  | { kind: 'binop'; op: '+' | '-' | '*' | '/' | '^'; left: Expr; right: Expr }
  | { kind: 'call'; fn: string; operand: Expr };

const FUNCTIONS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  ln: Math.log,
  sqrt: Math.sqrt,
};

/** qelib1-style gates expanded to the native gate set. */
const QELIB_MACROS: Record<string, GateDefinition> = {
  u1: {
    name: 'u1',
    params: ['lambda'],
    qubits: ['a'],
    body: [op('p', [param('lambda')], ['a'])],
  },
  u2: {
    name: 'u2',
    params: ['phi', 'lambda'],
    qubits: ['a'],
    body: [op('u', [binop('/', pi(), num(2)), param('phi'), param('lambda')], ['a'])],
  },
  u3: {
    name: 'u3',
    params: ['theta', 'phi', 'lambda'],
    qubits: ['a'],
    body: [op('u', [param('theta'), param('phi'), param('lambda')], ['a'])],
  },
  cy: {
    name: 'cy',
    params: [],
    qubits: ['a', 'b'],
    body: [op('sdg', [], ['b']), op('cx', [], ['a', 'b']), op('s', [], ['b'])],
  },
  ch: {
    name: 'ch',
    params: [],
    qubits: ['a', 'b'],
    // qelib1.inc definition
    body: [
      op('h', [], ['b']),
      op('sdg', [], ['b']),
      op('cx', [], ['a', 'b']),
      op('h', [], ['b']),
      op('t', [], ['b']),
      op('cx', [], ['a', 'b']),
      op('t', [], ['b']),
      op('h', [], ['b']),
      op('s', [], ['b']),
      op('x', [], ['b']),
      op('s', [], ['a']),
    ],
  },
  crz: {
    name: 'crz',
    params: ['lambda'],
    qubits: ['a', 'b'],
    body: [
      op('rz', [binop('/', param('lambda'), num(2))], ['b']),
      op('cx', [], ['a', 'b']),
      op('rz', [neg(binop('/', param('lambda'), num(2)))], ['b']),
      op('cx', [], ['a', 'b']),
    ],
  },
  cu1: {
    name: 'cu1',
    params: ['lambda'],
    qubits: ['a', 'b'],
    body: [op('cp', [param('lambda')], ['a', 'b'])],
  },
  rzz: {
    name: 'rzz',
    params: ['theta'],
    qubits: ['a', 'b'],
    body: [op('cx', [], ['a', 'b']), op('p', [param('theta')], ['b']), op('cx', [], ['a', 'b'])],
  },
  cswap: {
    name: 'cswap',
    params: [],
    qubits: ['a', 'b', 'c'],
    body: [op('cx', [], ['c', 'b']), op('ccx', [], ['a', 'b', 'c']), op('cx', [], ['c', 'b'])],
  },
};

function op(name: string, paramExprs: Expr[], qubitArgs: string[]): BodyOp {
  return { name, paramExprs, qubitArgs, line: 0, col: 0 };
}
function num(value: number): Expr {
  return { kind: 'num', value };
}
function pi(): Expr {
  return { kind: 'pi' };
}
function param(name: string): Expr {
  return { kind: 'param', name };
}
function neg(operand: Expr): Expr {
  return { kind: 'neg', operand };
}
function binop(o: '+' | '-' | '*' | '/' | '^', left: Expr, right: Expr): Expr {
  return { kind: 'binop', op: o, left, right };
}

interface Reg {
  readonly name: string;
  readonly size: number;
  readonly kind: 'qreg' | 'creg';
  readonly offset: number;
}

class Parser {
  private readonly tokens: Token[];
  private pos = 0;
  private readonly limits: ParseLimits;
  private readonly qregs = new Map<string, Reg>();
  private readonly cregs = new Map<string, Reg>();
  private readonly gateDefs = new Map<string, GateDefinition>(Object.entries(QELIB_MACROS));
  private includeSeen = false;
  private readonly instructions: Instruction[] = [];
  private numQubits = 0;
  private numClbits = 0;

  constructor(source: string, limits: ParseLimits) {
    this.limits = limits;
    if (source.length > limits.maxSourceLength) {
      throw new QasmError(
        `Source exceeds the ${Math.floor(limits.maxSourceLength / 1024)} KiB input limit`,
        1,
        1,
      );
    }
    this.tokens = tokenize(source);
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    const t = this.tokens[this.pos]!;
    if (t.type !== 'eof') this.pos++;
    return t;
  }

  private expectSymbol(sym: string): Token {
    const t = this.next();
    if (t.type !== 'symbol' || t.value !== sym) {
      throw new QasmError(`Expected "${sym}" but found "${t.value || 'end of input'}"`, t.line, t.col);
    }
    return t;
  }

  private expectIdentifier(): Token {
    const t = this.next();
    if (t.type !== 'identifier') {
      throw new QasmError(`Expected an identifier but found "${t.value || 'end of input'}"`, t.line, t.col);
    }
    return t;
  }

  private expectInteger(): number {
    const t = this.next();
    if (t.type !== 'number' || !/^\d+$/.test(t.value)) {
      throw new QasmError(`Expected an integer but found "${t.value || 'end of input'}"`, t.line, t.col);
    }
    return parseInt(t.value, 10);
  }

  parse(): Circuit {
    this.parseHeader();
    while (this.peek().type !== 'eof') {
      this.parseStatement();
    }
    const cregs = [...this.cregs.values()]
      .sort((a, b) => a.offset - b.offset)
      .map((r) => ({ name: r.name, size: r.size }));
    if (this.numQubits === 0) {
      const t = this.peek();
      throw new QasmError('Program declares no quantum register', t.line, t.col);
    }
    return makeCircuit({
      name: 'qasm-import',
      numQubits: this.numQubits,
      cregs,
      instructions: this.instructions,
    });
  }

  private parseHeader(): void {
    const t = this.peek();
    if (t.type === 'identifier' && t.value === 'OPENQASM') {
      this.next();
      const ver = this.next();
      if (ver.value !== '2.0') {
        throw new QasmError(
          `Unsupported OpenQASM version "${ver.value}" — only 2.0 is supported`,
          ver.line,
          ver.col,
        );
      }
      this.expectSymbol(';');
    } else {
      throw new QasmError('Program must begin with "OPENQASM 2.0;"', t.line, t.col);
    }
  }

  private parseStatement(): void {
    const t = this.peek();
    if (t.type !== 'identifier') {
      throw new QasmError(`Unexpected token "${t.value}"`, t.line, t.col);
    }
    switch (t.value) {
      case 'include':
        this.parseInclude();
        return;
      case 'qreg':
      case 'creg':
        this.parseRegDecl(t.value);
        return;
      case 'gate':
        this.parseGateDef();
        return;
      case 'opaque':
        throw new QasmError('Opaque gate declarations are not supported', t.line, t.col);
      case 'if':
        this.parseIf();
        return;
      case 'measure':
        this.parseMeasure(null);
        return;
      case 'reset':
        this.parseReset(null);
        return;
      case 'barrier':
        this.parseBarrier();
        return;
      default:
        this.parseGateApplication(null);
    }
  }

  private parseInclude(): void {
    const kw = this.next();
    const file = this.next();
    if (file.type !== 'string') {
      throw new QasmError('include expects a quoted file name', file.line, file.col);
    }
    if (file.value !== 'qelib1.inc') {
      throw new QasmError(
        `Only include "qelib1.inc" is supported, found "${file.value}"`,
        kw.line,
        kw.col,
      );
    }
    this.includeSeen = true;
    this.expectSymbol(';');
  }

  private parseRegDecl(kind: 'qreg' | 'creg'): void {
    this.next();
    const name = this.expectIdentifier();
    this.expectSymbol('[');
    const size = this.expectInteger();
    this.expectSymbol(']');
    this.expectSymbol(';');
    if (size < 1) {
      throw new QasmError(`Register ${name.value} must have positive size`, name.line, name.col);
    }
    if (this.qregs.has(name.value) || this.cregs.has(name.value)) {
      throw new QasmError(`Register name "${name.value}" is already declared`, name.line, name.col);
    }
    if (kind === 'qreg') {
      if (this.numQubits + size > this.limits.maxQubits) {
        throw new QasmError(
          `Total qubits would exceed the supported limit of ${this.limits.maxQubits}`,
          name.line,
          name.col,
        );
      }
      this.qregs.set(name.value, { name: name.value, size, kind, offset: this.numQubits });
      this.numQubits += size;
    } else {
      if (this.numClbits + size > this.limits.maxClbits) {
        throw new QasmError(
          `Total classical bits would exceed the supported limit of ${this.limits.maxClbits}`,
          name.line,
          name.col,
        );
      }
      this.cregs.set(name.value, { name: name.value, size, kind, offset: this.numClbits });
      this.numClbits += size;
    }
  }

  private parseGateDef(): void {
    this.next();
    const name = this.expectIdentifier();
    if (this.qregs.size > 0 || this.cregs.size > 0) {
      // QASM2 requires gate definitions before use but not before regs; we
      // allow either ordering for user convenience.
    }
    if (isKnownGate(name.value) || this.gateDefs.has(name.value)) {
      throw new QasmError(`Gate "${name.value}" is already defined`, name.line, name.col);
    }
    let params: string[] = [];
    if (this.peek().type === 'symbol' && this.peek().value === '(') {
      this.next();
      params = this.parseIdentifierList();
      this.expectSymbol(')');
    }
    const qubits = this.parseIdentifierList();
    if (qubits.length === 0) {
      throw new QasmError(`Gate "${name.value}" must take at least one qubit`, name.line, name.col);
    }
    this.expectSymbol('{');
    const body: BodyOp[] = [];
    while (!(this.peek().type === 'symbol' && this.peek().value === '}')) {
      const t = this.peek();
      if (t.type === 'eof') throw new QasmError('Unterminated gate body', name.line, name.col);
      if (t.type === 'identifier' && t.value === 'barrier') {
        this.next();
        this.parseIdentifierList();
        this.expectSymbol(';');
        continue;
      }
      body.push(this.parseBodyOp(params, qubits));
    }
    this.expectSymbol('}');
    this.gateDefs.set(name.value, { name: name.value, params, qubits, body });
  }

  private parseIdentifierList(): string[] {
    const out: string[] = [];
    if (this.peek().type !== 'identifier') return out;
    out.push(this.expectIdentifier().value);
    while (this.peek().type === 'symbol' && this.peek().value === ',') {
      this.next();
      out.push(this.expectIdentifier().value);
    }
    return out;
  }

  private parseBodyOp(gateParams: readonly string[], gateQubits: readonly string[]): BodyOp {
    const name = this.expectIdentifier();
    let paramExprs: Expr[] = [];
    if (this.peek().type === 'symbol' && this.peek().value === '(') {
      this.next();
      if (!(this.peek().type === 'symbol' && this.peek().value === ')')) {
        paramExprs = [this.parseExpr(gateParams)];
        while (this.peek().type === 'symbol' && this.peek().value === ',') {
          this.next();
          paramExprs.push(this.parseExpr(gateParams));
        }
      }
      this.expectSymbol(')');
    }
    const qubitArgs: string[] = [];
    const first = this.expectIdentifier();
    if (!gateQubits.includes(first.value)) {
      throw new QasmError(`Unknown qubit argument "${first.value}" in gate body`, first.line, first.col);
    }
    qubitArgs.push(first.value);
    while (this.peek().type === 'symbol' && this.peek().value === ',') {
      this.next();
      const q = this.expectIdentifier();
      if (!gateQubits.includes(q.value)) {
        throw new QasmError(`Unknown qubit argument "${q.value}" in gate body`, q.line, q.col);
      }
      qubitArgs.push(q.value);
    }
    this.expectSymbol(';');
    const resolved = this.resolveGateName(name.value, name.line, name.col);
    if (resolved.kind === 'unknown') {
      throw new QasmError(`Unknown gate "${name.value}" in gate body`, name.line, name.col);
    }
    return { name: name.value, paramExprs, qubitArgs, line: name.line, col: name.col };
  }

  private resolveGateName(
    name: string,
    line: number,
    col: number,
  ): { kind: 'native' | 'macro' | 'unknown' } {
    // U and CX are QASM2 primitives with uppercase names.
    if (name === 'U' || name === 'CX') return { kind: 'native' };
    if (isKnownGate(name)) {
      if (!this.includeSeen && !['u', 'p'].includes(name)) {
        throw new QasmError(
          `Gate "${name}" requires include "qelib1.inc"`,
          line,
          col,
        );
      }
      return { kind: 'native' };
    }
    if (this.gateDefs.has(name)) {
      if (name in QELIB_MACROS && !this.includeSeen) {
        throw new QasmError(`Gate "${name}" requires include "qelib1.inc"`, line, col);
      }
      return { kind: 'macro' };
    }
    return { kind: 'unknown' };
  }

  private parseIf(): void {
    this.next();
    this.expectSymbol('(');
    const regName = this.expectIdentifier();
    const reg = this.cregs.get(regName.value);
    if (!reg) {
      throw new QasmError(`Unknown classical register "${regName.value}" in if`, regName.line, regName.col);
    }
    this.expectSymbol('==');
    const value = this.expectInteger();
    this.expectSymbol(')');
    const condition: Condition = { creg: reg.name, value };
    const t = this.peek();
    if (t.type === 'identifier' && t.value === 'measure') {
      this.parseMeasure(condition);
    } else if (t.type === 'identifier' && t.value === 'reset') {
      this.parseReset(condition);
    } else {
      this.parseGateApplication(condition);
    }
  }

  private parseArgument(): { reg: Reg; index: number | null } {
    const name = this.expectIdentifier();
    const reg = this.qregs.get(name.value) ?? this.cregs.get(name.value);
    if (!reg) {
      throw new QasmError(`Unknown register "${name.value}"`, name.line, name.col);
    }
    if (this.peek().type === 'symbol' && this.peek().value === '[') {
      this.next();
      const index = this.expectInteger();
      this.expectSymbol(']');
      if (index >= reg.size) {
        throw new QasmError(
          `Index ${index} out of range for register ${reg.name}[${reg.size}]`,
          name.line,
          name.col,
        );
      }
      return { reg, index };
    }
    return { reg, index: null };
  }

  private parseMeasure(condition: Condition | null): void {
    this.next();
    const src = this.parseArgument();
    this.expectSymbol('->');
    const dst = this.parseArgument();
    const t = this.expectSymbol(';');
    if (src.reg.kind !== 'qreg') {
      throw new QasmError('measure source must be a quantum register', t.line, t.col);
    }
    if (dst.reg.kind !== 'creg') {
      throw new QasmError('measure target must be a classical register', t.line, t.col);
    }
    const pairs: [number, number][] = [];
    if (src.index === null && dst.index === null) {
      if (src.reg.size !== dst.reg.size) {
        throw new QasmError(
          `Register sizes differ: ${src.reg.name}[${src.reg.size}] vs ${dst.reg.name}[${dst.reg.size}]`,
          t.line,
          t.col,
        );
      }
      for (let k = 0; k < src.reg.size; k++) {
        pairs.push([src.reg.offset + k, dst.reg.offset + k]);
      }
    } else if (src.index !== null && dst.index !== null) {
      pairs.push([src.reg.offset + src.index, dst.reg.offset + dst.index]);
    } else {
      throw new QasmError('measure requires both sides indexed or both whole registers', t.line, t.col);
    }
    for (const [q, c] of pairs) {
      this.pushInstruction(
        makeInstruction({ kind: 'measure', name: 'measure', qubits: [q], clbits: [c], condition }),
        t.line,
        t.col,
      );
    }
  }

  private parseReset(condition: Condition | null): void {
    this.next();
    const arg = this.parseArgument();
    const t = this.expectSymbol(';');
    if (arg.reg.kind !== 'qreg') {
      throw new QasmError('reset expects a quantum register', t.line, t.col);
    }
    const targets =
      arg.index === null
        ? Array.from({ length: arg.reg.size }, (_, k) => arg.reg.offset + k)
        : [arg.reg.offset + arg.index];
    for (const q of targets) {
      this.pushInstruction(
        makeInstruction({ kind: 'reset', name: 'reset', qubits: [q], condition }),
        t.line,
        t.col,
      );
    }
  }

  private parseBarrier(): void {
    this.next();
    const args: { reg: Reg; index: number | null }[] = [];
    args.push(this.parseArgument());
    while (this.peek().type === 'symbol' && this.peek().value === ',') {
      this.next();
      args.push(this.parseArgument());
    }
    const t = this.expectSymbol(';');
    const qubits: number[] = [];
    for (const a of args) {
      if (a.reg.kind !== 'qreg') throw new QasmError('barrier expects quantum registers', t.line, t.col);
      if (a.index === null) {
        for (let k = 0; k < a.reg.size; k++) qubits.push(a.reg.offset + k);
      } else {
        qubits.push(a.reg.offset + a.index);
      }
    }
    // A qubit named both directly and via its register is harmless for a
    // barrier; deduplicate instead of rejecting.
    this.pushInstruction(
      makeInstruction({ kind: 'barrier', name: 'barrier', qubits: [...new Set(qubits)] }),
      t.line,
      t.col,
    );
  }

  private parseGateApplication(condition: Condition | null): void {
    const name = this.expectIdentifier();
    const resolved = this.resolveGateName(name.value, name.line, name.col);
    if (resolved.kind === 'unknown') {
      throw new QasmError(`Unknown gate "${name.value}"`, name.line, name.col);
    }
    let paramExprs: Expr[] = [];
    if (this.peek().type === 'symbol' && this.peek().value === '(') {
      this.next();
      if (!(this.peek().type === 'symbol' && this.peek().value === ')')) {
        paramExprs = [this.parseExpr([])];
        while (this.peek().type === 'symbol' && this.peek().value === ',') {
          this.next();
          paramExprs.push(this.parseExpr([]));
        }
      }
      this.expectSymbol(')');
    }
    const args: { reg: Reg; index: number | null }[] = [];
    args.push(this.parseArgument());
    while (this.peek().type === 'symbol' && this.peek().value === ',') {
      this.next();
      args.push(this.parseArgument());
    }
    const t = this.expectSymbol(';');
    for (const a of args) {
      if (a.reg.kind !== 'qreg') {
        throw new QasmError(`Gate ${name.value} expects quantum arguments`, name.line, name.col);
      }
    }
    const params = paramExprs.map((e) => this.evalExpr(e, new Map(), name.line, name.col));
    // Register broadcasting: full-register args of equal size are iterated.
    const broadcastSizes = args.filter((a) => a.index === null).map((a) => a.reg.size);
    const reps = broadcastSizes.length > 0 ? broadcastSizes[0]! : 1;
    if (broadcastSizes.some((s) => s !== reps)) {
      throw new QasmError('Broadcast registers must have equal sizes', name.line, name.col);
    }
    for (let k = 0; k < reps; k++) {
      const qubits = args.map((a) => (a.index === null ? a.reg.offset + k : a.reg.offset + a.index));
      this.applyGate(name.value, params, qubits, condition, name.line, name.col, 0);
    }
  }

  /** Expands macros recursively and emits native-gate instructions. */
  private applyGate(
    name: string,
    params: readonly number[],
    qubits: readonly number[],
    condition: Condition | null,
    line: number,
    col: number,
    depth: number,
  ): void {
    if (depth > this.limits.maxGateDepth) {
      throw new QasmError(`Gate expansion exceeds depth limit of ${this.limits.maxGateDepth}`, line, col);
    }
    const canonical = name === 'U' ? 'u' : name === 'CX' ? 'cx' : name;
    if (isKnownGate(canonical)) {
      const def = gateDef(canonical);
      if (qubits.length !== def.numQubits) {
        throw new QasmError(
          `Gate ${name} expects ${def.numQubits} qubit(s), got ${qubits.length}`,
          line,
          col,
        );
      }
      if (params.length !== def.numParams) {
        throw new QasmError(
          `Gate ${name} expects ${def.numParams} parameter(s), got ${params.length}`,
          line,
          col,
        );
      }
      if (new Set(qubits).size !== qubits.length) {
        throw new QasmError(`Gate ${name} repeats a qubit argument`, line, col);
      }
      this.pushInstruction(
        makeInstruction({ kind: 'gate', name: canonical, qubits, params, condition }),
        line,
        col,
      );
      return;
    }
    const macro = this.gateDefs.get(name);
    if (!macro) throw new QasmError(`Unknown gate "${name}"`, line, col);
    if (params.length !== macro.params.length) {
      throw new QasmError(
        `Gate ${name} expects ${macro.params.length} parameter(s), got ${params.length}`,
        line,
        col,
      );
    }
    if (qubits.length !== macro.qubits.length) {
      throw new QasmError(
        `Gate ${name} expects ${macro.qubits.length} qubit(s), got ${qubits.length}`,
        line,
        col,
      );
    }
    if (new Set(qubits).size !== qubits.length) {
      throw new QasmError(`Gate ${name} repeats a qubit argument`, line, col);
    }
    const paramEnv = new Map<string, number>();
    macro.params.forEach((p, i) => paramEnv.set(p, params[i]!));
    const qubitEnv = new Map<string, number>();
    macro.qubits.forEach((q, i) => qubitEnv.set(q, qubits[i]!));
    for (const bodyOp of macro.body) {
      const opParams = bodyOp.paramExprs.map((e) => this.evalExpr(e, paramEnv, line, col));
      const opQubits = bodyOp.qubitArgs.map((q) => qubitEnv.get(q)!);
      this.applyGate(bodyOp.name, opParams, opQubits, condition, line, col, depth + 1);
    }
  }

  private pushInstruction(instr: Instruction, line: number, col: number): void {
    if (this.instructions.length >= this.limits.maxInstructions) {
      throw new QasmError(
        `Program exceeds the supported limit of ${this.limits.maxInstructions} instructions`,
        line,
        col,
      );
    }
    // Deterministic per-parse ids so identical sources produce identical
    // traces (required for committed sample-trace hash comparison).
    this.instructions.push({ ...instr, id: `i${this.instructions.length}` });
  }

  // Expression parsing: standard precedence-climbing.
  private parseExpr(allowedParams: readonly string[]): Expr {
    return this.parseAdditive(allowedParams);
  }

  private parseAdditive(allowedParams: readonly string[]): Expr {
    let left = this.parseMultiplicative(allowedParams);
    while (this.peek().type === 'symbol' && (this.peek().value === '+' || this.peek().value === '-')) {
      const o = this.next().value as '+' | '-';
      left = { kind: 'binop', op: o, left, right: this.parseMultiplicative(allowedParams) };
    }
    return left;
  }

  private parseMultiplicative(allowedParams: readonly string[]): Expr {
    let left = this.parseUnary(allowedParams);
    while (this.peek().type === 'symbol' && (this.peek().value === '*' || this.peek().value === '/')) {
      const o = this.next().value as '*' | '/';
      left = { kind: 'binop', op: o, left, right: this.parseUnary(allowedParams) };
    }
    return left;
  }

  private parseUnary(allowedParams: readonly string[]): Expr {
    if (this.peek().type === 'symbol' && this.peek().value === '-') {
      this.next();
      return { kind: 'neg', operand: this.parseUnary(allowedParams) };
    }
    return this.parsePower(allowedParams);
  }

  private parsePower(allowedParams: readonly string[]): Expr {
    const base = this.parseAtom(allowedParams);
    if (this.peek().type === 'symbol' && this.peek().value === '^') {
      this.next();
      return { kind: 'binop', op: '^', left: base, right: this.parseUnary(allowedParams) };
    }
    return base;
  }

  private parseAtom(allowedParams: readonly string[]): Expr {
    const t = this.next();
    if (t.type === 'number') return { kind: 'num', value: parseFloat(t.value) };
    if (t.type === 'identifier') {
      if (t.value === 'pi') return { kind: 'pi' };
      if (t.value in FUNCTIONS) {
        this.expectSymbol('(');
        const operand = this.parseExpr(allowedParams);
        this.expectSymbol(')');
        return { kind: 'call', fn: t.value, operand };
      }
      if (allowedParams.includes(t.value)) return { kind: 'param', name: t.value };
      throw new QasmError(`Unknown parameter or function "${t.value}"`, t.line, t.col);
    }
    if (t.type === 'symbol' && t.value === '(') {
      const inner = this.parseExpr(allowedParams);
      this.expectSymbol(')');
      return inner;
    }
    throw new QasmError(`Unexpected token "${t.value || 'end of input'}" in expression`, t.line, t.col);
  }

  private evalExpr(expr: Expr, env: ReadonlyMap<string, number>, line: number, col: number): number {
    switch (expr.kind) {
      case 'num':
        return expr.value;
      case 'pi':
        return Math.PI;
      case 'param': {
        const v = env.get(expr.name);
        if (v === undefined) throw new QasmError(`Unbound parameter "${expr.name}"`, line, col);
        return v;
      }
      case 'neg':
        return -this.evalExpr(expr.operand, env, line, col);
      case 'call':
        return FUNCTIONS[expr.fn]!(this.evalExpr(expr.operand, env, line, col));
      case 'binop': {
        const l = this.evalExpr(expr.left, env, line, col);
        const r = this.evalExpr(expr.right, env, line, col);
        switch (expr.op) {
          case '+':
            return l + r;
          case '-':
            return l - r;
          case '*':
            return l * r;
          case '/':
            if (r === 0) throw new QasmError('Division by zero in parameter expression', line, col);
            return l / r;
          case '^':
            return l ** r;
        }
      }
    }
  }
}

export function parseQasm(source: string, limits: ParseLimits = DEFAULT_PARSE_LIMITS): Circuit {
  return new Parser(source, limits).parse();
}

export { QasmError } from './lexer.js';
