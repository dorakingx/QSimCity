import type { ReactElement } from 'react';
import type { Trace } from 'qsimcity-trace';
import { CertaintyBadge } from './CertaintyBadge.js';

/** Pre- vs post-compilation metrics comparison (spec §7.3). */
export function MetricsPanel({ trace }: { trace: Trace }): ReactElement {
  const input = trace.metrics.find((m) => m.stage === 'input');
  const compiled = trace.metrics.find((m) => m.stage === 'compiled');
  return (
    <section className="metrics-panel" aria-label="Circuit metrics">
      <h3 className="panel-caption">
        Circuit metrics <CertaintyBadge certainty="COMPUTED" />
      </h3>
      <table>
        <caption className="visually-hidden">
          Metrics before and after compilation
        </caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Input</th>
            <th scope="col">Compiled</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Gate count</th>
            <td>{input?.gateCount ?? '—'}</td>
            <td>{compiled?.gateCount ?? '—'}</td>
          </tr>
          <tr>
            <th scope="row">Two-qubit gates</th>
            <td>{input?.twoQubitGateCount ?? '—'}</td>
            <td>{compiled?.twoQubitGateCount ?? '—'}</td>
          </tr>
          <tr>
            <th scope="row">SWAPs inserted</th>
            <td>{input?.swapCount ?? '—'}</td>
            <td>{compiled?.swapCount ?? '—'}</td>
          </tr>
          <tr>
            <th scope="row">Depth</th>
            <td>{input?.depth ?? '—'}</td>
            <td>{compiled?.depth ?? '—'}</td>
          </tr>
        </tbody>
      </table>
      {trace.initialLayout && (
        <p className="hint">
          Initial layout: {trace.initialLayout.map((p, l) => `L${l}→P${p}`).join(', ')}
          {trace.finalLayout &&
            trace.finalLayout.join() !== trace.initialLayout.join() && (
              <> — after routing: {trace.finalLayout.map((p, l) => `L${l}→P${p}`).join(', ')}</>
            )}
        </p>
      )}
    </section>
  );
}
