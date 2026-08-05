// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Trace } from 'qsimcity-trace';
import { maxTickOf } from '@qsimcity/world';
import {
  MISSIONS,
  getMission,
  currentStepIndex,
  BELL_BUILDER_QASM,
  type MissionStepSnapshot,
} from '../src/missions/missions.js';
import { MissionPanel } from '../src/missions/MissionPanel.js';
import { Accessible2DView } from '../src/views/Accessible2DView.js';
import { createDirectRunner } from '../src/pipeline/workerClient.js';
import {
  useAppStore,
  DEFAULT_CONFIG,
  DEFAULT_SETTINGS,
  type RunConfig,
} from '../src/store/appStore.js';
import {
  DEFAULT_PROGRESS,
  loadProgress,
  persistProgress,
  PROGRESS_KEY,
  type LearningProgress,
} from '../src/store/progress.js';

/**
 * Mission tests (acceptance W6.4, W6.5, W6.9): every mission's completion
 * condition is verified against a real trace produced by the actual
 * pipeline with that mission's configuration; mission-1 steps advance in
 * order; progress persists and is wiped by clearLocalData; the panel works
 * inside the Accessible 2D view.
 */

const WAIT = { timeout: 20_000, interval: 25 } as const;

function resetStore(): void {
  try {
    globalThis.localStorage?.clear();
  } catch {
    // Storage may be unavailable; in-memory reset below suffices.
  }
  useAppStore.setState({
    mode: 'learn',
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
    activeMissionId: null,
    labInputTab: 'code',
    progress: { ...DEFAULT_PROGRESS },
    settings: { ...DEFAULT_SETTINGS },
    paletteOpen: false,
    helpOpen: false,
    inspectorOpen: false,
    scheduleOpen: false,
    toast: null,
    runner: createDirectRunner(),
  });
}

beforeEach(() => {
  cleanup();
  resetStore();
});

async function runMissionConfig(config: Partial<RunConfig>): Promise<Trace> {
  const runner = createDirectRunner();
  return runner.run({ ...DEFAULT_CONFIG, ...config }, () => {});
}

describe('every mission completes against a real trace of its own configuration', () => {
  for (const mission of MISSIONS.filter((m) => m.id !== 'count-on-it')) {
    it(`${mission.id} isComplete holds on its configured run`, async () => {
      const trace = await runMissionConfig(mission.config);
      expect(mission.isComplete(trace, DEFAULT_PROGRESS)).toBe(true);
    });
  }

  it('count-on-it completes only after two runs with different shot counts', async () => {
    const mission = getMission('count-on-it');
    const first = await runMissionConfig(mission.config);
    const oneRun: LearningProgress = { ...DEFAULT_PROGRESS, shotsHistory: [64] };
    expect(mission.isComplete(first, oneRun)).toBe(false);
    const second = await runMissionConfig({ ...mission.config, shots: 2048 });
    const twoRuns: LearningProgress = { ...DEFAULT_PROGRESS, shotsHistory: [64, 2048] };
    expect(mission.isComplete(second, twoRuns)).toBe(true);
  });

  it('mission trace evidence matches each mission concept', async () => {
    const longWay = await runMissionConfig(getMission('long-way-around').config);
    expect(longWay.events.some((e) => e.eventType === 'routing.swap_inserted')).toBe(true);
    const storm = await runMissionConfig(getMission('storm').config);
    expect(storm.noise).not.toBeNull();
    const courier = await runMissionConfig(getMission('courier').config);
    expect(courier.events.some((e) => e.eventType === 'classical.condition_evaluated')).toBe(true);
    const cleanup2 = await runMissionConfig(getMission('cleanup').config);
    expect(cleanup2.events.some((e) => e.eventType === 'gate.cancelled')).toBe(true);
  });
});

describe('mission 1 guided steps fire in order', () => {
  it('advances template, run, and watch steps against real state', async () => {
    const mission = getMission('bell-pair');
    const snapshotOf = (): MissionStepSnapshot => {
      const s = useAppStore.getState();
      return {
        config: s.config,
        trace: s.trace,
        playbackTick: s.playbackTick,
        playbackPlaying: s.playbackPlaying,
        progress: s.progress,
      };
    };

    // Fresh state: nothing done yet (the default config is a bundled sample).
    expect(currentStepIndex(mission, snapshotOf())).toBe(0);
    expect(mission.steps[0]!.isDone(snapshotOf())).toBe(false);

    // Step 1: the Bell template writes the builder circuit into the config.
    useAppStore.getState().updateConfig({ qasm: BELL_BUILDER_QASM, sampleId: null });
    expect(mission.steps[0]!.isDone(snapshotOf())).toBe(true);
    expect(mission.steps[1]!.isDone(snapshotOf())).toBe(false);
    expect(currentStepIndex(mission, snapshotOf())).toBe(1);

    // Step 2: run the real pipeline.
    useAppStore.getState().updateConfig(mission.config);
    await useAppStore.getState().run();
    expect(mission.steps[1]!.isDone(snapshotOf())).toBe(true);

    // Step 3 is an observation step: it must NOT complete the instant the
    // run returns — only once the replay has actually reached the end.
    expect(mission.steps[2]!.isDone(snapshotOf())).toBe(false);
    const trace = useAppStore.getState().trace!;
    useAppStore.setState({ playbackTick: maxTickOf(trace) });
    expect(mission.steps[2]!.isDone(snapshotOf())).toBe(true);
    expect(currentStepIndex(mission, snapshotOf())).toBe(mission.steps.length);
    expect(mission.isComplete(useAppStore.getState().trace!, useAppStore.getState().progress)).toBe(
      true,
    );
  });
});

