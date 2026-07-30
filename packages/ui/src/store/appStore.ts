import { create } from 'zustand';
import { getSampleCircuit, DEVICES } from '@qsimcity/domain';
import type { NoiseModel } from '@qsimcity/simulator';
import { maxTickOf, type InteractiveAction } from '@qsimcity/world';
import { parseTraceJson, serializeTrace, traceFileName, type Trace } from 'qsimcity-trace';

export type AppMode = 'home' | 'explore' | 'lab' | 'compare' | 'accessible-2d' | 'tour';

export type SelectionTarget =
  | { kind: 'district'; districtId: string }
  | { kind: 'building'; buildingId: string; districtId: string }
  | { kind: 'qubit'; qubit: number }
  | { kind: 'instruction'; instructionId: string; circuit: 'input' | 'compiled' }
  | { kind: 'interactive'; interactiveId: string };

export interface RunConfig {
  qasm: string;
  sampleId: string | null;
  shots: number;
  seed: string;
  deviceId: string;
  noiseEnabled: boolean;
  noise: NoiseModel;
  layoutMethod: 'trivial' | 'interaction' | number[];
  optimize: boolean;
}

export interface Settings {
  quality: 'high' | 'balanced' | 'low';
  audioEnabled: boolean;
  audioVolume: number;
  reducedMotion: boolean;
  dayNight: 'day' | 'night';
  particles: boolean;
  labels: boolean;
}

export interface RunError {
  message: string;
  line?: number;
  col?: number;
}

export const DEFAULT_NOISE: NoiseModel = {
  readoutError: 0.02,
  depolarizing1q: 0.001,
  depolarizing2q: 0.01,
  amplitudeDamping: 0.005,
  phaseDamping: 0.005,
};

export const DEFAULT_CONFIG: RunConfig = {
  qasm: getSampleCircuit('bell').qasm,
  sampleId: 'bell',
  shots: 1024,
  seed: 'qsimcity',
  deviceId: 'linear-5',
  noiseEnabled: false,
  noise: DEFAULT_NOISE,
  layoutMethod: 'interaction',
  optimize: true,
};

export const DEFAULT_SETTINGS: Settings = {
  quality: 'balanced',
  audioEnabled: false,
  audioVolume: 0.5,
  reducedMotion: false,
  dayNight: 'night',
  particles: true,
  labels: true,
};

const SETTINGS_KEY = 'qsimcity.settings.v1';

export interface PipelineRunner {
  run(config: RunConfig, onProgress: (fraction: number) => void): Promise<Trace>;
  cancel(): void;
}

interface AppState {
  mode: AppMode;
  webglAvailable: boolean | null;
  config: RunConfig;
  running: boolean;
  runProgress: number;
  runError: RunError | null;
  trace: Trace | null;
  traceImported: boolean;
  playbackTick: number;
  playbackPlaying: boolean;
  playbackSpeed: number;
  selection: SelectionTarget | null;
  tourChapter: number;
  activeScenarioId: string | null;
  settings: Settings;
  paletteOpen: boolean;
  helpOpen: boolean;
  inspectorOpen: boolean;
  scheduleOpen: boolean;
  toast: string | null;
  runner: PipelineRunner | null;

  setMode(mode: AppMode): void;
  setWebglAvailable(ok: boolean): void;
  setRunner(runner: PipelineRunner): void;
  updateConfig(partial: Partial<RunConfig>): void;
  loadSample(sampleId: string): void;
  run(): Promise<void>;
  cancelRun(): void;
  importTraceJson(json: string): { ok: boolean; error?: string };
  exportTrace(): { fileName: string; json: string } | null;
  setTick(tick: number): void;
  stepForward(): void;
  stepBackward(): void;
  play(): void;
  pause(): void;
  setSpeed(speed: number): void;
  select(target: SelectionTarget | null): void;
  setTourChapter(index: number): void;
  setActiveScenario(id: string | null): void;
  updateSettings(partial: Partial<Settings>): void;
  setPaletteOpen(open: boolean): void;
  setHelpOpen(open: boolean): void;
  setInspectorOpen(open: boolean): void;
  setScheduleOpen(open: boolean): void;
  showToast(message: string): void;
  clearToast(): void;
  clearLocalData(): void;
  applyInteractiveAction(action: InteractiveAction): void;
}

