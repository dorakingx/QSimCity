import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanProhibitedNames } from '../check-prohibited-names.js';
import { scanLanguage } from '../check-language.js';
import { scanTodos } from '../check-todos.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'qsimcity-scan-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scanProhibitedNames', () => {
  it('rejects the first prohibited project name case-insensitively', () => {
    writeFileSync(join(dir, 'a.ts'), 'const x = "ketqat bridge";');
    const v = scanProhibitedNames(dir);
    expect(v).toHaveLength(1);
    expect(v[0]!.term).toBe('KetQat');
    expect(v[0]!.line).toBe(1);
  });

  it('rejects the second prohibited project name', () => {
    writeFileSync(join(dir, 'a.md'), 'about\nAlice in Quantumland here');
    const v = scanProhibitedNames(dir);
    expect(v).toHaveLength(1);
    expect(v[0]!.line).toBe(2);
  });

  it('rejects the title-cased legacy project name', () => {
    writeFileSync(join(dir, 'a.md'), 'Welcome to Quantum City!');
    expect(scanProhibitedNames(dir)).toHaveLength(1);
  });

  it('allows the generic lowercase phrase "quantum city"', () => {
    writeFileSync(join(dir, 'a.md'), 'an explorable 3D quantum city');
    expect(scanProhibitedNames(dir)).toHaveLength(0);
  });

  it('allows QSimCity everywhere', () => {
    writeFileSync(join(dir, 'a.ts'), 'export const name = "QSimCity"; // qsimcity-trace');
    expect(scanProhibitedNames(dir)).toHaveLength(0);
  });

  it('rejects bare SimCity', () => {
    writeFileSync(join(dir, 'a.md'), 'like SimCity but quantum');
    const v = scanProhibitedNames(dir);
    expect(v).toHaveLength(1);
    expect(v[0]!.term).toBe('SimCity');
  });

  it('allows the benchmark name only in approved paths', () => {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'reference-benchmark.md'), 'PGSimCity comparison');
    writeFileSync(join(dir, 'app.ts'), 'const bench = "PGSimCity";');
    const v = scanProhibitedNames(dir);
    expect(v).toHaveLength(1);
    expect(v[0]!.file).toBe('app.ts');
  });

  it('reports multiple occurrences with line numbers', () => {
    writeFileSync(join(dir, 'a.md'), 'ketqat\n\nketqat again');
    const v = scanProhibitedNames(dir);
    expect(v.map((x) => x.line)).toEqual([1, 3]);
  });

  it('skips node_modules and dist directories', () => {
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'x.ts'), 'ketqat');
    writeFileSync(join(dir, 'dist', 'x.js'), 'ketqat');
    expect(scanProhibitedNames(dir)).toHaveLength(0);
  });
});

describe('scanLanguage', () => {
  it('detects hiragana', () => {
    writeFileSync(join(dir, 'a.ts'), 'const label = "こんにちは";');
    const v = scanLanguage(dir);
    expect(v).toHaveLength(1);
    expect(v[0]!.line).toBe(1);
  });

  it('detects katakana and kanji', () => {
    writeFileSync(join(dir, 'a.md'), 'line1\nテスト');
    writeFileSync(join(dir, 'b.md'), '量子');
    expect(scanLanguage(dir)).toHaveLength(2);
  });

  it('detects full-width punctuation', () => {
    writeFileSync(join(dir, 'a.md'), 'hello！');
    expect(scanLanguage(dir)).toHaveLength(1);
  });

  it('passes plain English including accented Latin', () => {
    writeFileSync(join(dir, 'a.md'), 'Café naïve résumé — em dash, quotes “ok”');
    expect(scanLanguage(dir)).toHaveLength(0);
  });

  it('excludes third-party notices', () => {
    writeFileSync(join(dir, 'THIRD_PARTY_NOTICES.md'), 'ライセンス');
    expect(scanLanguage(dir)).toHaveLength(0);
  });
});

describe('scanTodos', () => {
  it('detects TODO markers', () => {
    writeFileSync(join(dir, 'a.ts'), '// TODO: finish this');
    const v = scanTodos(dir);
    expect(v).toHaveLength(1);
    expect(v[0]!.marker).toBe('TODO');
  });

  it('detects FIXME and PLACEHOLDER case-insensitively', () => {
    writeFileSync(join(dir, 'a.ts'), '// fixme later');
    writeFileSync(join(dir, 'b.ts'), 'const x = "placeholder";');
    expect(scanTodos(dir)).toHaveLength(2);
  });

  it('does not flag ordinary words containing marker letters', () => {
    writeFileSync(join(dir, 'a.ts'), 'const stubbornMethodology = "hacksaw";');
    expect(scanTodos(dir)).toHaveLength(0);
  });

  it('passes clean files', () => {
    writeFileSync(join(dir, 'a.ts'), 'export const done = true;');
    expect(scanTodos(dir)).toHaveLength(0);
  });
});
