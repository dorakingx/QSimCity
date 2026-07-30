import { useEffect, useRef, type ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';
import { TOUR_CHAPTERS } from './chapters.js';
import { DISTRICTS } from '@qsimcity/world';

/**
 * Guided Tour overlay: chapter navigation with previous/next/exit, keyboard
 * support, and screen-reader-compatible narration. Selecting a chapter also
 * selects its district so the camera (3D) and the 2D view synchronize.
 */
export function TourOverlay(): ReactElement {
  const chapterIndex = useAppStore((s) => s.tourChapter);
  const { setTourChapter, setMode, select } = useAppStore.getState();
  const chapter = TOUR_CHAPTERS[Math.min(chapterIndex, TOUR_CHAPTERS.length - 1)]!;
  const district = DISTRICTS.find((d) => d.id === chapter.districtId)!;
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    select({ kind: 'district', districtId: chapter.districtId });
    headingRef.current?.focus();
  }, [chapter.districtId, select]);

  const goTo = (index: number): void => {
    setTourChapter(Math.max(0, Math.min(TOUR_CHAPTERS.length - 1, index)));
  };

  return (
    <section
      className="tour-overlay"
      aria-label={`Guided tour, chapter ${chapterIndex + 1} of ${TOUR_CHAPTERS.length}`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') goTo(chapterIndex + 1);
        else if (e.key === 'ArrowLeft') goTo(chapterIndex - 1);
      }}
    >
      <header className="tour-header">
        <p className="tour-progress">
          Chapter {chapterIndex + 1} of {TOUR_CHAPTERS.length} — {district.name}
        </p>
        <h2 tabIndex={-1} ref={headingRef}>
          {chapter.title}
        </h2>
      </header>
      <dl className="tour-body">
        <dt>What you see</dt>
        <dd>{chapter.see}</dd>
        <dt>What it represents</dt>
        <dd>{chapter.represents}</dd>
        <dt>How exact is this?</dt>
        <dd>{chapter.exactness}</dd>
        <dt>Why it matters</dt>
        <dd>{chapter.why}</dd>
      </dl>
      <nav className="tour-nav" aria-label="Tour navigation">
        <button type="button" onClick={() => goTo(chapterIndex - 1)} disabled={chapterIndex === 0}>
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => goTo(chapterIndex + 1)}
          disabled={chapterIndex >= TOUR_CHAPTERS.length - 1}
          className="primary"
        >
          Next →
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('explore');
          }}
        >
          Exit tour
        </button>
      </nav>
    </section>
  );
}