export function loadSettings(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(settings: Settings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private browsing); settings stay in memory.
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: 'home',
  webglAvailable: null,
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
  tourChapter: 0,
  activeScenarioId: null,
  settings: loadSettings(),
  paletteOpen: false,
  helpOpen: false,
  // Closed until something is selected so the city is never occluded on
  // arrival; selecting anything opens it.
  inspectorOpen: false,
  scheduleOpen: false,
  toast: null,
  runner: null,

  setMode: (mode) => set({ mode }),
  setWebglAvailable: (ok) => set({ webglAvailable: ok }),
  setRunner: (runner) => set({ runner }),

  updateConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),

  loadSample: (sampleId) => {
    const sample = getSampleCircuit(sampleId);
    set((s) => ({
      config: { ...s.config, qasm: sample.qasm, sampleId },
      runError: null,
    }));
  },

  run: async () => {
    const { runner, config, running } = get();
    if (!runner || running) return;
    set({ running: true, runProgress: 0, runError: null });
    try {
      const trace = await runner.run(config, (fraction) => set({ runProgress: fraction }));
      set({
        trace,
        traceImported: false,
        running: false,
        runProgress: 1,
        playbackTick: 0,
        playbackPlaying: true,
      });
    } catch (e) {
      const err = e as RunError & Error;
      if (err.message === 'cancelled') {
        set({ running: false, runProgress: 0 });
        return;
      }
      set({
        running: false,
        runError: {
          message: err.message,
          ...(err.line !== undefined ? { line: err.line } : {}),
          ...(err.col !== undefined ? { col: err.col } : {}),
        },
      });
    }
  },

  cancelRun: () => {
    get().runner?.cancel();
  },

  importTraceJson: (json) => {
    try {
      const trace = parseTraceJson(json);
      set({
        trace,
        traceImported: true,
        playbackTick: 0,
        playbackPlaying: false,
        runError: null,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  exportTrace: () => {
    const { trace } = get();
    if (!trace) return null;
    return { fileName: traceFileName(trace), json: serializeTrace(trace) };
  },

  setTick: (tick) => {
    const { trace } = get();
    if (!trace) return;
    const max = maxTickOf(trace);
    set({ playbackTick: Math.max(0, Math.min(max, Math.round(tick))) });
  },

  stepForward: () => {
    const { playbackTick, trace } = get();
    if (!trace) return;
    set({
      playbackTick: Math.min(maxTickOf(trace), playbackTick + 1),
      playbackPlaying: false,
    });
  },

  stepBackward: () => {
    set((s) => ({
      playbackTick: Math.max(0, s.playbackTick - 1),
      playbackPlaying: false,
    }));
  },

  play: () => {
    const { trace, playbackTick } = get();
    if (!trace) return;
    // Restart from the beginning when play is pressed at the end.
    const tick = playbackTick >= maxTickOf(trace) ? 0 : playbackTick;
    set({ playbackPlaying: true, playbackTick: tick });
  },

  pause: () => set({ playbackPlaying: false }),

  setSpeed: (speed) => set({ playbackSpeed: Math.max(0.1, Math.min(5, speed)) }),

  select: (target) => set({ selection: target, inspectorOpen: target !== null ? true : get().inspectorOpen }),

  setTourChapter: (index) => set({ tourChapter: index }),
  setActiveScenario: (id) => set({ activeScenarioId: id }),

  updateSettings: (partial) => {
    const next = { ...get().settings, ...partial };
    persistSettings(next);
    set({ settings: next });
  },

  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setScheduleOpen: (open) => set({ scheduleOpen: open }),
  showToast: (message) => set({ toast: message }),
  clearToast: () => set({ toast: null }),

  clearLocalData: () => {
    try {
      globalThis.localStorage?.removeItem(SETTINGS_KEY);
    } catch {
      // Ignore storage failures; state below still resets.
    }
    set({ settings: { ...DEFAULT_SETTINGS } });
  },

  applyInteractiveAction: (action) => {
    const s = get();
    switch (action.kind) {
      case 'open-lab':
        set({ mode: 'lab' });
        break;
      case 'load-sample':
        s.loadSample(action.sampleId);
        set({ mode: 'lab' });
        s.showToast(`Loaded sample: ${getSampleCircuit(action.sampleId).title}`);
        break;
      case 'adjust-noise': {
        // Dial cycles low -> high -> off so each press visibly changes the
        // weather; enabling any value turns the noise model on.
        const high = action.parameter === 'readoutError' ? 0.15 : 0.08;
        const current = s.config.noise[action.parameter];
        const next = current === 0 ? high / 2 : current < high ? high : 0;
        set({
          config: {
            ...s.config,
            noiseEnabled: true,
            noise: { ...s.config.noise, [action.parameter]: next },
          },
        });
        s.showToast(`${action.parameter} set to ${next}. Run again to see the effect.`);
        break;
      }
      case 'adjust-shots': {
        const options = [64, 256, 1024, 4096];
        const idx = options.indexOf(s.config.shots);
        const next = options[(idx + 1) % options.length]!;
        set({ config: { ...s.config, shots: next } });
        s.showToast(`Shots set to ${next}. Run again to collect them.`);
        break;
      }
      case 'choose-layout': {
        const next = s.config.layoutMethod === 'trivial' ? 'interaction' : 'trivial';
        set({ config: { ...s.config, layoutMethod: next } });
        s.showToast(`Initial layout method set to ${next}.`);
        break;
      }
      case 'choose-device': {
        const ids = DEVICES.map((d) => d.id);
        const idx = ids.indexOf(s.config.deviceId);
        const next = ids[(idx + 1) % ids.length]!;
        set({ config: { ...s.config, deviceId: next } });
        s.showToast(`Device topology set to ${next}.`);
        break;
      }
      case 'toggle-optimization': {
        set({ config: { ...s.config, optimize: !s.config.optimize } });
        s.showToast(`Optimization ${s.config.optimize ? 'disabled' : 'enabled'}.`);
        break;
      }
      case 'open-compare':
        set({ mode: 'compare' });
        break;
      case 'open-observatory':
        set({ mode: 'accessible-2d' });
        break;
      case 'inspect-schedule':
        set({ scheduleOpen: true });
        break;
      case 'run-scenario':
        set({ activeScenarioId: action.scenarioId });
        break;
      case 'playback-speed': {
        const speeds = [0.5, 1, 2, 4];
        const idx = speeds.indexOf(s.playbackSpeed);
        const next = speeds[(idx + 1) % speeds.length] ?? 1;
        set({ playbackSpeed: next });
        s.showToast(`Playback speed ${next}x.`);
        break;
      }
    }
  },
}));
