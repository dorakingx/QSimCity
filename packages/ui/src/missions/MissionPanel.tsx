import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';
import {
  currentStepIndex,
  getMission,
  MISSIONS,
  type Mission,
  type MissionStepSnapshot,
} from './missions.js';
import { CircuitBuilder, useCircuitBuilder } from '../components/CircuitBuilder.js';
import { LabControls } from '../components/LabControls.js';
import { ResultsSection } from '../components/ResultsSection.js';
import { TimelineBar } from '../components/TimelineBar.js';
import { EventLog } from '../components/EventLog.js';
import { Assessment } from '../components/Assessment.js';

/**
 * Missions mode (spec section 7.3): seven guided, machine-checked missions
 * with live step checkmarks, contextual playback controls, celebration
 * states, and progress persisted locally. Plain DOM throughout, so the whole
 * learning path works identically without WebGL (spec W6.9).
 */

function MissionList({ onStart }: { onStart: (mission: Mission) => void }): ReactElement {
  const progress = useAppStore((s) => s.progress);
  const level = useAppStore((s) => s.settings.explanationLevel);
  const completedCount = MISSIONS.filter((m) => progress.missions[m.id]?.completed).length;
  return (
    <div className="mission-list-wrap">
      <p className="mission-overall">
        {completedCount} of {MISSIONS.length} missions complete
      </p>
      <progress
        value={completedCount}
        max={MISSIONS.length}
        aria-label="Overall mission progress"
      />
      <ul className="mission-list" aria-label="Missions">
        {MISSIONS.map((m, i) => {
          const done = progress.missions[m.id]?.completed === true;
          return (
            <li key={m.id}>
              <button
                type="button"
                className={`mission-card${done ? ' done' : ''}`}
                onClick={() => onStart(m)}
              >
                <span className="mission-card-mark" aria-hidden="true">
                  {done ? '★' : i + 1}
                </span>
                <span className="mission-card-body">
                  <strong>{m.title}</strong>
                  <span className="hint">{level === 'child' ? m.briefing.child : m.goal}</span>
                </span>
                {done && <span className="visually-hidden">(complete)</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MissionPanel(): ReactElement {
  const activeMissionId = useAppStore((s) => s.activeMissionId);
  const config = useAppStore((s) => s.config);
  const trace = useAppStore((s) => s.trace);
  const running = useAppStore((s) => s.running);
  const playbackTick = useAppStore((s) => s.playbackTick);
  const playbackPlaying = useAppStore((s) => s.playbackPlaying);
  const progress = useAppStore((s) => s.progress);
  const level = useAppStore((s) => s.settings.explanationLevel);
  const builder = useCircuitBuilder();
  const [openAssessment, setOpenAssessment] = useState<'pre' | 'post' | null>(null);
  const [postOfferDismissed, setPostOfferDismissed] = useState(false);

  const mission = activeMissionId ? getMission(activeMissionId) : null;
  const snapshot: MissionStepSnapshot = useMemo(
    () => ({ config, trace, playbackTick, playbackPlaying, progress }),
    [config, trace, playbackTick, playbackPlaying, progress],
  );
  const stepIndex = mission ? currentStepIndex(mission, snapshot) : 0;
  const entry = mission ? progress.missions[mission.id] : undefined;
  // Completion requires every guided step, not just the trace condition —
  // an observation step ("watch the replay") must actually happen before
  // the celebration fires.
  const liveComplete =
    mission !== null &&
    trace !== null &&
    mission.isComplete(trace, progress) &&
    stepIndex >= mission.steps.length;
  const completed = (entry?.completed ?? false) || liveComplete;
  const completedCount = MISSIONS.filter((m) => progress.missions[m.id]?.completed).length;

  // Persist step advancement and completion as the learner works.
  useEffect(() => {
    if (!mission) return;
    const stored = progress.missions[mission.id] ?? { completed: false, currentStep: 0 };
    const nextCompleted = stored.completed || liveComplete;
    if (stored.currentStep !== stepIndex || stored.completed !== nextCompleted) {
      useAppStore.getState().updateProgress({
        missions: {
          ...progress.missions,
          [mission.id]: { completed: nextCompleted, currentStep: stepIndex },
        },
      });
    }
  }, [mission, stepIndex, liveComplete, progress.missions]);

  // Assessment offers (spec 7.5): before mission 1 and after six mission
  // completions, always dismissible, never blocking.
  const postOfferAvailable =
    openAssessment === null &&
    !postOfferDismissed &&
    completedCount >= 6 &&
    !progress.assessments.some((a) => a.kind === 'post') &&
    !progress.assessmentDeclined;

  // Pulse the control the current step points at (spec W6.6).
  const target =
    mission && !completed && stepIndex < mission.steps.length
      ? mission.steps[stepIndex]!.target
      : null;
  useEffect(() => {
    if (!target) return;
    const el = document.querySelector(`[data-mission-target="${target}"]`);
    if (!el) return;
    el.classList.add('mission-highlight');
    return () => el.classList.remove('mission-highlight');
  }, [target]);

  const startMission = (m: Mission): void => {
    const s = useAppStore.getState();
    if (
      m.id === 'bell-pair' &&
      !s.progress.assessments.some((a) => a.kind === 'pre') &&
      !s.progress.assessmentDeclined
    ) {
      setOpenAssessment('pre');
    }
    s.setActiveMission(m.id);
    if (m.usesBuilder) {
      // Builder missions start with an empty grid: placing the blocks (or
      // pressing the template button) is the learner's own first step.
      const { qasm: _qasm, sampleId: _sampleId, ...rest } = m.config;
      s.updateConfig(rest);
    } else {
      s.updateConfig(m.config);
    }
  };

  const declineAssessments = (): void => {
    setOpenAssessment(null);
    setPostOfferDismissed(true);
    useAppStore.getState().updateProgress({ assessmentDeclined: true });
  };

  const contextualButton = (control: string): ReactElement | null => {
    const s = useAppStore.getState();
    switch (control) {
      case 'pause':
        return (
          <button
            key="pause"
            type="button"
            disabled={!trace}
            onClick={() => (playbackPlaying ? s.pause() : s.play())}
          >
            {playbackPlaying ? 'Pause' : 'Play'}
          </button>
        );
      case 'step':
        return (
          <button key="step" type="button" disabled={!trace} onClick={() => s.stepForward()}>
            Step
          </button>
        );
      case 'rewind':
        return (
          <button key="rewind" type="button" disabled={!trace} onClick={() => s.setTick(0)}>
            Rewind
          </button>
        );
      case 'undo':
        return mission?.usesBuilder ? (
          <button key="undo" type="button" disabled={!builder.canUndo} onClick={builder.undo}>
            Undo
          </button>
        ) : null;
      case 'reset':
        return (
          <button
            key="reset"
            type="button"
            onClick={() => {
              if (mission?.usesBuilder) builder.reset();
              if (mission) s.updateConfig(mission.config);
              s.setTick(0);
            }}
          >
            Reset mission
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="mission-panel" aria-label="Missions">
      <header className="mission-panel-header">
        <h2>Missions</h2>
        {mission && (
          <button type="button" onClick={() => useAppStore.getState().setActiveMission(null)}>
            All missions
          </button>
        )}
      </header>

      {openAssessment && (
        <>
          <Assessment
            kind={openAssessment}
            onDismiss={() => {
              if (openAssessment === 'post') setPostOfferDismissed(true);
              setOpenAssessment(null);
            }}
          />
          <button type="button" className="link-button" onClick={declineAssessments}>
            Skip quizzes for now
          </button>
        </>
      )}

      {postOfferAvailable && (
        <div className="assessment-offer" role="status">
          <p>Six missions complete! Want to retake the picture quiz and see your growth?</p>
          <div className="assessment-actions">
            <button type="button" className="primary" onClick={() => setOpenAssessment('post')}>
              Take the quiz
            </button>
            <button type="button" onClick={() => setPostOfferDismissed(true)}>
              Maybe later
            </button>
          </div>
        </div>
      )}

      {!mission && <MissionList onStart={startMission} />}

      {mission && (
        <section className="mission-active" aria-label={`Mission: ${mission.title}`}>
          <h3>{mission.title}</h3>
          <p className="mission-briefing">{mission.briefing[level]}</p>

          <ol className="mission-steps" aria-label="Mission steps">
            {mission.steps.map((stepDef, i) => {
              const done = completed || i < stepIndex;
              const current = !completed && i === stepIndex;
              return (
                <li
                  key={stepDef.id}
                  className={done ? 'done' : current ? 'current' : 'pending'}
                  aria-current={current ? 'step' : undefined}
                >
                  <span className="mission-step-mark" aria-hidden="true">
                    {done ? '✓' : i + 1}
                  </span>
                  {done && <span className="visually-hidden">Done: </span>}
                  {stepDef.text[level]}
                </li>
              );
            })}
          </ol>

          <div className="mission-controls" role="group" aria-label="Mission controls">
            {mission.contextualControls.map((c) => contextualButton(c))}
          </div>

          {mission.usesBuilder ? (
            <CircuitBuilder builder={builder} />
          ) : (
            <>
              <details className="mission-config" open>
                <summary>Run configuration</summary>
                <LabControls />
              </details>
              <button
                type="button"
                className="primary mission-run"
                data-mission-target="mission-run"
                disabled={running}
                onClick={() => void useAppStore.getState().run()}
              >
                {running ? 'Running…' : 'Run'}
              </button>
            </>
          )}

          {trace && (
            <div data-mission-target="timeline-play" className="mission-timeline">
              <TimelineBar />
              <EventLog trace={trace} />
            </div>
          )}

          {trace && (
            <div data-mission-target="results" className="mission-results">
              <ResultsSection trace={trace} compare={Boolean(trace.results.noisyCounts)} />
            </div>
          )}

          {completed && (
            <div className="mission-celebration" role="status">
              <span className="mission-celebration-mark" aria-hidden="true">
                ★
              </span>
              <p>{mission.celebration[level]}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
