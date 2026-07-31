import type { ReactElement } from 'react';
import type { Trace } from 'qsimcity-trace';
import { Histogram, type HistogramSeries } from './Histogram.js';
import { CertaintyBadge } from './CertaintyBadge.js';

/** Measurement results: ideal (and noisy when present) with certainty labels. */
export function ResultsSection({
  trace,
  compare,
}: {
  trace: Trace;
  compare?: boolean;
}): ReactElement {
  const ideal = trace.results.idealCounts;
  const noisy = trace.results.noisyCounts;
  const exact = trace.results.idealProbabilities;

  const series: HistogramSeries[] = [];
  if (ideal) series.push({ label: 'Ideal', counts: ideal.counts, certainty: ideal.certainty });
  if (noisy) series.push({ label: 'Noisy', counts: noisy.counts, certainty: noisy.certainty });

  return (
    <section className="results-section" aria-label="Measurement results">
      {series.length > 0 ? (
        <Histogram
          title={
            compare && noisy
              ? `Ideal vs noisy counts (${ideal?.shots ?? 0} shots each)`
              : `Measured counts (${ideal?.shots ?? 0} shots)`
          }
          series={compare && noisy ? series : series.slice(0, noisy ? 2 : 1)}
        />
      ) : (
        <p className="hint">This trace contains no measurement counts.</p>
      )}
      {exact && (
        <details className="table-alternative">
          <summary>
            Exact probabilities <CertaintyBadge certainty="EXACT" />
          </summary>
          <table>
            <caption>Exact outcome probabilities from the statevector</caption>
            <thead>
              <tr>
                <th scope="col">Outcome</th>
                <th scope="col">Probability</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(exact)
                .sort(([a], [b]) => (a < b ? -1 : 1))
                .map(([key, p]) => (
                  <tr key={key}>
                    <th scope="row">{key}</th>
                    <td>{(p * 100).toFixed(4)}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      )}
      {noisy && ideal && (
        <p className="hint">
          Statistical note: with {ideal.shots} shots, observed fractions carry sampling uncertainty
          of roughly ±{(100 / Math.sqrt(Math.max(1, ideal.shots))).toFixed(1)}
          &nbsp;percentage points per outcome. <CertaintyBadge certainty="SAMPLED" />
        </p>
      )}
    </section>
  );
}
