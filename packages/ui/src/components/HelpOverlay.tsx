import { useEffect, useRef, type ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';
import { DISTRICTS } from '@qsimcity/world';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

/** Help overlay: keyboard map, controls, and the semantic legend. */

export const KEYBOARD_MAP: readonly { keys: string; action: string }[] = [
  { keys: 'W / A / S / D or Arrow keys', action: 'Move (first-person) / pan (orbit)' },
  { keys: 'Mouse drag', action: 'Rotate camera' },
  { keys: 'Scroll / pinch', action: 'Zoom' },
  { keys: '1 / 2 / 3 / 4', action: 'Camera: orbit / top-down / fly / first-person' },
  { keys: 'Space', action: 'Play or pause the replay' },
  { keys: '. and ,', action: 'Step forward / backward one tick' },
  { keys: 'Ctrl+K or /', action: 'Open the command palette' },
  { keys: 'T', action: 'Open the Guided Tour' },
  { keys: 'I', action: 'Toggle the Inspector' },
  { keys: '?', action: 'Open this help overlay' },
  { keys: 'Escape', action: 'Close dialogs and menus' },
  { keys: 'Tab / Shift+Tab', action: 'Move keyboard focus' },
  { keys: 'Enter or Space on a highlighted object', action: 'Select / operate it' },
];

export function HelpOverlay(): ReactElement | null {
  const open = useAppStore((s) => s.helpOpen);
  const { setHelpOpen } = useAppStore.getState();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (open) requestAnimationFrame(() => closeRef.current?.focus());
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setHelpOpen(false);
      }}
    >
      <div
        ref={dialogRef}
        className="help-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Help, keyboard map, and legend"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setHelpOpen(false);
        }}
      >
        <div className="inspector-header">
          <h2>Help</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close help"
            onClick={() => setHelpOpen(false)}
          >
            ×
          </button>
        </div>
        <h3>Keyboard map</h3>
        <table>
          <caption className="visually-hidden">Keyboard shortcuts</caption>
          <thead>
            <tr>
              <th scope="col">Keys</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {KEYBOARD_MAP.map((row) => (
              <tr key={row.keys}>
                <td>
                  <kbd>{row.keys}</kbd>
                </td>
                <td>{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>District legend</h3>
        <ul className="legend-list">
          {DISTRICTS.map((d) => (
            <li key={d.id}>
              <span
                className="legend-swatch"
                style={{ background: d.accentColor }}
                aria-hidden="true"
              />
              <strong>{d.name}</strong> — {d.role}
            </li>
          ))}
        </ul>
        <h3>What moves in the city</h3>
        <p>
          Moving objects are jobs, instructions, classical messages, and measurement samples.
          Quantum state itself never travels on roads — that would misrepresent the physics. Every
          number on screen carries a certainty label; open the Provenance panel for the full legend.
        </p>
      </div>
    </div>
  );
}
