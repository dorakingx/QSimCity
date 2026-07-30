import type { ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';
import { CircuitDiagram } from '../components/CircuitDiagram.js';
import { ResultsSection } from '../components/ResultsSection.js';
import { MetricsPanel } from '../components/MetricsPanel.js';
import { LabControls } from '../components/LabControls.js';

/**
 * Compare Mode (spec §15): ideal vs noisy distributions side by side, and
 * the pre- vs post-compilation circuits with their metrics.
 */
export function CompareView(): ReactElement {
  const trace = useAppStore((s) => s.trace);
  const config = useAppStore((s) => s.config);
  const { updateConfig } = useAppStore.getState();

  return (
    <div className="view-compare">
      <section className="view-2d-column" aria-label="Comparison configuration">
        <h2>Compare</h2>
        {!config.noiseEnabled && (
          <p className="hint">
            Noise is currently disabled, so both distributions would match.{' '}
            <button
              type="button"
              onClick={() => updateConfig({ noiseEnabled: true })}
            >
              Enable noise
            </button>{' '}
            and run again to compare ideal against noisy execution.
          </p>
        )}
        <LabControls />
      </section>
      <section className="view-2d-column view-2d-main" aria-label="Comparison results">
        {trace ? (
          <>
            <h2>Ideal vs noisy</h2>
            <ResultsSection trace={trace} compare />
            <h2>Before vs after compilation</h2>
            <MetricsPanel trace={trace} />
            <div className="compare-circuits">
              <CircuitDiagram circuit={trace.inputCircuit} title="Input circuit" compact />
              {trace.compiledCircuit && (
                <CircuitDiagram
                  circuit={trace.compiledCircuit}
                  title={`Compiled for ${trace.deviceId ?? 'device'}`}
                  compact
                />
              )}
            </div>
          </>
        ) : (
          <p className="hint">Run a circuit to compare its ideal and noisy behavior.</p>
        )}
      </section>
    </div>
  );
}
