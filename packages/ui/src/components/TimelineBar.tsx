import type { ReactElement } from 'react';
import { maxTickOf } from '@qsimcity/world';
import { useAppStore } from '../store/appStore.js';

/**
 * Timeline transport: play/pause, step, seek, speed. Fully keyboard
 * operable; the scrubber is a native range input.
 */
export function TimelineBar(): ReactElement | null {
  const trace = useAppStore((s) => s.trace);
  const tick = useAppStore((s) => s.playbackTick);
  const playing = useAppStore((s) => s.playbackPlaying);
  const speed = useAppStore((s) => s.playbackSpeed);
  const { play, pause, stepForward, stepBackward, setTick, setSpeed } = useAppStore.getState();

  if (!trace) return null;
  const max = maxTickOf(trace);

  return (
    <div className="timeline-bar" role="toolbar" aria-label="Replay timeline">
      <button
        type="button"
        onClick={() => (playing ? pause() : play())}
        aria-label={playing ? 'Pause replay' : 'Play replay'}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        onClick={() => {
          if (tick > 0) stepBackward();
        }}
        aria-label="Step backward one tick"
        // aria-disabled rather than disabled: Chromium blurs a focused
        // control the moment it becomes disabled, so stepping back to tick 0
        // used to drop a keyboard user at document.body with no announcement.
        aria-disabled={tick <= 0}
      >
        ◀ Step
      </button>
      <button
        type="button"
        onClick={() => {
          if (tick < max) stepForward();
        }}
        aria-label="Step forward one tick"
        aria-disabled={tick >= max}
      >
        Step ▶
      </button>
      <label className="timeline-scrubber">
        <span className="visually-hidden">Timeline position</span>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={tick}
          onChange={(e) => setTick(Number(e.target.value))}
          aria-valuetext={`Tick ${tick} of ${max}`}
        />
      </label>
      <output className="timeline-position" aria-live="polite">
        {tick} / {max}
      </output>
      <label className="timeline-speed">
        Speed
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {[0.1, 0.25, 0.5, 1, 2, 3, 5].map((v) => (
            <option key={v} value={v}>
              {v}x
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
