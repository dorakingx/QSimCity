import { beforeEach, describe, expect, it } from 'vitest';
import { getSampleCircuit } from '@qsimcity/domain';
import { serializeTrace } from 'qsimcity-trace';
import { useAppStore, DEFAULT_CONFIG, DEFAULT_SETTINGS } from '../src/store/appStore.js';
import { createDirectRunner } from '../src/pipeline/workerClient.js';
import { encodeShareUrl, decodeShareUrl } from '../src/store/shareUrl.js';

function resetStore(): void {
  useAppStore.setState({
    mode: 'home',
    config: { ...DEFAULT_CONFIG },
    running: false,
    runProgress: 0,
    runError: null,
    trace: null,
    traceImported: false,
    playbackTick: 0,
    playbackPlaying: false,
    playbackSpeed: 1,
    selection: null,
    settings: { ...DEFAULT_SETTINGS },
    runner: createDirectRunner(),
    toast: null,
  });
}

beforeEach(resetStore);

describe('appStore run flow', () => {
  it('runs the pipeline and stores a trace, starting playback', async () => {
    const s = useAppStore.getState();
    s.updateConfig({ shots: 64, seed: 'store-run' });
    await useAppStore.getState().run();
    const after = useAppStore.getState();
    expect(after.trace).not.toBeNull();
    expect(after.running).toBe(false);
    expect(after.playbackPlaying).toBe(true);
    expect(after.runError).toBeNull();
  });

  it('captures parser errors with line and column, preserving input', async () => {
    const bad = 'OPENQASM 2.0;\nqreg q[1];\nfrob q[0];';
    useAppStore.getState().updateConfig({ qasm: bad, sampleId: null });
    await useAppStore.getState().run();
    const after = useAppStore.getState();
    expect(after.runError).not.toBeNull();
    expect(after.runError!.line).toBe(3);
    expect(after.config.qasm).toBe(bad); // input preserved (spec §15)
  });

  it('loadSample replaces the program and clears errors', () => {
    useAppStore.setState({ runError: { message: 'x' } });
    useAppStore.getState().loadSample('ghz-4');
    const after = useAppStore.getState();
    expect(after.config.qasm).toBe(getSampleCircuit('ghz-4').qasm);
    expect(after.config.sampleId).toBe('ghz-4');
    expect(after.runError).toBeNull();
  });
});

describe('appStore playback controls', () => {
  beforeEach(async () => {
    useAppStore.getState().updateConfig({ shots: 32, seed: 'pb' });
    await useAppStore.getState().run();
  });

  it('setTick clamps to the trace range', () => {
    useAppStore.getState().setTick(99999);
    const max = useAppStore.getState().playbackTick;
    expect(max).toBeGreaterThan(0);
    useAppStore.getState().setTick(-5);
    expect(useAppStore.getState().playbackTick).toBe(0);
  });

  it('step forward/backward move one tick and pause playback', () => {
    useAppStore.getState().setTick(0);
    useAppStore.getState().stepForward();
    expect(useAppStore.getState().playbackTick).toBe(1);
    expect(useAppStore.getState().playbackPlaying).toBe(false);
    useAppStore.getState().stepBackward();
    expect(useAppStore.getState().playbackTick).toBe(0);
  });

  it('play restarts from the beginning when at the end', () => {
    useAppStore.getState().setTick(99999);
    useAppStore.getState().play();
    expect(useAppStore.getState().playbackTick).toBe(0);
    expect(useAppStore.getState().playbackPlaying).toBe(true);
  });

  it('speed clamps to 0.1..5', () => {
    useAppStore.getState().setSpeed(50);
    expect(useAppStore.getState().playbackSpeed).toBe(5);
    useAppStore.getState().setSpeed(0.001);
    expect(useAppStore.getState().playbackSpeed).toBe(0.1);
  });
});

describe('appStore import/export', () => {
  it('round-trips a trace through export and import', async () => {
    useAppStore.getState().updateConfig({ shots: 32, seed: 'io' });
    await useAppStore.getState().run();
    const exported = useAppStore.getState().exportTrace()!;
    expect(exported.fileName).toMatch(/\.qsimcity\.json$/);
    useAppStore.setState({ trace: null });
    const result = useAppStore.getState().importTraceJson(exported.json);
    expect(result.ok).toBe(true);
    expect(useAppStore.getState().trace).not.toBeNull();
    expect(useAppStore.getState().traceImported).toBe(true);
  });

  it('rejects malformed imports with a readable error', () => {
    const result = useAppStore.getState().importTraceJson('{"schemaVersion":"1.0.0"}');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(useAppStore.getState().trace).toBeNull();
  });

  it('rejects hostile oversized-ish structures without crashing', async () => {
    useAppStore.getState().updateConfig({ shots: 16, seed: 'hostile' });
    await useAppStore.getState().run();
    const good = useAppStore.getState().exportTrace()!.json;
    const tampered = good.replace('"logicalTick": 1', '"logicalTick": -5');
    const result = useAppStore.getState().importTraceJson(tampered);
    expect(result.ok).toBe(false);
  });

  it('exportTrace returns null without a trace', () => {
    expect(useAppStore.getState().exportTrace()).toBeNull();
  });
});

