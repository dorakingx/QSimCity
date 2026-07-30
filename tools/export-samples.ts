import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_CIRCUITS } from '../packages/domain/src/samples.js';

/**
 * Exports the bundled sample circuits to examples/circuits/*.qasm so the
 * Python bridge and committed artifacts share one source of truth.
 * A test asserts the exported files stay in sync.
 */

const ROOT = new URL('..', import.meta.url).pathname;
const outDir = join(ROOT, 'examples', 'circuits');
mkdirSync(outDir, { recursive: true });
for (const sample of SAMPLE_CIRCUITS) {
  writeFileSync(join(outDir, `${sample.id}.qasm`), sample.qasm);
}
console.log(`Exported ${SAMPLE_CIRCUITS.length} sample circuits to examples/circuits/`);
