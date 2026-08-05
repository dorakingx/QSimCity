// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Assessment, assessmentGrowthText } from '../src/components/Assessment.js';
import { ASSESSMENT_QUESTIONS } from '../src/content/assessment.js';
import { useAppStore, DEFAULT_CONFIG, DEFAULT_SETTINGS } from '../src/store/appStore.js';
import { DEFAULT_PROGRESS, loadProgress, PROGRESS_KEY } from '../src/store/progress.js';

/**
 * Assessment tests (acceptance W6.8): five picture-based multiple-choice
 * questions, always dismissible, growth-framed results stored only locally,
 * exportable as JSON, and cleared with local data.
 */

function resetStore(): void {
  try {
    globalThis.localStorage?.clear();
  } catch {
    // In-memory reset below suffices.
  }
  useAppStore.setState({
    mode: 'learn',
    config: { ...DEFAULT_CONFIG },
    trace: null,
    activeMissionId: null,
    progress: { ...DEFAULT_PROGRESS },
    settings: { ...DEFAULT_SETTINGS },
    toast: null,
  });
}

beforeEach(() => {
  cleanup();
  resetStore();
});

describe('question content', () => {
  it('has exactly five picture questions with three options each', () => {
    expect(ASSESSMENT_QUESTIONS).toHaveLength(5);
    for (const q of ASSESSMENT_QUESTIONS) {
      expect(q.options).toHaveLength(3);
      expect(q.svg.length).toBeGreaterThan(20);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThanOrEqual(2);
    }
    const concepts = ASSESSMENT_QUESTIONS.map((q) => q.concept.toLowerCase()).join(' ');
    for (const concept of ['entanglement', 'noise', 'statistics', 'routing', 'measurement']) {
      expect(concepts).toContain(concept);
    }
  });
});

describe('Assessment flow', () => {
  it('walks through all five questions with illustrations and stores a local record', async () => {
    render(<Assessment kind="pre" />);
    for (const q of ASSESSMENT_QUESTIONS) {
      expect(screen.getByRole('img', { name: new RegExp(q.concept) })).toBeTruthy();
      expect(screen.getByText(q.prompt)).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: q.options[q.correctIndex] }));
    }
    const record = useAppStore.getState().progress.assessments.find((a) => a.kind === 'pre');
    expect(record).toBeDefined();
    expect(record!.correctCount).toBe(5);
    expect(record!.total).toBe(5);
    expect(loadProgress().assessments).toHaveLength(1);
  });

  it('frames results as growth, never as a grade', async () => {
    render(<Assessment kind="pre" />);
    for (const q of ASSESSMENT_QUESTIONS) {
      await userEvent.click(screen.getByRole('button', { name: q.options[q.correctIndex] }));
    }
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('explored');
    expect(status.textContent!.toLowerCase()).not.toContain('score');
    expect(status.textContent!.toLowerCase()).not.toContain('fail');
    expect(screen.getByText(/never a\s+grade/)).toBeTruthy();
  });

  it('always offers "maybe later" and dismisses without storing anything', async () => {
    const onDismiss = vi.fn();
    render(<Assessment kind="pre" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(useAppStore.getState().progress.assessments).toHaveLength(0);
    expect(globalThis.localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });

  it('exports the locally stored results as a JSON download', async () => {
    const createObjectURL = vi.fn(() => 'blob:qsimcity-test');
    const revokeObjectURL = vi.fn();
    const urlStatics = URL as unknown as {
      createObjectURL: ((blob: Blob) => string) | undefined;
      revokeObjectURL: ((url: string) => void) | undefined;
    };
    const originalCreate = urlStatics.createObjectURL;
    const originalRevoke = urlStatics.revokeObjectURL;
    urlStatics.createObjectURL = createObjectURL;
    urlStatics.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    try {
      render(<Assessment kind="pre" />);
      for (const q of ASSESSMENT_QUESTIONS) {
        await userEvent.click(screen.getByRole('button', { name: q.options[q.correctIndex] }));
      }
      await userEvent.click(screen.getByRole('button', { name: 'Export results (JSON)' }));
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:qsimcity-test');
    } finally {
      urlStatics.createObjectURL = originalCreate;
      urlStatics.revokeObjectURL = originalRevoke;
      clickSpy.mockRestore();
    }
  });

  it('shows growth between pre and post results', () => {
    const growth = assessmentGrowthText([
      { kind: 'pre', answers: [0, 0, 0, 0, 0], correctCount: 2, total: 5, completedAt: 'a' },
      { kind: 'post', answers: [1, 2, 0, 2, 0], correctCount: 5, total: 5, completedAt: 'b' },
    ]);
    expect(growth).toContain('2 of 5');
    expect(growth).toContain('5 of 5');
    expect(growth).toContain('grew');
  });

  it('is wiped by clearLocalData', async () => {
    render(<Assessment kind="pre" />);
    for (const q of ASSESSMENT_QUESTIONS) {
      await userEvent.click(screen.getByRole('button', { name: q.options[q.correctIndex] }));
    }
    expect(useAppStore.getState().progress.assessments).toHaveLength(1);
    useAppStore.getState().clearLocalData();
    expect(useAppStore.getState().progress.assessments).toHaveLength(0);
    expect(globalThis.localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });
});
