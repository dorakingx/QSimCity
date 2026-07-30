import { useEffect } from 'react';
import { maxTickOf, tickDurationMs } from '@qsimcity/world';
import { useAppStore } from '../store/appStore.js';

/**
 * Advances the playback tick on a wall-clock cadence while playing.
 * Pausing playback pauses scientific state progression everywhere, because
 * every surface derives from (trace, tick). Hidden tabs advance on resume
 * rather than burning timers (spec §19).
 */
export function usePlaybackLoop(): void {
  const playing = useAppStore((s) => s.playbackPlaying);
  const speed = useAppStore((s) => s.playbackSpeed);
  const trace = useAppStore((s) => s.trace);

  useEffect(() => {
    if (!playing || !trace) return;
    const interval = setInterval(() => {
      // Skip (not stop) while hidden: playback resumes automatically when
      // the tab becomes visible again, and hidden tabs do no render work.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const s = useAppStore.getState();
      if (!s.trace) return;
      const max = maxTickOf(s.trace);
      if (s.playbackTick >= max) {
        useAppStore.setState({ playbackPlaying: false });
      } else {
        useAppStore.setState({ playbackTick: s.playbackTick + 1 });
      }
    }, tickDurationMs(speed));
    return () => clearInterval(interval);
  }, [playing, speed, trace]);
}
