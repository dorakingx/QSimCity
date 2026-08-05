import { useEffect, useRef, type ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

/**
 * First-run onboarding (spec section 7.1): a near-zero-reading welcome with
 * three large illustrated buttons and no wall of text. The seen flag
 * persists in local progress, so returning visitors are never blocked;
 * clearing local data brings it back.
 */

function FlagIllustration(): ReactElement {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true" className="onboarding-illustration">
      <line x1="30" y1="16" x2="30" y2="80" stroke="currentColor" strokeWidth="5" />
      <path d="M35 20 L74 28 L35 44 Z" fill="var(--accent)" stroke="currentColor" strokeWidth="3" />
      <path
        d="M52 58 l3.5 7 l7.5 1 l-5.5 5.5 l1.5 8 l-7-4 l-7 4 l1.5-8 l-5.5-5.5 l7.5-1 z"
        fill="var(--focus)"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function SkylineIllustration(): ReactElement {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true" className="onboarding-illustration">
      <rect
        x="10"
        y="42"
        width="16"
        height="38"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect
        x="30"
        y="26"
        width="18"
        height="54"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect
        x="52"
        y="50"
        width="14"
        height="30"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect
        x="70"
        y="34"
        width="16"
        height="46"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect x="35" y="32" width="4" height="4" fill="var(--accent)" />
      <rect x="42" y="32" width="4" height="4" fill="var(--accent)" />
      <rect x="35" y="42" width="4" height="4" fill="var(--accent)" />
      <rect x="74" y="40" width="4" height="4" fill="var(--accent)" />
      <rect x="80" y="48" width="4" height="4" fill="var(--accent)" />
      <line x1="4" y1="80" x2="92" y2="80" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function BlocksIllustration(): ReactElement {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true" className="onboarding-illustration">
      <rect
        x="16"
        y="52"
        width="24"
        height="24"
        rx="4"
        fill="var(--accent)"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect
        x="46"
        y="52"
        width="24"
        height="24"
        rx="4"
        fill="var(--series-b)"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect
        x="31"
        y="24"
        width="24"
        height="24"
        rx="4"
        fill="var(--accent-2)"
        stroke="currentColor"
        strokeWidth="3"
      />
      <text x="28" y="69" textAnchor="middle" fontSize="14" fill="#04252b" fontWeight="700">
        H
      </text>
      <text x="58" y="69" textAnchor="middle" fontSize="12" fill="#04252b" fontWeight="700">
        CX
      </text>
      <text x="43" y="41" textAnchor="middle" fontSize="12" fill="#04252b" fontWeight="700">
        M
      </text>
    </svg>
  );
}

export function Onboarding(): ReactElement | null {
  const seen = useAppStore((s) => s.progress.onboardingSeen);
  const reducedMotion = useAppStore((s) => s.settings.reducedMotion);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, !seen);

  useEffect(() => {
    if (!seen) requestAnimationFrame(() => headingRef.current?.focus());
  }, [seen]);

  if (seen) return null;

  const finish = (action: () => void): void => {
    useAppStore.getState().updateProgress({ onboardingSeen: true });
    action();
  };

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div
        ref={dialogRef}
        className="onboarding"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to QSimCity"
        onKeyDown={(e) => {
          if (e.key === 'Escape') finish(() => undefined);
        }}
      >
        <h2 tabIndex={-1} ref={headingRef}>
          Welcome!
        </h2>
        <p className="onboarding-tagline">Pick a door into the quantum city.</p>
        <div className="onboarding-choices">
          <button
            type="button"
            className="onboarding-choice"
            onClick={() =>
              finish(() => {
                const s = useAppStore.getState();
                s.setActiveMission('bell-pair');
                s.setMode('learn');
              })
            }
          >
            <FlagIllustration />
            <span className="onboarding-choice-label">Play a mission</span>
            {!reducedMotion && (
              <span className="onboarding-arrow" aria-hidden="true">
                ➜
              </span>
            )}
          </button>
          <button
            type="button"
            className="onboarding-choice"
            onClick={() =>
              finish(() => {
                const s = useAppStore.getState();
                s.loadSample('bell');
                s.setMode('explore');
                void s.run();
              })
            }
          >
            <SkylineIllustration />
            <span className="onboarding-choice-label">Watch the city</span>
          </button>
          <button
            type="button"
            className="onboarding-choice"
            onClick={() =>
              finish(() => {
                const s = useAppStore.getState();
                s.setLabInputTab('blocks');
                s.setMode('lab');
              })
            }
          >
            <BlocksIllustration />
            <span className="onboarding-choice-label">Build a circuit</span>
          </button>
        </div>
        <button
          type="button"
          className="link-button onboarding-skip"
          onClick={() => finish(() => undefined)}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
