import type { ReactElement } from 'react';
import { getDevice } from '@qsimcity/domain';

/**
 * Device coupling map with optional logical-qubit layout overlay and active
 * gate highlighting. Includes a text alternative listing edges and layout.
 */

export interface CouplingMapProps {
  readonly deviceId: string;
  /** Logical -> physical assignment to display, if known. */
  readonly layout?: readonly number[] | null;
  readonly activeQubits?: readonly number[];
  readonly activeCouplings?: readonly (readonly [number, number])[];
  readonly onSelectQubit?: (physicalQubit: number) => void;
  readonly selectedQubit?: number | null;
}

export function CouplingMap({
  deviceId,
  layout,
  activeQubits = [],
  activeCouplings = [],
  onSelectQubit,
  selectedQubit,
}: CouplingMapProps): ReactElement {
  const device = getDevice(deviceId);
  const xs = device.positions.map((p) => p[0]);
  const ys = device.positions.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const w = 240;
  const h = 180;
  const pad = 30;
  const px = (i: number): number => pad + ((device.positions[i]![0] - minX) / spanX) * (w - pad * 2);
  const py = (i: number): number => pad + ((device.positions[i]![1] - minY) / spanY) * (h - pad * 2);
  const logicalFor = (physical: number): number | null => {
    if (!layout) return null;
    const l = layout.indexOf(physical);
    return l === -1 ? null : l;
  };
  const isActiveEdge = (a: number, b: number): boolean =>
    activeCouplings.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  return (
    <figure className="coupling-map" role="group" aria-label={`Coupling map: ${device.displayName}`}>
      <figcaption className="panel-caption">
        Coupling map — {device.displayName}
      </figcaption>
      <svg
        width={w}
        height={h}
        role="group"
        aria-label={`Device ${device.displayName}: ${device.numQubits} qubits, ${device.edges.length} coupling edges. Text alternative follows.`}
      >
        {device.edges.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={px(a)}
            y1={py(a)}
            x2={px(b)}
            y2={py(b)}
            className={`coupling-edge${isActiveEdge(a, b) ? ' coupling-edge-active' : ''}`}
          />
        ))}
        {device.positions.map((_, i) => {
          const logical = logicalFor(i);
          const active = activeQubits.includes(i);
          const handleSelect = onSelectQubit ? () => onSelectQubit(i) : undefined;
          return (
            <g
              key={i}
              {...(handleSelect
                ? {
                    onClick: handleSelect,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect();
                      }
                    },
                    tabIndex: 0,
                    role: 'button',
                    'aria-label': `Physical qubit ${i}${logical !== null ? `, holding logical qubit ${logical}` : ''}`,
                  }
                : {})}
            >
              <circle
                cx={px(i)}
                cy={py(i)}
                r={12}
                className={[
                  'qubit-node',
                  active ? 'qubit-active' : '',
                  selectedQubit === i ? 'qubit-selected' : '',
                  logical !== null ? 'qubit-assigned' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
              <text x={px(i)} y={py(i) + 4} textAnchor="middle" className="qubit-label">
                {i}
              </text>
              {logical !== null && (
                <text x={px(i)} y={py(i) - 16} textAnchor="middle" className="qubit-logical-label">
                  L{logical}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <details className="table-alternative">
        <summary>Topology details (text alternative)</summary>
        <p>
          {device.displayName}: {device.numQubits} physical qubits. Coupling edges:{' '}
          {device.edges.map(([a, b]) => `${a}-${b}`).join(', ')}.
        </p>
        {layout && (
          <p>
            Layout: {layout.map((p, l) => `logical ${l} on physical ${p}`).join('; ')}.
          </p>
        )}
      </details>
    </figure>
  );
}
