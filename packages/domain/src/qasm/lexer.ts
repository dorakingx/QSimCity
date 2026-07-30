export type TokenType =
  | 'identifier'
  | 'number'
  | 'string'
  | 'symbol'
  | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly line: number;
  readonly col: number;
}

export class QasmError extends Error {
  readonly line: number;
  readonly col: number;

  constructor(message: string, line: number, col: number) {
    super(`${message} (line ${line}, column ${col})`);
    this.name = 'QasmError';
    this.line = line;
    this.col = col;
  }
}

const SYMBOLS = ['==', '->', '(', ')', '[', ']', '{', '}', ';', ',', '+', '-', '*', '/', '^'];

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (n: number): void => {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < source.length) {
    const ch = source[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance(1);
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') advance(1);
      continue;
    }
    if (ch === '"') {
      const startLine = line;
      const startCol = col;
      advance(1);
      let value = '';
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\n') throw new QasmError('Unterminated string literal', startLine, startCol);
        value += source[i];
        advance(1);
      }
      if (i >= source.length) throw new QasmError('Unterminated string literal', startLine, startCol);
      advance(1);
      tokens.push({ type: 'string', value, line: startLine, col: startCol });
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const startLine = line;
      const startCol = col;
      let value = '';
      while (i < source.length && /[0-9.]/.test(source[i]!)) {
        value += source[i];
        advance(1);
      }
      // Scientific notation, e.g. 1.5e-3
      if (i < source.length && /[eE]/.test(source[i]!) && /[0-9+-]/.test(source[i + 1] ?? '')) {
        value += source[i];
        advance(1);
        if (/[+-]/.test(source[i] ?? '')) {
          value += source[i];
          advance(1);
        }
        while (i < source.length && /[0-9]/.test(source[i]!)) {
          value += source[i];
          advance(1);
        }
      }
      if (!/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)) {
        throw new QasmError(`Malformed number: ${value}`, startLine, startCol);
      }
      tokens.push({ type: 'number', value, line: startLine, col: startCol });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const startLine = line;
      const startCol = col;
      let value = '';
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) {
        value += source[i];
        advance(1);
      }
      tokens.push({ type: 'identifier', value, line: startLine, col: startCol });
      continue;
    }
    const two = source.slice(i, i + 2);
    if (SYMBOLS.includes(two)) {
      tokens.push({ type: 'symbol', value: two, line, col });
      advance(2);
      continue;
    }
    if (SYMBOLS.includes(ch)) {
      tokens.push({ type: 'symbol', value: ch, line, col });
      advance(1);
      continue;
    }
    throw new QasmError(`Unexpected character: ${JSON.stringify(ch)}`, line, col);
  }
  tokens.push({ type: 'eof', value: '', line, col });
  return tokens;
}
