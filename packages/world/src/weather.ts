import type { Trace } from 'qsimcity-trace';

/**
 * Noise weather over the QPU Grid (spec §5.1, acceptance W2.5): a
 * COMPUTED-from-configuration metaphor. Cloud cover is a monotone
 * normalization of the configured noise-channel strengths in `trace.noise`;
 * rain falls only while `noise.applied` events fire. Nothing here is
 * invented data — clear skies mean the trace configures no noise, and every
 * raindrop corresponds to a recorded noise event at the current tick.
 */
export interface WeatherState {
  /** Cloud cover 0..1 derived from the configured noise model magnitude. */
  readonly cover: number;
  /** Rain intensity 0..1: cover while noise events fire at this tick, else 0. */
  readonly rain: number;
}

/**
 * Normalization constant for cloud cover: the summed channel strength at
 * which cover reaches 1 - 1/e (about 0.63). Chosen so the default noise
 * preset (total strength around 0.04) reads as visibly overcast while cover
 * stays strictly monotone in every channel and asymptotically approaches 1.
 */
const COVER_SCALE = 0.05;

const CLEAR: WeatherState = { cover: 0, rain: 0 };

/**
 * Weather at a playback tick. Pure function of (trace, tick).
 *
 * cover = 1 - exp(-total / COVER_SCALE) where total is the sum of the five
 * configured channel strengths (readout error, 1q/2q depolarizing, amplitude
 * damping, phase damping), each clamped to be non-negative. Zero when the
 * trace is absent or configures no noise. rain equals cover exactly at ticks
 * where a `noise.applied` event fires, and 0 at every other tick.
 */
export function weatherAt(trace: Trace | null, tick: number): WeatherState {
  if (!trace || !trace.noise) return CLEAR;
  const noise = trace.noise;
  const total =
    Math.max(0, noise.readoutError) +
    Math.max(0, noise.depolarizing1q) +
    Math.max(0, noise.depolarizing2q) +
    Math.max(0, noise.amplitudeDamping) +
    Math.max(0, noise.phaseDamping);
  if (total <= 0) return CLEAR;
  const cover = Math.min(1, 1 - Math.exp(-total / COVER_SCALE));
  const raining = trace.events.some(
    (event) => event.logicalTick === tick && event.eventType === 'noise.applied',
  );
  return { cover, rain: raining ? cover : 0 };
}
