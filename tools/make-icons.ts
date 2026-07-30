import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Generates the PWA icons programmatically (no binary assets in the repo;
 * everything reproducible from source). Renders the QSimCity mark — a
 * cyan circuit-triangle on the night-sky background — into raw RGBA and
 * encodes minimal PNG files.
 */

function crc32(buf: Uint8Array): number {
  let table = crcTable;
  if (!table) {
    table = crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]!) & 0xff]!;
  return (crc ^ -1) >>> 0;
}
let crcTable: Int32Array | null = null;

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const idat = deflateSync(raw);
  const parts = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(idat)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const BG: Rgb = { r: 10, g: 13, b: 22 };
const TRIANGLE: Rgb = { r: 56, g: 216, b: 208 };
const NODE_TOP: Rgb = { r: 102, g: 204, b: 255 };
const NODE_LEFT: Rgb = { r: 216, g: 58, b: 106 };
const NODE_RIGHT: Rgb = { r: 138, g: 216, b: 58 };

function renderIcon(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  const set = (x: number, y: number, c: Rgb): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = c.r;
    rgba[i + 1] = c.g;
    rgba[i + 2] = c.b;
    rgba[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) set(x, y, BG);
  }
  const s = size / 64;
  // Triangle outline: vertices (32,10), (54,46), (10,46) scaled.
  const verts: [number, number][] = [
    [32 * s, 10 * s],
    [54 * s, 46 * s],
    [10 * s, 46 * s],
  ];
  const thickness = Math.max(2, 3.2 * s);
  const drawLine = (a: [number, number], b: [number, number], c: Rgb): void => {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = a[0] + (b[0] - a[0]) * t;
      const cy = a[1] + (b[1] - a[1]) * t;
      const r = thickness / 2;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r * r) set(Math.round(cx + dx), Math.round(cy + dy), c);
        }
      }
    }
  };
  drawLine(verts[0]!, verts[1]!, TRIANGLE);
  drawLine(verts[1]!, verts[2]!, TRIANGLE);
  drawLine(verts[2]!, verts[0]!, TRIANGLE);
  const drawDisc = (cx: number, cy: number, radius: number, c: Rgb): void => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          set(Math.round(cx + dx), Math.round(cy + dy), c);
        }
      }
    }
  };
  const nodeR = Math.max(3, 5 * s);
  drawDisc(32 * s, 20 * s, nodeR, NODE_TOP);
  drawDisc(20 * s, 42 * s, nodeR, NODE_LEFT);
  drawDisc(44 * s, 42 * s, nodeR, NODE_RIGHT);
  return rgba;
}

const outDir = join(new URL('..', import.meta.url).pathname, 'apps', 'web', 'public', 'icons');
mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const png = encodePng(size, size, renderIcon(size));
  writeFileSync(join(outDir, `icon-${size}.png`), png);
  console.log(`Wrote icon-${size}.png (${png.length} bytes)`);
}
