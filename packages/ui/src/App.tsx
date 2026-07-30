import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { useAppStore, type AppMode } from './store/appStore.js';
import { createRunner } from './pipeline/workerClient.js';
import { decodeShareUrl, decodeShareMode } from './store/shareUrl.js';
import { usePlaybackLoop } from './hooks/usePlaybackLoop.js';
import { HomeView } from './views/HomeView.js';
import { Accessible2DView } from './views/Accessible2DView.js';
import { CompareView } from './views/CompareView.js';
import { LabControls } from './components/LabControls.js';
import { TimelineBar } from './components/TimelineBar.js';
import { Inspector } from './components/Inspector.js';
import { CommandPalette } from './components/CommandPalette.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { SchedulePanel } from './components/SchedulePanel.js';
import { TourOverlay } from './tour/TourOverlay.js';
import { ScenarioPanel } from './scenarios/ScenarioPanel.js';
import { Toast } from './components/Toast.js';
import { SettingsMenu } from './components/SettingsMenu.js';

/** 3D city is code-split so 2D users never download three.js (spec §19). */
const CityView = lazy(() => import('./views/CityView.js'));

const MODE_LABELS: Record<AppMode, string> = {
  home: 'Home',
  tour: 'Guided Tour',
  explore: 'Explore',
  lab: 'Quantum Lab',
  compare: 'Compare',
  'accessible-2d': 'Accessible 2D',
};

function detectWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export function App(): ReactElement {
  const mode = useAppStore((s) => s.mode);
  const webglAvailable = useAppStore((s) => s.webglAvailable);
  const trace = useAppStore((s) => s.trace);
  usePlaybackLoop();

  useEffect(() => {
    const s = useAppStore.getState();
    s.setRunner(createRunner());
    s.setWebglAvailable(detectWebgl());
    const search = globalThis.location?.search ?? '';
    const shared = decodeShareUrl(search);
    const sharedMode = decodeShareMode(search);
    if (shared) s.updateConfig(shared);
    // An explicit ?view= wins; otherwise a shared configuration opens the Lab.
    if (sharedMode) s.setMode(sharedMode);
    else if (shared) s.setMode('lab');
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const s = useAppStore.getState();
      const target = e.target as HTMLElement | null;
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !inField)) {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
        return;
      }
      if (inField) return;
      switch (e.key) {
        case ' ':
          if (s.trace) {
            e.preventDefault();
            if (s.playbackPlaying) s.pause();
            else s.play();
          }
          break;
        case '.':
          s.stepForward();
          break;
        case ',':
          s.stepBackward();
          break;
        case 't':
        case 'T':
          s.setMode('tour');
          break;
        case 'i':
        case 'I':
          s.setInspectorOpen(!s.inspectorOpen);
          break;
        case '?':
          s.setHelpOpen(true);
          break;
        case 'Escape':
          s.setPaletteOpen(false);
          s.setHelpOpen(false);
          s.setScheduleOpen(false);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const wants3d = mode === 'explore' || mode === 'lab' || mode === 'tour';
  const canUse3d = webglAvailable === true;
  const showCity = wants3d && canUse3d;

  return (
    <div className="app-shell" data-mode={mode}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="app-header">
        <button
          type="button"
          className="brand"
          onClick={() => useAppStore.getState().setMode('home')}
          aria-label="QSimCity home"
        >
          <span className="brand-mark" aria-hidden="true">
            ◬
          </span>
          QSimCity
        </button>
        <nav aria-label="Modes">
          {(Object.keys(MODE_LABELS) as AppMode[])
            .filter((m) => m !== 'home')
            .map((m) => (
              <button
                key={m}
                type="button"
                aria-current={mode === m ? 'page' : undefined}
                className={mode === m ? 'active' : ''}
                onClick={() => useAppStore.getState().setMode(m)}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
        </nav>
        <div className="header-tools">
          <button type="button" onClick={() => useAppStore.getState().setPaletteOpen(true)}>
            Search <kbd>Ctrl K</kbd>
          </button>
          <button type="button" onClick={() => useAppStore.getState().setHelpOpen(true)}>
            Help
          </button>
          <SettingsMenu />
        </div>
      </header>

      <main id="main-content" className="app-main">
        {mode === 'home' && <HomeView />}
        {mode === 'accessible-2d' && <Accessible2DView />}
        {mode === 'compare' && <CompareView />}
        {wants3d && !canUse3d && (
          <div className="webgl-fallback">
            {webglAvailable === false ? (
              <>
                <p role="status">
                  3D rendering is unavailable here, so QSimCity switched to Accessible 2D Mode —
                  the complete product without WebGL.
                </p>
                <Accessible2DView />
              </>
            ) : (
              <p role="status">Checking 3D support…</p>
            )}
          </div>
        )}
        {showCity && (
          <div className="city-layout">
            <Suspense
              fallback={
                <div className="city-loading" role="status">
                  Building the city…
                </div>
              }
            >
              <CityView />
            </Suspense>
            {mode === 'lab' && (
              <div className="lab-drawer">
                <LabControls />
              </div>
            )}
            <Inspector />
            {trace && (
              <div className="timeline-dock">
                <TimelineBar />
              </div>
            )}
            {mode === 'tour' && <TourOverlay />}
            <ScenarioPanel />
          </div>
        )}
      </main>

      <CommandPalette />
      <HelpOverlay />
      <SchedulePanel />
      <Toast />
    </div>
  );
}
