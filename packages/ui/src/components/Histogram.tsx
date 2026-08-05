import type { ReactElement } from 'react';
import type { CertaintyLabel } from 'qsimcity-trace';
import { CertaintyBadge } from './CertaintyBadge.js';

/**
 * Accessible histogram: SVG bars plus a full data table. Supports one or two
 * series (Compare Mode). Never relies on color alone — series are
 * distinguished by pattern (solid vs hatched) and by the legend text.
 */

export interface HistogramSeries {
  readonly label: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly certainty: CertaintyLabel;
}

export interface HistogramProps {
  readonly title: string;
  readonly series: readonly HistogramSeries[];
  readonly maxBars?: number;
}

export function Histogram({ title, series, maxBars = 16 }: HistogramProps): ReactElement {
  const keys = [...new Set(series.flatMap((s) => Object.keys(s.counts)))].sort();
  const totals = series.map((s) => Object.values(s.counts).reduce((a, b) => a + b, 0) || 1);
  const shownKeys =
    keys.length <= maxBars
      ? keys
      : [...keys]
          .sort((a, b) => {
            const fa = Math.max(...series.map((s, i) => (s.counts[a] ?? 0) / totals[i]!));
            const fb = Math.max(...series.map((s, i) => (s.counts[b] ?? 0) / totals[i]!));
            return fb - fa;
          })
          .slice(0, maxBars)
          .sort();
  const truncated = keys.length > shownKeys.length;
  const maxFraction = Math.max(
    0.0001,
    ...shownKeys.flatMap((k) => series.map((s, i) => (s.counts[k] ?? 0) / totals[i]!)),
  );
  // Few outcomes get wide bar groups so a two-bar Bell histogram fills its
  // panel instead of stranding two slivers at the left edge (art review):
  // groups stretch toward a ~460px plot, clamped for many-outcome charts.
  const barGroupW = Math.max(34, Math.min(200, Math.floor(440 / shownKeys.length)));
  const chartW = 60 + shownKeys.length * barGroupW;
  const chartH = 170;
  const plotH = 120;

  return (
    <figure className="histogram" role="group" aria-label={title}>
      <figcaption className="panel-caption">
        {title}
        {series.map((s) => (
          <span key={s.label} className="legend-item">
            <span
              className={`legend-swatch ${s.label === series[0]!.label ? 'series-a' : 'series-b'}`}
              aria-hidden="true"
            />
            {s.label} <CertaintyBadge certainty={s.certainty} />
          </span>
        ))}
      </figcaption>
      <div className="circuit-scroll">
        <svg
          width={chartW}
          height={chartH}
          // Scale down inside narrow containers (phone mission panel)
          // instead of overflowing them: the chart must never push its
          // panel wider than the viewport (child-UX review regression).
          viewBox={`0 0 ${chartW} ${chartH}`}
          style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label={`Histogram: ${title}. A data table alternative follows.`}
        >
          <defs>
            <pattern
              id="hatch"
              width="6"
              height="6"
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
            </pattern>
          </defs>
          <line x1={40} y1={12} x2={40} y2={12 + plotH} className="axis" />
          <line x1={40} y1={12 + plotH} x2={chartW - 8} y2={12 + plotH} className="axis" />
          <text x={8} y={18} className="axis-label">
            {Math.round(maxFraction * 100)}%
          </text>
          <text x={8} y={12 + plotH} className="axis-label">
            0%
          </text>
          {shownKeys.map((key, ki) => {
            const x0 = 48 + ki * barGroupW;
            const innerW = (barGroupW - 8) / series.length;
            return (
              <g key={key}>
                {series.map((s, si) => {
                  const fraction = (s.counts[key] ?? 0) / totals[si]!;
                  const h = (fraction / maxFraction) * plotH;
                  return (
                    <rect
                      key={s.label}
                      x={x0 + si * innerW}
                      y={12 + plotH - h}
                      width={innerW - 2}
                      height={h}
                      className={si === 0 ? 'bar series-a' : 'bar series-b'}
                      fill={si === 0 ? undefined : 'url(#hatch)'}
                    />
                  );
                })}
                <text
                  x={x0 + (barGroupW - 8) / 2}
                  y={12 + plotH + 14}
                  textAnchor="middle"
                  className="bar-label"
                >
                  {key}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {truncated && (
        <p className="hint">
          Showing the {shownKeys.length} most frequent of {keys.length} outcomes. The table lists
          the shown outcomes.
        </p>
      )}
      <details className="table-alternative">
        <summary>Data table (text alternative)</summary>
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Outcome</th>
              {series.map((s) => (
                <th scope="col" key={s.label}>
                  {s.label} count
                </th>
              ))}
              {series.map((s) => (
                <th scope="col" key={`${s.label}-p`}>
                  {s.label} fraction
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownKeys.map((key) => (
              <tr key={key}>
                <th scope="row">{key}</th>
                {series.map((s) => (
                  <td key={s.label}>{s.counts[key] ?? 0}</td>
                ))}
                {series.map((s, si) => (
                  <td key={`${s.label}-p`}>
                    {(((s.counts[key] ?? 0) / totals[si]!) * 100).toFixed(1)}%
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