describe('interactive actions (in-world consoles)', () => {
  it('load-sample switches to lab with the sample loaded', () => {
    useAppStore.getState().applyInteractiveAction({ kind: 'load-sample', sampleId: 'qft-3' });
    expect(useAppStore.getState().mode).toBe('lab');
    expect(useAppStore.getState().config.sampleId).toBe('qft-3');
  });

  it('adjust-noise toggles the parameter and enables noise', () => {
    useAppStore
      .getState()
      .applyInteractiveAction({ kind: 'adjust-noise', parameter: 'readoutError' });
    const after = useAppStore.getState();
    expect(after.config.noiseEnabled).toBe(true);
    expect(after.config.noise.readoutError).toBeGreaterThan(0);
    expect(after.toast).toContain('readoutError');
  });

  it('adjust-shots cycles the shot presets', () => {
    const before = useAppStore.getState().config.shots;
    useAppStore.getState().applyInteractiveAction({ kind: 'adjust-shots' });
    expect(useAppStore.getState().config.shots).not.toBe(before);
  });

  it('choose-layout toggles between trivial and interaction', () => {
    useAppStore.getState().applyInteractiveAction({ kind: 'choose-layout' });
    expect(useAppStore.getState().config.layoutMethod).toBe('trivial');
    useAppStore.getState().applyInteractiveAction({ kind: 'choose-layout' });
    expect(useAppStore.getState().config.layoutMethod).toBe('interaction');
  });

  it('toggle-optimization flips the flag', () => {
    useAppStore.getState().applyInteractiveAction({ kind: 'toggle-optimization' });
    expect(useAppStore.getState().config.optimize).toBe(false);
  });

  it('open-compare and open-observatory switch modes', () => {
    useAppStore.getState().applyInteractiveAction({ kind: 'open-compare' });
    expect(useAppStore.getState().mode).toBe('compare');
    useAppStore.getState().applyInteractiveAction({ kind: 'open-observatory' });
    expect(useAppStore.getState().mode).toBe('accessible-2d');
  });

  it('run-scenario activates the scenario', () => {
    useAppStore
      .getState()
      .applyInteractiveAction({ kind: 'run-scenario', scenarioId: 'bell-state' });
    expect(useAppStore.getState().activeScenarioId).toBe('bell-state');
  });
});

describe('share URLs', () => {
  it('encodes and decodes a sample configuration', () => {
    const config = {
      ...DEFAULT_CONFIG,
      sampleId: 'ghz-4',
      shots: 2048,
      seed: 'share-seed',
      deviceId: 'grid-3x3',
      noiseEnabled: true,
    };
    const url = encodeShareUrl(config, 'https://example.test/');
    const decoded = decodeShareUrl(new URL(url).search)!;
    expect(decoded.sampleId).toBe('ghz-4');
    expect(decoded.shots).toBe(2048);
    expect(decoded.seed).toBe('share-seed');
    expect(decoded.deviceId).toBe('grid-3x3');
    expect(decoded.noiseEnabled).toBe(true);
  });

  it('never embeds program text in the URL (privacy, spec §17)', () => {
    const url = encodeShareUrl({ ...DEFAULT_CONFIG, sampleId: 'bell' }, 'https://example.test/');
    expect(url).not.toContain('OPENQASM');
    expect(url).not.toContain('qreg');
  });

  it('rejects unknown samples and hostile parameters', () => {
    expect(decodeShareUrl('?sample=evil-injection')).toBeNull();
    expect(decodeShareUrl('')).toBeNull();
    const decoded = decodeShareUrl('?sample=bell&shots=999999999&device=nonsense&noise=2,2,2,2,2')!;
    expect(decoded.shots).toBeUndefined();
    expect(decoded.deviceId).toBeUndefined();
    expect(decoded.noiseEnabled).not.toBe(true);
  });
});

describe('settings', () => {
  it('updateSettings merges and clearLocalData restores defaults', () => {
    useAppStore.getState().updateSettings({ quality: 'low', audioEnabled: true });
    expect(useAppStore.getState().settings.quality).toBe('low');
    useAppStore.getState().clearLocalData();
    expect(useAppStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('trace serialization sanity for the store round trip', () => {
  it('serialized store traces validate independently', async () => {
    useAppStore.getState().updateConfig({ shots: 16, seed: 'ser' });
    await useAppStore.getState().run();
    const trace = useAppStore.getState().trace!;
    expect(serializeTrace(trace)).toContain('"schemaVersion"');
  });
});
