// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onboarding } from '../src/components/Onboarding.js';
import { HomeView } from '../src/views/HomeView.js';
import { createDirectRunner } from '../src/pipeline/workerClient.js';
import { useAppStore, DEFAULT_CONFIG, DEFAULT_SETTINGS } from '../src/store/appStore.js';
import { DEFAULT_PROGRESS, loadProgress } from '../src/store/progress.js';

/**
 * Onboarding tests (acceptance W6.1): picture-based first-run overlay with
 * three illustrated entries, persistent seen flag, never blocking return
 * visits, reset by clearing local data, and reduced-motion support.
 */

function resetStore(): void {
  try {
    globalThis.localStorage?.clear();
  } catch {
    // In-memory reset below suffices.
  }
  useAppStore.setState({
    mode: 'home',
    config: { ...DEFAULT_CONFIG },
    running: false,
    runProgress: 0,
    runError: null,
    trace: null,
    playbackTick: 0,
    playbackPlaying: false,
    selection: null,
    activeMissionId: null,
    labInputTab: 'code',
    progress: { ...DEFAULT_PROGRESS },
    settings: { ...DEFAULT_SETTINGS },
    toast: null,
    runner: createDirectRunner(),
  });
}

beforeEach(() => {
  cleanup();
  resetStore();
});

describe('Onboarding', () => {
  it('shows three illustrated choices with inline SVGs on first run', () => {
    render(<Onboarding />);
    const dialog = screen.getByRole('dialog', { name: 'Welcome to QSimCity' });
    expect(dialog).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play a mission' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Watch the city' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Build a circuit' })).toBeTruthy();
    expect(dialog.querySelectorAll('svg').length).toBe(3);
  });

  it('Play opens mission 1 in Missions mode and persists the seen flag', async () => {
    render(<Onboarding />);
    await userEvent.click(screen.getByRole('button', { name: 'Play a mission' }));
    const s = useAppStore.getState();
    expect(s.mode).toBe('learn');
    expect(s.activeMissionId).toBe('bell-pair');
    expect(s.progress.onboardingSeen).toBe(true);
    expect(loadProgress().onboardingSeen).toBe(true);
  });

  it('Watch opens Explore and starts a bell run through the store', async () => {
    render(<Onboarding />);
    await userEvent.click(screen.getByRole('button', { name: 'Watch the city' }));
    expect(useAppStore.getState().mode).toBe('explore');
    expect(useAppStore.getState().config.sampleId).toBe('bell');
    await vi.waitFor(
      () => {
        expect(useAppStore.getState().trace).not.toBeNull();
      },
      { timeout: 15_000, interval: 25 },
    );
  });

  it('Build opens the Lab on the Blocks tab', async () => {
    render(<Onboarding />);
    await userEvent.click(screen.getByRole('button', { name: 'Build a circuit' }));
    expect(useAppStore.getState().mode).toBe('lab');
    expect(useAppStore.getState().labInputTab).toBe('blocks');
  });

  it('Skip dismisses without changing mode and never blocks return visits', async () => {
    const { rerender } = render(<Onboarding />);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(useAppStore.getState().mode).toBe('home');
    expect(useAppStore.getState().progress.onboardingSeen).toBe(true);
    rerender(<Onboarding />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays hidden for returning visitors and comes back after clearing local data', () => {
    useAppStore.getState().updateProgress({ onboardingSeen: true });
    render(<Onboarding />);
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    useAppStore.getState().clearLocalData();
    render(<Onboarding />);
    expect(screen.getByRole('dialog', { name: 'Welcome to QSimCity' })).toBeTruthy();
  });

  it('hides the animated pointer arrow when reduced motion is requested', () => {
    render(<Onboarding />);
    expect(document.querySelector('.onboarding-arrow')).not.toBeNull();
    cleanup();
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, reducedMotion: true } });
    render(<Onboarding />);
    expect(document.querySelector('.onboarding-arrow')).toBeNull();
  });

  it('appears on the Home view for first-time visitors', () => {
    render(<HomeView />);
    expect(screen.getByRole('dialog', { name: 'Welcome to QSimCity' })).toBeTruthy();
    // The regular home content stays reachable behind it.
    expect(screen.getByRole('button', { name: 'Guided Tour' })).toBeTruthy();
  });
});
