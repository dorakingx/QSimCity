import { describe, expect, it, vi } from 'vitest';
import { CityAudio } from '../src/audio.js';

/**
 * Audio engine contract (W3.5): synthesized only, off by default, context
 * created solely inside a user gesture, rain follows weather, cues no-op
 * while disabled. A stub AudioContext lets the graph run headless.
 */

function stubParam(): {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
} {
  const param = {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn((v: number) => {
      param.value = v;
    }),
    cancelScheduledValues: vi.fn(),
  };
  return param;
}

interface StubNode {
  connect: ReturnType<typeof vi.fn>;
  start?: ReturnType<typeof vi.fn>;
  stop?: ReturnType<typeof vi.fn>;
  gain?: ReturnType<typeof stubParam>;
  frequency?: ReturnType<typeof stubParam>;
  Q?: ReturnType<typeof stubParam>;
  type?: string;
  buffer?: unknown;
  loop?: boolean;
}

function makeStubContext(): {
  context: AudioContext;
  created: { oscillators: StubNode[]; gains: StubNode[]; sources: StubNode[] };
  state: { resumed: number; suspended: number; closed: number };
} {
  const created = {
    oscillators: [] as StubNode[],
    gains: [] as StubNode[],
    sources: [] as StubNode[],
  };
  const state = { resumed: 0, suspended: 0, closed: 0 };
  const makeNode = (kind: 'osc' | 'gain' | 'filter' | 'source'): StubNode => {
    const node: StubNode = {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      gain: stubParam(),
      frequency: stubParam(),
      Q: stubParam(),
    };
    if (kind === 'osc') created.oscillators.push(node);
    if (kind === 'gain') created.gains.push(node);
    if (kind === 'source') created.sources.push(node);
    return node;
  };
  const context = {
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    createGain: () => makeNode('gain'),
    createOscillator: () => makeNode('osc'),
    createBiquadFilter: () => makeNode('filter'),
    createBufferSource: () => makeNode('source'),
    createBuffer: (_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    resume: vi.fn(() => {
      state.resumed++;
      return Promise.resolve();
    }),
    suspend: vi.fn(() => {
      state.suspended++;
      return Promise.resolve();
    }),
    close: vi.fn(() => {
      state.closed++;
      return Promise.resolve();
    }),
  } as unknown as AudioContext;
  return { context, created, state };
}

describe('CityAudio', () => {
  it('creates no context until enabled AND a user gesture arrives', () => {
    const stub = makeStubContext();
    const factory = vi.fn(() => stub.context);
    const audio = new CityAudio(factory);
    expect(audio.hasContext).toBe(false);
    // Gesture while disabled: still nothing (off by default).
    audio.userGesture();
    expect(factory).not.toHaveBeenCalled();
    // Enabling alone does not create the context either.
    audio.setEnabled(true);
    expect(factory).not.toHaveBeenCalled();
    // Enabled + gesture creates and resumes it.
    audio.userGesture();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(audio.hasContext).toBe(true);
    expect(stub.state.resumed).toBeGreaterThan(0);
  });

  it('suspends on disable and resumes on re-enable', () => {
    const stub = makeStubContext();
    const audio = new CityAudio(() => stub.context);
    audio.setEnabled(true);
    audio.userGesture();
    audio.setEnabled(false);
    expect(stub.state.suspended).toBe(1);
    audio.setEnabled(true);
    expect(stub.state.resumed).toBeGreaterThanOrEqual(2);
  });

  it('clamps volume and rain to [0,1]', () => {
    const audio = new CityAudio(
      makeStubContext().context ? () => makeStubContext().context : undefined,
    );
    audio.setVolume(4);
    expect(audio.currentVolume).toBe(1);
    audio.setVolume(-2);
    expect(audio.currentVolume).toBe(0);
    audio.setRain(9);
    expect(audio.rainLevel).toBe(1);
    audio.setRain(-1);
    expect(audio.rainLevel).toBe(0);
  });

  it('cues are silent no-ops while disabled or without a context', () => {
    const stub = makeStubContext();
    const audio = new CityAudio(() => stub.context);
    audio.cue('measurement');
    expect(stub.created.oscillators.length).toBe(0);
    audio.setEnabled(true);
    audio.cue('gate');
    // Still no context: enabled but no gesture yet.
    expect(stub.created.oscillators.length).toBe(0);
    audio.userGesture();
    const before = stub.created.oscillators.length;
    audio.cue('gate');
    expect(stub.created.oscillators.length).toBe(before + 1);
  });

  it('builds a synthesized graph with wind, hum, rain, and beds', () => {
    const stub = makeStubContext();
    const audio = new CityAudio(() => stub.context);
    audio.setEnabled(true);
    audio.userGesture();
    // Two noise sources (wind, rain) plus oscillators for hum and beds.
    expect(stub.created.sources.length).toBe(2);
    expect(stub.created.oscillators.length).toBeGreaterThanOrEqual(4);
  });

  it('rain gain follows the weather intensity', () => {
    const stub = makeStubContext();
    const audio = new CityAudio(() => stub.context);
    audio.setEnabled(true);
    audio.userGesture();
    audio.setRain(1);
    // The rain gain node ramps to a positive value.
    const targets = stub.created.gains.flatMap((g) => g.gain!.setTargetAtTime.mock.calls);
    expect(targets.some(([value]) => typeof value === 'number' && value > 0.15)).toBe(true);
  });

  it('time of day switches the ambient beds', () => {
    const stub = makeStubContext();
    const audio = new CityAudio(() => stub.context);
    audio.setEnabled(true);
    audio.userGesture();
    audio.setTimeOfDay('night');
    audio.setTimeOfDay('day');
    // No throw and mixes applied: the master received multiple ramps.
    const master = stub.created.gains[0]!;
    expect(master.gain!.setTargetAtTime.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('degrades to a silent state machine without WebAudio', () => {
    const audio = new CityAudio();
    audio.setEnabled(true);
    audio.userGesture();
    audio.cue('ui');
    audio.setRain(0.5);
    expect(audio.hasContext).toBe(false);
    audio.dispose();
  });

  it('dispose stops sources and closes the context', () => {
    const stub = makeStubContext();
    const audio = new CityAudio(() => stub.context);
    audio.setEnabled(true);
    audio.userGesture();
    audio.dispose();
    expect(stub.state.closed).toBe(1);
    audio.userGesture();
    expect(audio.hasContext).toBe(false);
  });
});
