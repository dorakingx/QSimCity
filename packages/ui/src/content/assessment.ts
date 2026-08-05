/**
 * Assessment question content (spec section 7.5): five picture-based
 * multiple-choice questions drawn from the mission concepts. Results are
 * framed as growth, stored only locally, exportable and clearable by the
 * learner — never a grade.
 */

export interface AssessmentQuestion {
  readonly id: string;
  readonly concept: string;
  readonly prompt: string;
  /** Simple procedural SVG body (rendered inside a fixed-size viewBox). */
  readonly svg: string;
  readonly options: readonly [string, string, string];
  readonly correctIndex: 0 | 1 | 2;
}

export const ASSESSMENT_QUESTIONS: readonly AssessmentQuestion[] = [
  {
    id: 'entangled-pair',
    concept: 'Entanglement',
    prompt: 'These two qubits were linked into a pair. We measure both. What do we see most often?',
    svg: '<circle cx="30" cy="30" r="14" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="90" cy="30" r="14" fill="none" stroke="currentColor" stroke-width="3"/><path d="M44 30 Q60 14 76 30" fill="none" stroke="currentColor" stroke-width="3"/><path d="M44 30 Q60 46 76 30" fill="none" stroke="currentColor" stroke-width="3"/>',
    options: [
      'The two answers always disagree',
      'The two answers match: both 0 or both 1',
      'Each answer is a random letter',
    ],
    correctIndex: 1,
  },
  {
    id: 'noise-results',
    concept: 'Noise',
    prompt: 'A storm of noise hits the machine while it runs. What happens to the results?',
    svg: '<path d="M30 26 q0-12 14-12 q4-8 14-6 q10-4 16 4 q12 0 12 12 q0 10-12 10 h-32 q-12 0-12-8z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M42 40 l-6 12 M58 40 l-6 12 M74 40 l-6 12" stroke="currentColor" stroke-width="3"/>',
    options: [
      'Nothing changes at all',
      'The computer runs faster',
      'Results get messier and unexpected bars appear',
    ],
    correctIndex: 2,
  },
  {
    id: 'more-shots',
    concept: 'Statistics',
    prompt: 'We repeat the run with many more shots. What happens to the bar chart?',
    svg: '<rect x="16" y="30" width="10" height="22" fill="currentColor"/><rect x="30" y="18" width="10" height="34" fill="currentColor"/><rect x="44" y="36" width="10" height="16" fill="currentColor"/><path d="M64 30 l16 0 m-8-8 l8 8 l-8 8" fill="none" stroke="currentColor" stroke-width="3"/><rect x="88" y="24" width="10" height="28" fill="currentColor"/><rect x="102" y="24" width="10" height="28" fill="currentColor"/>',
    options: [
      'It settles down and gets steadier',
      'It jumps around even more',
      'All the bars disappear',
    ],
    correctIndex: 0,
  },
  {
    id: 'swap-homes',
    concept: 'Routing',
    prompt: 'A SWAP move just happened on the chip. What changed?',
    svg: '<path d="M20 44 v-14 l10-9 l10 9 v14 z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M80 44 v-14 l10-9 l10 9 v14 z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M46 26 h26 m-6-6 l6 6 l-6 6 M72 40 h-26 m6 6 l-6-6 l6-6" fill="none" stroke="currentColor" stroke-width="3"/>',
    options: [
      'One qubit was deleted forever',
      'The whole program restarted',
      'Two qubits traded homes on the chip',
    ],
    correctIndex: 2,
  },
  {
    id: 'measurement-bit',
    concept: 'Measurement',
    prompt: 'We measure a qubit at the end of the run. What comes out?',
    svg: '<circle cx="30" cy="30" r="14" fill="none" stroke="currentColor" stroke-width="3"/><path d="M48 30 h20 m-6-6 l6 6 l-6 6" fill="none" stroke="currentColor" stroke-width="3"/><rect x="76" y="16" width="28" height="28" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><text x="90" y="40" text-anchor="middle" font-size="20" fill="currentColor">1</text>',
    options: ['A classical bit: 0 or 1', 'A photograph of the qubit', 'A brand-new extra qubit'],
    correctIndex: 0,
  },
];
