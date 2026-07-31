import type { ReactElement } from 'react';
import type { Trace } from 'qsimcity-trace';
import { Histogram, type HistogramSeries } from './Histogram.js';
import { CertaintyBadge } from './CertaintyBadge.js';

/**
 * Measurement results with certainty labels.
 *
 * A device run produces three distinct results, and they are labelled as such
 * rather than collapsed into "ideal vs noisy": the logical reference says what
 * the program means, the physical ideal says whether compiling preserved that
 * meaning, and the physical noisy result says what the device did to the
 * circuit that actually ran.
 */
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
  const execution = trace.results.execution;
  const physicalIdeal = execution?.physicalIdeal;

  const series: HistogramSeries[] = [];
  if (ideal) {
    series.push({
      label: execution ? 'Logical reference' : 'Ideal',
      counts: ideal.counts,
      certainty: ideal.certainty,
    });
  }
  if (noisy) {
    series.push({
      label: execution ? 'Physical noisy' : 'Noisy',
      counts: noisy.counts,
      certainty: noisy.certainty,
    });
  }

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
      {execution && (
        <details className="table-alternative">
          <summary>What these three results mean</summary>
          <dl className="result-classes">
            <dt>
              Logical reference <CertaintyBadge certainty={execution.logicalReference.certainty} />
            </dt>
            <dd>
              The circuit as written, simulated ideally. The reference for what the program is
              supposed to produce.
            </dd>
            {physicalIdeal && (
              <>
                <dt>
                  Physical ideal <CertaintyBadge certainty={physicalIdeal.certainty} />
                </dt>
                <dd>
                  The compiled circuit with no noise, running on the device&apos;s qubits. It should
                  agree with the logical reference; if it does not, compilation changed the meaning
                  of the program.
                </dd>
              </>
            )}
            {execution.physicalNoisy && (
              <>
                <dt>
                  Physical noisy <CertaintyBadge certainty={execution.physicalNoisy.certainty} />
                </dt>
                <dd>
                  The compiled circuit with the configured noise applied to the native operations
                  that actually ran, including every SWAP routing had to insert. This is a modeled
                  result, not a measurement of any real device, and not a fidelity.
                </dd>
              </>
            )}
          </dl>
        </details>
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
