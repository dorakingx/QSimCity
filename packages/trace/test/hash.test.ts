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
        fc.dictionary(
          fc.string({ maxLength: 8 }),
          fc.oneof(fc.integer(), fc.string({ maxLength: 8 })),
        ),
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

describe('UTF-8 encoding across all byte-length classes', () => {
  /**
   * The hash must agree with the Python implementation byte for byte, so
   * every UTF-8 encoding branch (1, 2, 3, and 4 byte sequences) needs
   * coverage. Three-byte sequences exercise a branch that ASCII and
   * astral-plane characters do not. Characters are written as escapes so the
   * English-only source policy still holds.
   */
  const ONE_BYTE = 'A';
  const TWO_BYTE = '\u00e9'; // e-acute
  const THREE_BYTE_A = '\u20ac'; // euro sign
  const THREE_BYTE_B = '\u2192'; // rightwards arrow
  const FOUR_BYTE = '\u{1f680}'; // rocket

  it('produces a distinct hash for each byte-length class', () => {
    const inputs = [ONE_BYTE, TWO_BYTE, THREE_BYTE_A, THREE_BYTE_B, FOUR_BYTE];
    const hashes = inputs.map((input) => fnv1a64(input));
    expect(new Set(hashes).size).toBe(inputs.length);
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('distinguishes three-byte characters that share leading bits', () => {
    // A wrong shift amount in the three-byte branch collapses characters
    // whose code points differ only in the upper bits.
    expect(fnv1a64('\u4e2d')).not.toBe(fnv1a64('\u56fd'));
    expect(fnv1a64('\u3042')).not.toBe(fnv1a64('\u3044'));
    expect(fnv1a64(THREE_BYTE_A)).not.toBe(fnv1a64(THREE_BYTE_B));
  });

  it('encodes a three-byte character as its exact UTF-8 bytes', () => {
    // U+20AC encodes to E2 82 AC. Hashing those bytes one code point at a
    // time must differ from hashing the character, proving the encoder is
    // emitting three bytes rather than passing the code unit through.
    const perByte = fnv1a64(
      String.fromCharCode(0xe2) + String.fromCharCode(0x82) + String.fromCharCode(0xac),
    );
    expect(fnv1a64(THREE_BYTE_A)).not.toBe(perByte);
  });
});
