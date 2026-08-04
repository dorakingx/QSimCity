import type { TimeOfDay } from './sky.js';

/**
 * Procedural city audio (spec §4.4, W3.5). Everything is synthesized with
 * WebAudio — no audio assets. The ambient bed follows the time of day, a
 * rain layer follows noise weather, and short cues mark semantic events.
 * Audio is off by default and the context is only created inside a user
 * gesture, so nothing ever auto-plays.
 */

export type AudioCue = 'gate' | 'measurement' | 'courier' | 'ui';

/** The WebAudio surface CityAudio needs; injectable for tests. */
export type AudioContextFactory = () => AudioContext;

/** Deterministic pseudo-random for noise buffers (no runtime randomness). */
function fillDeterministicNoise(target: Float32Array, seed: number): void {
  let state = seed >>> 0 || 1;
  for (let i = 0; i < target.length; i++) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    target[i] = (state / 0xffffffff) * 2 - 1;
  }
}

interface AmbientNodes {
  readonly master: GainNode;
  readonly windGain: GainNode;
  readonly humGain: GainNode;
  readonly rainGain: GainNode;
  readonly nightGain: GainNode;
  readonly dayGain: GainNode;
  readonly sources: AudioScheduledSourceNode[];
}

export class CityAudio {
  private readonly factory: AudioContextFactory | null;
  private context: AudioContext | null = null;
  private nodes: AmbientNodes | null = null;
  private enabled = false;
  private volume = 0.5;
  private timeOfDay: TimeOfDay = 'day';
  private rain = 0;
  private disposed = false;

  constructor(factory?: AudioContextFactory) {
    if (factory) {
      this.factory = factory;
    } else if (typeof AudioContext !== 'undefined') {
      this.factory = () => new AudioContext();
    } else {
      // No WebAudio in this environment (tests, very old browsers):
      // CityAudio degrades to a silent state machine.
      this.factory = null;
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get currentVolume(): number {
    return this.volume;
  }

  get rainLevel(): number {
    return this.rain;
  }

  get hasContext(): boolean {
    return this.context !== null;
  }

  /**
   * Enable or disable audio. The AudioContext is created lazily on the
   * first `userGesture()` after enabling — never here — so enabling from a
   * settings menu alone cannot start playback.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.context) {
      void this.context.suspend();
    }
    if (enabled && this.context) {
      void this.context.resume();
      this.applyMix();
    }
  }

  /** Call from a real user input handler; creates/resumes the context. */
  userGesture(): void {
    if (!this.enabled || this.disposed || !this.factory) return;
    if (!this.context) {
      this.context = this.factory();
      this.buildGraph();
    }
    void this.context.resume();
    this.applyMix();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyMix();
  }

  setTimeOfDay(time: TimeOfDay): void {
    this.timeOfDay = time;
    this.applyMix();
  }

  /** Rain layer intensity in [0,1], driven by noise weather. */
  setRain(intensity: number): void {
    this.rain = Math.max(0, Math.min(1, intensity));
    this.applyMix();
  }

  /** Short synthesized cue for a semantic event. No-op while disabled. */
  cue(kind: AudioCue): void {
    if (!this.enabled || !this.context || !this.nodes || this.disposed) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const spec: Record<AudioCue, { freq: number; end: number; duration: number; level: number }> = {
      gate: { freq: 660, end: 660, duration: 0.06, level: 0.12 },
      measurement: { freq: 880, end: 1320, duration: 0.16, level: 0.16 },
      courier: { freq: 440, end: 330, duration: 0.12, level: 0.12 },
      ui: { freq: 520, end: 520, duration: 0.05, level: 0.1 },
    };
    const s = spec[kind];
    osc.frequency.setValueAtTime(s.freq, now);
    if (s.end !== s.freq) osc.frequency.linearRampToValueAtTime(s.end, now + s.duration);
    gain.gain.setValueAtTime(s.level * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + s.duration);
    osc.connect(gain);
    gain.connect(this.nodes.master);
    osc.start(now);
    osc.stop(now + s.duration + 0.02);
  }

  private buildGraph(): void {
    const ctx = this.context!;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Shared deterministic noise buffer.
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    fillDeterministicNoise(noiseBuffer.getChannelData(0), 0x9e3779b9);
    const sources: AudioScheduledSourceNode[] = [];

    const noiseSource = (): AudioBufferSourceNode => {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      sources.push(source);
      return source;
    };

    // Wind: lowpassed noise.
    const wind = noiseSource();
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 260;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.1;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    wind.start();

    // City hum: low oscillator stack.
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 52;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 130;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.05;
    hum.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(master);
    hum.start();
    sources.push(hum);

    // Rain: bandpassed noise, silent until noise weather appears.
    const rain = noiseSource();
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1900;
    rainFilter.Q.value = 0.6;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rain.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    rain.start();

    // Night bed: soft high shimmer (crickets-adjacent, abstract).
    const night = ctx.createOscillator();
    night.type = 'triangle';
    night.frequency.value = 3800;
    const nightLfo = ctx.createOscillator();
    nightLfo.frequency.value = 5.2;
    const nightDepth = ctx.createGain();
    nightDepth.gain.value = 0.012;
    const nightGain = ctx.createGain();
    nightGain.gain.value = 0;
    nightLfo.connect(nightDepth);
    nightDepth.connect(nightGain.gain);
    night.connect(nightGain);
    nightGain.connect(master);
    night.start();
    nightLfo.start();
    sources.push(night, nightLfo);

    // Day bed: distant harbor tone, very quiet.
    const day = ctx.createOscillator();
    day.type = 'sine';
    day.frequency.value = 220;
    const dayGain = ctx.createGain();
    dayGain.gain.value = 0;
    day.connect(dayGain);
    dayGain.connect(master);
    day.start();
    sources.push(day);

    this.nodes = { master, windGain, humGain, rainGain, nightGain, dayGain, sources };
    this.applyMix();
  }

  private applyMix(): void {
    if (!this.nodes || !this.context) return;
    const t = this.context.currentTime;
    const ramp = (node: GainNode, value: number): void => {
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(value, t, 0.4);
    };
    ramp(this.nodes.master, this.enabled ? this.volume * 0.5 : 0);
    ramp(this.nodes.windGain, this.timeOfDay === 'night' ? 0.07 : 0.11);
    ramp(this.nodes.humGain, this.timeOfDay === 'night' ? 0.06 : 0.045);
    ramp(this.nodes.rainGain, this.rain * 0.16);
    ramp(this.nodes.nightGain, this.timeOfDay === 'night' ? 0.02 : 0);
    ramp(this.nodes.dayGain, this.timeOfDay === 'day' ? 0.012 : 0);
  }

  dispose(): void {
    this.disposed = true;
    if (this.nodes) {
      for (const source of this.nodes.sources) {
        try {
          source.stop();
        } catch {
          // Sources that never started throw; disposal continues.
        }
      }
    }
    if (this.context) void this.context.close();
    this.context = null;
    this.nodes = null;
  }
}
