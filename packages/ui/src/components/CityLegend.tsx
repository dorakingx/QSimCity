import { useEffect, useRef, type ReactElement } from 'react';
import { LEGEND_ENTRIES } from '../content/legend.js';
import { CertaintyBadge } from './CertaintyBadge.js';
import { useAppStore } from '../store/appStore.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

/**
 * The City Legend modal (spec §5.4, W4.6): what every moving thing in the
 * city means, what triggers it, and how certain it is. Honors the
 * explanation level so the child register gets child prose, and traps
 * keyboard focus like every aria-modal surface must.
 */
export function CityLegend({ onClose }: { onClose: () => void }): ReactElement {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const level = useAppStore((s) => s.settings.explanationLevel);
  useFocusTrap(dialogRef);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const child = level === 'child';
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
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
          {child
            ? 'Everything that moves in the city is listed here. Trucks, vans, and people only ever carry your program or its answers — never the quantum magic itself.'
            : 'Everything that moves in the city is listed here with what it stands for and how certain its data is. Vehicles and people carry instructions, jobs, or classical messages — never quantum states.'}
        </p>
        <ul className="legend-list">
          {LEGEND_ENTRIES.map((entry) => (
            <li key={entry.id} className="legend-entry">
              <div className="legend-entry-head">
                <h3>{entry.name}</h3>
                <CertaintyBadge certainty={entry.certainty} />
                {entry.noisyCertainty && (
                  <span className="legend-noisy-certainty">
                    noisy replay: <CertaintyBadge certainty={entry.noisyCertainty} />
                  </span>
                )}
                <span className="legend-source">{entry.source.replace(/_/g, ' ')}</span>
              </div>
              <p>{child ? entry.childRepresents : entry.represents}</p>
              <p className="legend-trigger">
                <strong>Moves when:</strong> {child ? entry.childTrigger : entry.trigger}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
