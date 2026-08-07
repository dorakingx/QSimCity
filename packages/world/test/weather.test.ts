import { describe, expect, it } from 'vitest';
import { TraceBuilder, deriveTraceId, type NoiseConfig, type Trace } from 'qsimcity-trace';
import { weatherAt } from '../src/weather.js';
import { maxTickOf } from '../src/playback.js';
import { loadSampleTrace } from './fixtures.js';

const ZERO: NoiseConfig = {
  readoutError: 0,
  depolarizing1q: 0,
  depolarizing2q: 0,
  amplitudeDamping: 0,
  phaseDamping: 0,
};

/** Minimal trace with the given noise config and optional noise events. */
function noiseTrace(noise: NoiseConfig | null, noiseEventCount = 0): Trace {
  const builder = new TraceBuilder({
    traceId: deriveTraceId('weather', 'fixture'),
    seed: 'weather',
    generator: 'test',
    generatorVersion: '1.0.0',
    packageVersions: {},
    programSource: 'fixture',
    deviceId: null,
    shots: 4,
    noise,
  });
  builder.emit({
    eventType: 'program.loaded',
    stage: 'input',
    source: 'exact_simulation',
    certainty: 'EXACT',
    payload: {},
  });
  for (let i = 0; i < noiseEventCount; i++) {
    builder.emit({
      eventType: 'noise.applied',
      stage: 'noise',
      source: 'sampled_simulation',
      physicalQubits: [0],
      payload: { kind: 'depolarizing', qubit: 0 },
    });
  }
  return builder.build({
    inputCircuit: { name: 'fixture', numQubits: 1, numClbits: 0, cregs: [], instructions: [] },
  });
}

describe('noise weather (W2.5)', () => {
  it('is clear with no trace', () => {
    expect(weatherAt(null, 0)).toEqual({ cover: 0, rain: 0 });
  });

  it('is clear when the trace configures no noise', () => {
    expect(weatherAt(noiseTrace(null), 1)).toEqual({ cover: 0, rain: 0 });
    expect(weatherAt(noiseTrace(ZERO), 1)).toEqual({ cover: 0, rain: 0 });
  });

  it('derives cover monotonically from every noise channel', () => {
    const channels = [
      'readoutError',
      'depolarizing1q',
      'depolarizing2q',
      'amplitudeDamping',
      'phaseDamping',
    ] as const;
    for (const channel of channels) {
      const weak = weatherAt(noiseTrace({ ...ZERO, [channel]: 0.005 }), 1);
      const strong = weatherAt(noiseTrace({ ...ZERO, [channel]: 0.05 }), 1);
      expect(weak.cover, channel).toBeGreaterThan(0);
      expect(strong.cover, channel).toBeGreaterThan(weak.cover);
      expect(strong.cover, channel).toBeLessThanOrEqual(1);
    }
    // Adding a second channel on top of the first strictly increases cover.
    const single = weatherAt(noiseTrace({ ...ZERO, readoutError: 0.02 }), 1);
    const combined = weatherAt(
      noiseTrace({ ...ZERO, readoutError: 0.02, depolarizing2q: 0.01 }),
      1,
    );
    expect(combined.cover).toBeGreaterThan(single.cover);
  });

  it('rains only at ticks where a noise.applied event fires', () => {
    const noise: NoiseConfig = { ...ZERO, depolarizing1q: 0.01, amplitudeDamping: 0.005 };
    const trace = noiseTrace(noise, 1);
    const noiseTick = trace.events.find((e) => e.eventType === 'noise.applied')!.logicalTick;
    const wet = weatherAt(trace, noiseTick);
    expect(wet.rain).toBe(wet.cover);
    expect(wet.rain).toBeGreaterThan(0);
    const dry = weatherAt(trace, noiseTick - 1);
    expect(dry.rain).toBe(0);
    expect(dry.cover).toBe(wet.cover);
  });

  it('keeps cover constant across all ticks of a real noisy sample trace', () => {
    const trace = loadSampleTrace('bell');
    expect(trace.noise).not.toBeNull();
    const first = weatherAt(trace, 0);
    expect(first.cover).toBeGreaterThan(0);
    for (let tick = 0; tick <= maxTickOf(trace); tick++) {
      expect(weatherAt(trace, tick).cover).toBe(first.cover);
    }
  });

  it('is a pure function of (trace, tick)', () => {
    const trace = noiseTrace({ ...ZERO, phaseDamping: 0.01 }, 1);
    for (let tick = 0; tick <= maxTickOf(trace); tick++) {
      expect(weatherAt(trace, tick)).toEqual(weatherAt(trace, tick));
    }
  });
});
