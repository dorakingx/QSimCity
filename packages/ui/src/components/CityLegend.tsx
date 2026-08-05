import { useEffect, useRef, type ReactElement } from 'react';
import { LEGEND_ENTRIES } from '../content/legend.js';
import { CertaintyBadge } from './CertaintyBadge.js';

/**
 * The City Legend modal (spec §5.4, W4.6): what every moving thing in the
 * city means, what triggers it, and how certain it is. Follows the
 * HelpOverlay modal pattern for focus and dismissal.
 */
export function CityLegend({ onClose }: { onClose: () => void }): ReactElement {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal help-overlay city-legend"
        role="dialog"
        aria-modal="true"
        aria-label="City legend: what everything in the city means"
      >
        <header className="modal-header">
          <h2>City Legend</h2>
          <button type="button" ref={closeRef} onClick={onClose} aria-label="Close legend">
            Close
          </button>
        </header>
        <p className="hint">
          Everything that moves in the city is listed here with what it stands for and how certain
          its data is. Vehicles and people carry instructions, jobs, or classical messages — never
          quantum states.
        </p>
        <ul className="legend-list">
          {LEGEND_ENTRIES.map((entry) => (
            <li key={entry.id} className="legend-entry">
              <div className="legend-entry-head">
                <h3>{entry.name}</h3>
                <CertaintyBadge certainty={entry.certainty} />
                <span className="legend-source">{entry.source.replace(/_/g, ' ')}</span>
              </div>
              <p>{entry.represents}</p>
              <p className="legend-trigger">
                <strong>Moves when:</strong> {entry.trigger}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
