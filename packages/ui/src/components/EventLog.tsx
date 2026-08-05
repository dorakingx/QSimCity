import type { ReactElement } from 'react';
import { activityAtTick, districtForStage } from '@qsimcity/world';
import type { Trace, TraceEvent } from 'qsimcity-trace';
import { useAppStore } from '../store/appStore.js';
import { CertaintyBadge } from './CertaintyBadge.js';
import { explainEvent, type ExplanationLevel } from '../content/explanations.js';

/**
 * Human-readable narration of a trace event (shared by 2D mode and tour).
 * The level selects child, beginner, or expert prose from the central
 * explanations module (spec section 7.4); beginner is the default voice.
 */
export function describeEvent(ev: TraceEvent, level: ExplanationLevel = 'beginner'): string {
  return explainEvent(ev, level);
}

/** Timeline event log for the current tick (2D mode's live narration). */
export function EventLog({ trace }: { trace: Trace }): ReactElement {
  const tick = useAppStore((s) => s.playbackTick);
  const level = useAppStore((s) => s.settings.explanationLevel);
  const activity = activityAtTick(trace, tick);
  return (
    <section className="event-log" aria-label="Events at the current timeline position">
      <h3 className="panel-caption">
        Tick {activity.tick} of {activity.maxTick}
      </h3>
      {activity.eventsAtTick.length === 0 ? (
        <p className="hint">No events at this tick.</p>
      ) : (
        <ul>
          {activity.eventsAtTick.map((ev) => (
            <li key={ev.eventId}>
              <span className="event-district">{districtForStage(ev.stage).name}:</span>{' '}
              {describeEvent(ev, level)} <CertaintyBadge certainty={ev.certainty} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
