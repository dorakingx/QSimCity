import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonicalJson, fnv1a64, hashValue } from '../src/hash.js';

describe('fnv1a64', () => {
  it('matches known FNV-1a 64 vectors', () => {
    // Standard reference vectors for FNV-1a 64-bit.
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('is deterministic', () => {
    expect(fnv1a64('qsimcity')).toBe(fnv1a64('qsimcity'));
  });

  it('changes for different inputs', () => {
    expect(fnv1a64('a')).not.toBe(fnv1a64('b'));
  });

  it('handles multi-byte UTF-8 code points', () => {
    const h1 = fnv1a64('café');
    const h2 = fnv1a64('cafe');
    expect(h1).not.toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('handles astral-plane characters', () => {
    expect(fnv1a64('\u{1F680}')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('drops undefined object values', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson({ a: NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson(Infinity)).toThrow(/non-finite/);
  });

  it('rejects functions', () => {
    expect(() => canonicalJson({ f: () => 1 })).toThrow(/Cannot canonicalize/);
  });

  it('property: key insertion order never changes the hash', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ maxLength: 8 }), fc.oneof(fc.integer(), fc.string({ maxLength: 8 }))),
        (obj) => {
          const reversed = Object.fromEntries(Object.entries(obj).reverse());
          return hashValue(obj) === hashValue(reversed);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('property: canonical JSON round-trips through JSON.parse', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        // jsonValue may contain -0 which JSON stringifies as 0; normalize.
        const json = canonicalJson(value);
        const reparsed: unknown = JSON.parse(json);
        return canonicalJson(reparsed) === json;
      }),
      { numRuns: 100 },
    );
  });
});
