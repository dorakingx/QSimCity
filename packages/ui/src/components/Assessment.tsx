import { useState, type ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';
import { ASSESSMENT_QUESTIONS } from '../content/assessment.js';
import type { AssessmentRecord } from '../store/progress.js';

/**
 * Optional pre/post assessment (spec section 7.5): five picture-based
 * multiple-choice questions. Never blocking ("maybe later" is always
 * available), results are growth-framed and stored only locally, and the
 * learner can export them as JSON or clear them with all local data.
 */

export function assessmentGrowthText(records: readonly AssessmentRecord[]): string {
  const pre = records.find((r) => r.kind === 'pre');
  const post = records.find((r) => r.kind === 'post');
  if (pre && post) {
    if (post.correctCount > pre.correctCount) {
      return `You explored ${pre.correctCount} of ${pre.total} ideas before your missions and ${post.correctCount} of ${post.total} after — your city knowledge grew!`;
    }
    return `You explored ${post.correctCount} of ${post.total} ideas this time. Every mission you replay grows the map a little more.`;
  }
  if (pre) {
    return `You explored ${pre.correctCount} of ${pre.total} ideas before starting. The missions ahead will grow the rest.`;
  }
  if (post) {
    return `You explored ${post.correctCount} of ${post.total} ideas after your missions — well travelled!`;
  }
  return 'No assessment answers yet.';
}

export function Assessment({
  kind,
  onFinished,
  onDismiss,
}: {
  kind: 'pre' | 'post';
  onFinished?: () => void;
  onDismiss?: () => void;
}): ReactElement {
  const progress = useAppStore((s) => s.progress);
  const { updateProgress } = useAppStore.getState();
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const questionIndex = answers.length;
  const question = ASSESSMENT_QUESTIONS[questionIndex];

  const choose = (optionIndex: number): void => {
    const nextAnswers = [...answers, optionIndex];
    setAnswers(nextAnswers);
    if (nextAnswers.length === ASSESSMENT_QUESTIONS.length) {
      const correctCount = nextAnswers.filter(
        (a, i) => a === ASSESSMENT_QUESTIONS[i]!.correctIndex,
      ).length;
      const record: AssessmentRecord = {
        kind,
        answers: nextAnswers,
        correctCount,
        total: ASSESSMENT_QUESTIONS.length,
        completedAt: new Date().toISOString(),
      };
      updateProgress({
        assessments: [...progress.assessments.filter((r) => r.kind !== kind), record],
      });
      setFinished(true);
      onFinished?.();
    }
  };

  const exportResults = (): void => {
    const { progress: latest } = useAppStore.getState();
    const blob = new Blob([JSON.stringify(latest.assessments, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qsimcity-assessment.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (finished) {
    const latest = useAppStore.getState().progress.assessments;
    return (
      <section className="assessment" aria-label="Assessment results">
        <h3>{kind === 'pre' ? 'Ready to explore!' : 'Look how far you travelled!'}</h3>
        <p role="status">{assessmentGrowthText(latest)}</p>
        <p className="hint">
          These answers live only in this browser. They are a picture of your journey, never a
          grade.
        </p>
        <div className="assessment-actions">
          <button type="button" onClick={exportResults}>
            Export results (JSON)
          </button>
          <button type="button" className="primary" onClick={() => onDismiss?.()}>
            Continue
          </button>
        </div>
      </section>
    );
  }

  if (!question) {
    return (
      <section className="assessment" aria-label="Assessment">
        <p role="status">{assessmentGrowthText(progress.assessments)}</p>
      </section>
    );
  }

  return (
    <section className="assessment" aria-label="Picture quiz">
      <header className="assessment-header">
        <h3>
          {kind === 'pre' ? 'A quick picture quiz before you start' : 'One more picture quiz'}
        </h3>
        <p className="hint">
          Question {questionIndex + 1} of {ASSESSMENT_QUESTIONS.length}. There are no grades here —
          this only shows you your own growth.
        </p>
      </header>
      <figure className="assessment-figure">
        <svg
          viewBox="0 0 120 60"
          role="img"
          aria-label={`Illustration for the ${question.concept} question`}
          dangerouslySetInnerHTML={{ __html: question.svg }}
        />
      </figure>
      <p className="assessment-prompt">{question.prompt}</p>
      <div className="assessment-options" role="group" aria-label="Answer choices">
        {question.options.map((option, i) => (
          <button
            key={option}
            type="button"
            className="assessment-option"
            onClick={() => choose(i)}
          >
            {option}
          </button>
        ))}
      </div>
      <button type="button" className="link-button" onClick={() => onDismiss?.()}>
        Maybe later
      </button>
    </section>
  );
}
