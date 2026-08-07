import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Engine boundary contracts (W1.10, W2.6): rendering code never invents
 * randomness (stable screenshots) and never touches the simulator, so
 * cameras, presets, and quality settings cannot mutate scientific state.
 * These are source-level guarantees checked against the real files.
 */

function sourceFiles(dir: string): { path: string; text: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ path: join(dir, f), text: readFileSync(join(dir, f), 'utf8') }));
}

const VISUAL_SRC = join(__dirname, '..', 'src');
const WORLD_SRC = join(__dirname, '..', '..', 'world', 'src');

describe('determinism (W1.10)', () => {
  it('never calls Math.random in world layout or rendering code', () => {
    for (const file of [...sourceFiles(VISUAL_SRC), ...sourceFiles(WORLD_SRC)]) {
      expect(file.text.includes('Math.random'), file.path).toBe(false);
    }
  });
});

describe('presentation cannot mutate science (W2.6)', () => {
  it('visual-engine never imports the simulator or trace builder', () => {
    for (const file of sourceFiles(VISUAL_SRC)) {
      expect(file.text.includes('@qsimcity/simulator'), file.path).toBe(false);
      expect(file.text.includes('TraceBuilder'), file.path).toBe(false);
    }
  });

  it('the engine only reads activity; it exposes no trace-writing API', () => {
    const engine = readFileSync(join(VISUAL_SRC, 'engine.ts'), 'utf8');
    // The one data entry point is setActivity/W setters; there is no method
    // that returns or stores a mutable trace.
    expect(engine.includes('setActivity')).toBe(true);
    expect(engine.includes('buildTrace')).toBe(false);
    expect(engine.includes('trace.events.push')).toBe(false);
  });

  it('cameras depend only on world geometry, never on trace data', () => {
    const cameras = readFileSync(join(VISUAL_SRC, 'cameras.ts'), 'utf8');
    expect(cameras.includes('qsimcity-trace')).toBe(false);
    expect(cameras.includes('Trace')).toBe(false);
  });
});