describe('progress persistence', () => {
  it('round-trips mission progress through localStorage', () => {
    const progress: LearningProgress = {
      onboardingSeen: true,
      missions: { 'bell-pair': { completed: true, currentStep: 3 } },
      shotsHistory: [64, 2048],
      assessments: [
        { kind: 'pre', answers: [1, 2, 0, 2, 0], correctCount: 5, total: 5, completedAt: 'now' },
      ],
      assessmentDeclined: false,
    };
    persistProgress(progress);
    expect(loadProgress()).toEqual(progress);
  });

  it('updateProgress persists and clearLocalData wipes the stored progress', () => {
    useAppStore.getState().updateProgress({
      onboardingSeen: true,
      missions: { ghz: { completed: true, currentStep: 2 } },
      shotsHistory: [128],
    });
    expect(globalThis.localStorage.getItem(PROGRESS_KEY)).not.toBeNull();
    expect(loadProgress().missions['ghz']?.completed).toBe(true);

    useAppStore.getState().clearLocalData();
    expect(globalThis.localStorage.getItem(PROGRESS_KEY)).toBeNull();
    expect(useAppStore.getState().progress).toEqual(DEFAULT_PROGRESS);
    expect(useAppStore.getState().activeMissionId).toBeNull();
  });

  it('successful runs append their shot counts to the history', async () => {
    useAppStore.getState().updateConfig({ shots: 64, seed: 'progress-shots' });
    await useAppStore.getState().run();
    useAppStore.getState().updateConfig({ shots: 256 });
    await useAppStore.getState().run();
    expect(useAppStore.getState().progress.shotsHistory).toEqual([64, 256]);
  });
});

describe('MissionPanel', () => {
  it('lists all seven missions with friendly progress', () => {
    render(<MissionPanel />);
    expect(screen.getByText('0 of 7 missions complete')).toBeTruthy();
    for (const mission of MISSIONS) {
      expect(screen.getByRole('button', { name: new RegExp(mission.title) })).toBeTruthy();
    }
  });

  it('starting a mission applies its configuration and shows leveled steps', async () => {
    render(<MissionPanel />);
    await userEvent.click(screen.getByRole('button', { name: /The Long Way Around/ }));
    const s = useAppStore.getState();
    expect(s.activeMissionId).toBe('long-way-around');
    expect(s.config.sampleId).toBe('swap-storm');
    expect(s.config.deviceId).toBe('linear-5');
    expect(screen.getByRole('heading', { name: 'The Long Way Around' })).toBeTruthy();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole('group', { name: 'Mission controls' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rewind' })).toBeTruthy();
  });

  it('offers the pre-assessment non-blockingly before mission 1', async () => {
    render(<MissionPanel />);
    await userEvent.click(screen.getByRole('button', { name: /Light Up the Twin Towers/ }));
    expect(screen.getByText(/picture quiz before you start/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Maybe later' })).toBeTruthy();
    // The mission itself is available behind the offer — never blocked.
    expect(screen.getByRole('heading', { name: 'Light Up the Twin Towers' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    expect(screen.queryByText(/picture quiz before you start/)).toBeNull();
  });

  it('completes a mission end to end with celebration and persisted progress', async () => {
    useAppStore.getState().updateProgress({ assessmentDeclined: true });
    render(<MissionPanel />);
    await userEvent.click(screen.getByRole('button', { name: /Message from the Docks/ }));
    const runButton = document.querySelector<HTMLButtonElement>(
      '[data-mission-target="mission-run"]',
    );
    expect(runButton).not.toBeNull();
    fireEvent.click(runButton!);
    await vi.waitFor(() => {
      expect(useAppStore.getState().trace).not.toBeNull();
    }, WAIT);
    await vi.waitFor(() => {
      expect(useAppStore.getState().progress.missions['courier']?.completed).toBe(true);
    }, WAIT);
    expect(screen.getByText(/Feed-forward complete/)).toBeTruthy();
    expect(loadProgress().missions['courier']?.completed).toBe(true);
  });

  it('pulses the control the current step points at', async () => {
    useAppStore.getState().updateProgress({ assessmentDeclined: true });
    render(<MissionPanel />);
    await userEvent.click(screen.getByRole('button', { name: /Light Up the Twin Towers/ }));
    const highlighted = document.querySelector('.mission-highlight');
    expect(highlighted).not.toBeNull();
    expect(highlighted!.getAttribute('data-mission-target')).toBe('builder-bell-template');
  });

  it('offers the post-assessment after six mission completions', () => {
    const missions: Record<string, { completed: boolean; currentStep: number }> = {};
    for (const m of MISSIONS.slice(0, 6)) missions[m.id] = { completed: true, currentStep: 0 };
    useAppStore.getState().updateProgress({ missions });
    render(<MissionPanel />);
    expect(screen.getByText(/Six missions complete!/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Maybe later' })).toBeTruthy();
  });
});

describe('Accessible 2D parity (W6.9)', () => {
  it('renders the MissionPanel inside the 2D view', async () => {
    render(<Accessible2DView />);
    const summary = screen.getByText('Missions', { selector: 'summary' });
    fireEvent.click(summary);
    expect(screen.getByText('0 of 7 missions complete')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Light Up the Twin Towers/ }).length).toBe(1);
  });

  it('exposes the block builder through the Lab input tabs in the 2D view', async () => {
    render(<Accessible2DView />);
    const blocksTabs = screen.getAllByRole('tab', { name: 'Blocks' });
    await userEvent.click(blocksTabs[0]!);
    expect(useAppStore.getState().labInputTab).toBe('blocks');
    expect(screen.getAllByRole('region', { name: 'Circuit builder' }).length).toBeGreaterThan(0);
  });
});
