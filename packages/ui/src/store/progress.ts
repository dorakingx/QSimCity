/**
 * Local learning progress (spec sections 7.1, 7.3, 7.5): onboarding state,
 * per-mission completion, the shot history that mission 7 tracks, and
 * assessment results. Stored only in localStorage, exportable and clearable
 * by the user, never transmitted anywhere.
 */

export const PROGRESS_KEY = 'qsimcity.progress.v1';

export interface MissionProgressEntry {
  readonly completed: boolean;
  readonly currentStep: number;
}

export interface AssessmentRecord {
  readonly kind: 'pre' | 'post';
  /** Chosen option index per question, in question order. */
  readonly answers: readonly number[];
  readonly correctCount: number;
  readonly total: number;
  readonly completedAt: string;
}

export interface LearningProgress {
  readonly onboardingSeen: boolean;
  readonly missions: Readonly<Record<string, MissionProgressEntry>>;
  /** Shot count of each completed run, newest last (mission 7 evidence). */
  readonly shotsHistory: readonly number[];
  readonly assessments: readonly AssessmentRecord[];
  /** The learner chose "maybe later" for the current assessment offer. */
  readonly assessmentDeclined: boolean;
}

export const DEFAULT_PROGRESS: LearningProgress = {
  onboardingSeen: false,
  missions: {},
  shotsHistory: [],
  assessments: [],
  assessmentDeclined: false,
};

function sanitizeMissionEntry(value: unknown): MissionProgressEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  return {
    completed: v['completed'] === true,
    currentStep:
      typeof v['currentStep'] === 'number' && Number.isInteger(v['currentStep'])
        ? Math.max(0, v['currentStep'])
        : 0,
  };
}

function sanitizeAssessment(value: unknown): AssessmentRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v['kind'] !== 'pre' && v['kind'] !== 'post') return null;
  if (!Array.isArray(v['answers'])) return null;
  return {
    kind: v['kind'],
    answers: v['answers'].filter((a): a is number => typeof a === 'number'),
    correctCount: typeof v['correctCount'] === 'number' ? v['correctCount'] : 0,
    total: typeof v['total'] === 'number' ? v['total'] : 0,
    completedAt: typeof v['completedAt'] === 'string' ? v['completedAt'] : '',
  };
}

export function loadProgress(): LearningProgress {
  try {
    const raw = globalThis.localStorage?.getItem(PROGRESS_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const missions: Record<string, MissionProgressEntry> = {};
    if (typeof parsed['missions'] === 'object' && parsed['missions'] !== null) {
      for (const [id, entry] of Object.entries(parsed['missions'] as Record<string, unknown>)) {
        const clean = sanitizeMissionEntry(entry);
        if (clean) missions[id] = clean;
      }
    }
    return {
      onboardingSeen: parsed['onboardingSeen'] === true,
      missions,
      shotsHistory: Array.isArray(parsed['shotsHistory'])
        ? parsed['shotsHistory'].filter((s): s is number => typeof s === 'number')
        : [],
      assessments: Array.isArray(parsed['assessments'])
        ? parsed['assessments']
            .map(sanitizeAssessment)
            .filter((a): a is AssessmentRecord => a !== null)
        : [],
      assessmentDeclined: parsed['assessmentDeclined'] === true,
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function persistProgress(progress: LearningProgress): void {
  try {
    globalThis.localStorage?.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage may be unavailable (private browsing); progress stays in memory.
  }
}

export function clearProgressStorage(): void {
  try {
    globalThis.localStorage?.removeItem(PROGRESS_KEY);
  } catch {
    // Ignore storage failures; in-memory state is reset by the caller.
  }
}
