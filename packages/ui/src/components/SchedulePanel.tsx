import { useEffect, useRef, type ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';
import { CertaintyBadge } from './CertaintyBadge.js';
import { instructionDescription } from './CircuitDiagram.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

/**
 * Instruction schedule (Scheduling Tower data): model start times and
 * durations from instruction.scheduled events. Estimates, never hardware
 * measurements — labeled accordingly (spec §10).
 */
export function SchedulePanel(): ReactElement | null {
  const open = useAppStore((s) => s.scheduleOpen);
  const trace = useAppStore((s) => s.trace);
  const { setScheduleOpen } = useAppStore.getState();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef, open);

  // A dialog that opens without moving focus into itself gives a
  // screen-reader user no indication it appeared.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;
  const scheduled = trace
    ? trace.events.filter((e) => e.eventType === 'instruction.scheduled')
    : [];

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setScheduleOpen(false);
      }}
    >
      <div
        ref={dialogRef}
        className="schedule-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Instruction schedule"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setScheduleOpen(false);
        }}
      >
        <div className="inspector-header">
          <h2>
            Instruction schedule <CertaintyBadge certainty="ESTIMATED" />
          </h2>
          <button
            type="button"
            ref={closeRef}
            aria-label="Close schedule"
            onClick={() => setScheduleOpen(false)}
          >
            ×
          </button>
        </div>
        <p className="hint">
          Start times and durations are model estimates for teaching instruction-level parallelism.
          They are not measurements of real hardware timing, and replay pacing is separate
          presentation time.
        </p>
        {scheduled.length === 0 ? (
          <p className="hint">Run a circuit to see its schedule.</p>
        ) : (
          <table>
            <caption className="visually-hidden">Scheduled instructions</caption>
            <thead>
              <tr>
                <th scope="col">Instruction</th>
                <th scope="col">Start (ns)</th>
                <th scope="col">Duration (ns)</th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((ev) => {
                const instr = trace?.compiledCircuit?.instructions.find(
                  (i) => i.id === ev.instructionId,
                );
                const p = ev.payload as { startNs?: number; durationNs?: number };
                return (
                  <tr key={ev.eventId}>
                    <td>{instr ? instructionDescription(instr) : (ev.instructionId ?? '—')}</td>
                    <td>{p.startNs ?? '—'}</td>
                    <td>{p.durationNs ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
