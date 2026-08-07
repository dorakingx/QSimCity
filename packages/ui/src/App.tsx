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
import { MissionPanel } from './missions/MissionPanel.js';

/** 3D city is code-split so 2D users never download three.js (spec §19). */
const CityView = lazy(() => import('./views/CityView.js'));

const MODE_LABELS: Record<AppMode, string> = {
  home: 'Home',
  tour: 'Guided Tour',
  learn: 'Missions',
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

/**
 * Whether WebGL2 exists but is being served by a software rasterizer.
 *
 * A blocklisted GPU, a virtual machine, or a remote desktop gives a page a
 * WebGL2 context that works and is roughly a hundred times too slow — this
 * build measured a p50 of 314 ms per frame, about 3 fps, on SwiftShader.
 * `detectWebgl` returns true in that case, so the learner is dropped into
 * the 3D city with nothing steering them to the complete 2D path that
 * would serve them far better. School and lab hardware is exactly where
 * this happens.
 */
function detectSoftwareRenderer(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(renderer);
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
    if (detectWebgl() && detectSoftwareRenderer()) {
      s.showToast(
        'This device is drawing 3D in software, which will be very slow. Accessible 2D Mode has the whole workflow and runs smoothly here.',
      );
    }
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
      // The event target is the Window itself when nothing is focused, so
      // narrow before reaching for DOM methods.
      const target = e.target instanceof Element ? e.target : null;
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      // Space and Enter belong to whatever control has focus. Calling
      // preventDefault on a focused button suppresses the browser's
      // synthetic click, so an earlier version silently broke Space as a
      // button activation key across the whole product the moment a trace
      // existed — while the Help overlay still promised it worked.
      const onControl =
        target !== null &&
        target.closest(
          'button, a[href], summary, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"]',
        ) !== null;
      // WCAG 2.1.4 Character Key Shortcuts: every unmodified single-key
      // shortcut below can be switched off in Settings. Escape and the
      // modified Ctrl/Cmd+K are exempt (Escape is not a character key, and
      // Ctrl+K carries a modifier), so the app is never left without a way
      // to dismiss a dialog or reach the command palette.
      const singleKey = s.settings.singleKeyShortcuts;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !inField && singleKey)) {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
        return;
      }
      if (e.key === 'Escape') {
        s.setPaletteOpen(false);
        s.setHelpOpen(false);
        s.setScheduleOpen(false);
        return;
      }
      if (inField) return;
      if (!singleKey) return;
      switch (e.key) {
        case ' ':
          if (s.trace && !onControl) {
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
        {mode === 'learn' && (
          <div className="learn-layout">
            <MissionPanel />
          </div>
        )}
        {mode === 'accessible-2d' && <Accessible2DView />}
        {mode === 'compare' && <CompareView />}
        {wants3d && !canUse3d && (
          <div className="webgl-fallback">
            {webglAvailable === false ? (
              <>
                <p role="status">
                  3D rendering is unavailable here, so QSimCity switched to Accessible 2D Mode — the
                  complete product without WebGL.
                </p>
                <Accessible2DView />
                {/* The tour is plain DOM; rendering it only inside the
                    WebGL branch meant a learner without a GPU chose Guided
                    Tour and got nothing. */}
                {mode === 'tour' && <TourOverlay />}
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
