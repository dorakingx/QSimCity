import type { ReactElement } from 'react';
import type { CertaintyLabel, SourceClassification } from 'qsimcity-trace';

/** User-facing certainty label chip (spec §10). */

export const CERTAINTY_DESCRIPTIONS: Readonly<Record<CertaintyLabel, string>> = {
  EXACT: 'Computed exactly by the statevector simulator (within floating-point precision).',
  COMPUTED: 'Deterministic output of a real compiler or analysis pass.',
  SAMPLED: 'Drawn from random sampling with a recorded seed; rerunning the seed reproduces it.',
  CALIBRATION: 'Reported device calibration data with a recorded source and timestamp.',
  MEASURED: 'Imported from a real measurement record.',
  ESTIMATED: 'Derived from a simplified model; a proxy, not a measurement.',
  ILLUSTRATIVE: 'A visual teaching aid only; not derived from computation.',
};

export const SOURCE_DESCRIPTIONS: Readonly<Record<SourceClassification, string>> = {
  exact_simulation: 'In-browser exact statevector simulation',
  sampled_simulation: 'In-browser seeded sampling',
  qiskit_transpiler: 'Real Qiskit transpiler output',
  qiskit_aer: 'Qiskit Aer simulation output',
  backend_calibration: 'Device calibration snapshot',
  measured_import: 'Imported measurement record',
  reference_compiler: 'QSimCity Reference Compiler output',
  estimated: 'Model-based estimate',
  illustrative: 'Illustrative visual only',
};

export function CertaintyBadge({ certainty }: { certainty: CertaintyLabel }): ReactElement {
  return (
    <span
      className={`certainty-badge certainty-${certainty.toLowerCase()}`}
      title={CERTAINTY_DESCRIPTIONS[certainty]}
    >
      {certainty}
    </span>
  );
}
