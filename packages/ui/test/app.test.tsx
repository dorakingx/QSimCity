// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.js';
import { useAppStore, DEFAULT_CONFIG, DEFAULT_SETTINGS } from '../src/store/appStore.js';
import { createDirectRunner } from '../src/pipeline/workerClient.js';
import { usePlaybackLoop } from '../src/hooks/usePlaybackLoop.js';
import { runPipeline } from '../src/pipeline/runPipeline.js';
import { renderHook } from '@testing-library/react';

/**
 * App shell tests: mode routing, global keyboard map, WebGL detection and
 * fallback. The 3D canvas itself is exercised by the Playwright suite,
 * which runs a real WebGL context.
 */

beforeEach(() => {
  cleanup();
  useAppStore.setState({
    mode: 'home',
    webglAvailable: null,
    config: { ...DEFAULT_CONFIG },
    running: false,
    trace: null,
    playbackTick: 0,
    playbackPlaying: false,
    playbackSpeed: 1,
    selection: null,
    settings: { ...DEFAULT_SETTINGS },
    paletteOpen: false,
    helpOpen: false,
    inspectorOpen: false,
    scheduleOpen: false,
    toast: null,
    runner: createDirectRunner(),
  });
});

describe('App shell', () => {
  it('renders the header, skip link, and home view', () => {
    render(<App />);
    expect(screen.getByText('Skip to main content')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Modes' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /QSimCity/ })).toBeTruthy();
  });

  it('switches modes from the navigation', async () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Modes' });
    await userEvent.click(within(nav, 'Accessible 2D'));
    expect(useAppStore.getState().mode).toBe('accessible-2d');
    await userEvent.click(within(nav, 'Compare'));
    expect(useAppStore.getState().mode).toBe('compare');
  });

  it('brand button returns home', async () => {
    useAppStore.setState({ mode: 'compare' });
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'QSimCity home' }));
    expect(useAppStore.getState().mode).toBe('home');
  });

  it('detects missing WebGL and routes 3D modes to the 2D fallback', () => {
    // happy-dom has no WebGL context, so detection returns false.
    useAppStore.setState({ mode: 'explore' });
    render(<App />);
    expect(useAppStore.getState().webglAvailable).toBe(false);
    expect(screen.getByRole('status').textContent).toContain('Accessible 2D Mode');
    expect(screen.getAllByLabelText(/OpenQASM 2.0 program/).length).toBeGreaterThan(0);
  });

  it('opens the palette and help from the header', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(useAppStore.getState().paletteOpen).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(useAppStore.getState().helpOpen).toBe(true);
  });
});

describe('global keyboard map', () => {
  beforeEach(() => {
    render(<App />);
  });

  it('Ctrl+K toggles the command palette', () => {
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(useAppStore.getState().paletteOpen).toBe(true);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(useAppStore.getState().paletteOpen).toBe(false);
  });

  it('/ opens the palette outside form fields', () => {
    fireEvent.keyDown(window, { key: '/' });
    expect(useAppStore.getState().paletteOpen).toBe(true);
  });

  it('T starts the tour, I toggles the inspector, ? opens help', () => {
    fireEvent.keyDown(window, { key: 't' });
    expect(useAppStore.getState().mode).toBe('tour');
    fireEvent.keyDown(window, { key: 'i' });
    expect(useAppStore.getState().inspectorOpen).toBe(true);
    fireEvent.keyDown(window, { key: '?' });
    expect(useAppStore.getState().helpOpen).toBe(true);
  });

  it('Escape closes overlays', () => {
    useAppStore.setState({ paletteOpen: true, helpOpen: true, scheduleOpen: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    const s = useAppStore.getState();
    expect(s.paletteOpen).toBe(false);
    expect(s.helpOpen).toBe(false);
    expect(s.scheduleOpen).toBe(false);
  });

  it('space, comma, and period drive playback once a trace exists', async () => {
    const { trace } = await runPipeline({
      qasm: DEFAULT_CONFIG.qasm,
      shots: 16,
      seed: 'kbd',
      deviceId: 'linear-5',
      noise: null,
      layoutMethod: 'trivial',
      optimize: true,
    });
    act(() => {
      useAppStore.setState({ trace, playbackTick: 0, playbackPlaying: false });
    });
    fireEvent.keyDown(window, { key: ' ' });
    expect(useAppStore.getState().playbackPlaying).toBe(true);
    fireEvent.keyDown(window, { key: ' ' });
    expect(useAppStore.getState().playbackPlaying).toBe(false);
    fireEvent.keyDown(window, { key: '.' });
    expect(useAppStore.getState().playbackTick).toBe(1);
    fireEvent.keyDown(window, { key: ',' });
    expect(useAppStore.getState().playbackTick).toBe(0);
  });

  it('ignores shortcuts while typing in a form field', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 't' });
    expect(useAppStore.getState().mode).not.toBe('tour');
    input.remove();
  });
});

describe('usePlaybackLoop', () => {
  it('advances the tick while playing and stops at the end', async () => {
    vi.useFakeTimers();
    const { trace } = await runPipeline({
      qasm: DEFAULT_CONFIG.qasm,
      shots: 8,
      seed: 'loop',
      deviceId: 'linear-5',
      noise: null,
      layoutMethod: 'trivial',
      optimize: true,
    });
    useAppStore.setState({ trace, playbackTick: 0, playbackPlaying: true, playbackSpeed: 5 });
    renderHook(() => usePlaybackLoop());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(useAppStore.getState().playbackTick).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(useAppStore.getState().playbackPlaying).toBe(false);
    vi.useRealTimers();
  });

  it('does nothing without a trace', () => {
    vi.useFakeTimers();
    useAppStore.setState({ trace: null, playbackPlaying: true });
    renderHook(() => usePlaybackLoop());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(useAppStore.getState().playbackTick).toBe(0);
    vi.useRealTimers();
  });
});

/** Small helper: click a button inside a container by its accessible name. */
function within(container: HTMLElement, name: string): HTMLElement {
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === name,
  );
  if (!button) throw new Error(`No button named ${name}`);
  return button;
}
