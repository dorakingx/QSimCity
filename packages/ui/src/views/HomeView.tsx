import type { ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';

/**
 * First visit (spec §7.1): purpose understandable in seconds, three clear
 * entry points, no login, no dialog stack.
 */
export function HomeView(): ReactElement {
  const { setMode } = useAppStore.getState();
  const webglAvailable = useAppStore((s) => s.webglAvailable);

  return (
    <main className="home-view">
      <div className="home-hero">
        <h1>
          <span className="brand-mark" aria-hidden="true">
            ◬
          </span>
          QSimCity
        </h1>
        <p className="home-tagline">
          Watch a quantum program travel through a living city — parsed, laid out, routed,
          translated, optimized, scheduled, executed, and measured. Every light is driven by a
          real computation trace, and every number tells you how certain it is.
        </p>
        <div className="home-actions">
          <button type="button" className="primary" onClick={() => setMode('tour')}>
            Guided Tour
          </button>
          <button type="button" onClick={() => setMode('explore')}>
            Explore
          </button>
          <button type="button" onClick={() => setMode('lab')}>
            Quantum Lab
          </button>
        </div>
        {webglAvailable === false && (
          <p className="hint" role="status">
            3D rendering is unavailable in this browser, so QSimCity is running in Accessible 2D
            Mode — every feature still works.{' '}
            <button type="button" onClick={() => setMode('accessible-2d')}>
              Open 2D Mode
            </button>
          </p>
        )}
        <p className="home-secondary">
          Prefer no 3D?{' '}
          <button type="button" className="link-button" onClick={() => setMode('accessible-2d')}>
            Use Accessible 2D Mode
          </button>{' '}
          — the complete product without WebGL.
        </p>
      </div>
      <footer className="home-footer">
        <p>
          QSimCity is an unofficial, independent, open-source educational and research
          visualization project. It is not produced, endorsed, sponsored, or approved by
          Electronic Arts, Maxis, or IBM. No account, no upload: everything runs in your
          browser.
        </p>
      </footer>
    </main>
  );
}
