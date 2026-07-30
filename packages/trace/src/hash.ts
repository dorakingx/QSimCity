/**
 * Deterministic hashing for traces and program inputs. FNV-1a 64-bit over a
 * canonical JSON encoding (sorted object keys, no whitespace). BigInt keeps
 * the arithmetic exact; output is 16 lowercase hex characters.
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    // Encode code points as UTF-8 bytes for platform-independent results.
    const code = text.codePointAt(i)!;
    if (code > 0xffff) i++;
    const bytes = utf8Bytes(code);
    for (const b of bytes) {
      hash ^= BigInt(b);
      hash = (hash * FNV_PRIME) & MASK64;
    }
  }
  return hash.toString(16).padStart(16, '0');
}

function utf8Bytes(code: number): number[] {
  if (code < 0x80) return [code];
  if (code < 0x800) return [0xc0 | (code >> 6), 0x80 | (code & 0x3f)];
  if (code < 0x10000) {
    return [0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f)];
  }
  return [
    0xf0 | (code >> 18),
    0x80 | ((code >> 12) & 0x3f),
    0x80 | ((code >> 6) & 0x3f),
    0x80 | (code & 0x3f),
  ];
}

/** JSON with object keys sorted recursively; rejects non-finite numbers. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot canonicalize non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

export function hashValue(value: unknown): string {
  return fnv1a64(canonicalJson(value));
}
