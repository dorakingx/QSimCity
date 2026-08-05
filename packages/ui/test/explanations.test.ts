import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, type TraceEvent } from 'qsimcity-trace';
import {
  CERTAINTY_GLOSSARY,
  EVENT_EXPLANATIONS,
  EXPLANATION_LEVELS,
  MISSION_TEXT,
  SOURCE_GLOSSARY,
  TOUR_CHAPTER_EXPLANATIONS,
  explainEvent,
  type ExplanationLevel,
} from '../src/content/explanations.js';
import { TOUR_CHAPTERS } from '../src/tour/chapters.js';
import { MISSIONS } from '../src/missions/missions.js';
import { describeEvent } from '../src/components/EventLog.js';

/**
 * Completeness matrix for the explanation levels (spec section 7.4 /
 * acceptance W6.7): every narrated surface provides child, beginner, and
 * expert prose; child text is short, concrete, and jargon-free.
 */

const SAMPLE_EVENT: Omit<TraceEvent, 'eventType'> = {
  eventId: 'e0',
  logicalTick: 1,
  stage: 'execution',
  logicalQubits: [0, 1],
  physicalQubits: [],
  instructionId: 'i0',
  source: 'exact_simulation',
  certainty: 'EXACT',
  payload: {
    numQubits: 2,
    instructions: 3,
    gate: 'cx',
    expandedInto: 6,
    outcome: 1,
    clbit: 0,
    layout: [0, 1],
    method: 'interaction',
    path: [0, 1, 2],
    physicalQubits: [1, 2],
    basisGates: ['rz', 'sx'],
    cancelledCount: 2,
    instructionCount: 5,
    startNs: 35,
    durationNs: 300,
    shots: 100,
    kind: 'amplitude_damping',
    creg: 'm',
    expected: 1,
    actual: 1,
    satisfied: true,
    iteration: 3,
    energy: -1.1,
  },
  provenance: { generator: 'test', generatorVersion: '1' },
};

const JARGON_FORBIDDEN_AT_CHILD_LEVEL = [
  'unitary',
  'amplitude',
  'decoherence',
  'transpiler',
  'eigenvalue',
  'hamiltonian',
];

function averageSentenceLength(text: string): number {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return 0;
  const words = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
  return words / sentences.length;
}

/** Every child-level string in the module, with a label for messages. */
function allChildTexts(): { label: string; text: string }[] {
  const texts: { label: string; text: string }[] = [];
  for (const eventType of EVENT_TYPES) {
    texts.push({
      label: `event ${eventType}`,
      text: explainEvent({ ...SAMPLE_EVENT, eventType }, 'child'),
    });
  }
  for (const [id, entry] of Object.entries(TOUR_CHAPTER_EXPLANATIONS)) {
    texts.push({ label: `chapter ${id}`, text: entry.child });
  }
  for (const [label, entry] of Object.entries(CERTAINTY_GLOSSARY)) {
    texts.push({ label: `certainty ${label}`, text: entry.child });
  }
  for (const [source, entry] of Object.entries(SOURCE_GLOSSARY)) {
    texts.push({ label: `source ${source}`, text: entry.child });
  }
  for (const [missionId, entry] of Object.entries(MISSION_TEXT)) {
    texts.push({ label: `mission ${missionId} briefing`, text: entry.briefing.child });
    texts.push({ label: `mission ${missionId} celebration`, text: entry.celebration.child });
    for (const [stepId, stepText] of Object.entries(entry.steps)) {
      texts.push({ label: `mission ${missionId} step ${stepId}`, text: stepText.child });
    }
  }
  return texts;
}

function expectDistinctLevels(label: string, byLevel: Record<ExplanationLevel, string>): void {
  for (const level of EXPLANATION_LEVELS) {
    expect(byLevel[level].length, `${label} at ${level} must not be empty`).toBeGreaterThan(0);
  }
  expect(byLevel.child, `${label}: child must differ from beginner`).not.toBe(byLevel.beginner);
  expect(byLevel.child, `${label}: child must differ from expert`).not.toBe(byLevel.expert);
  expect(byLevel.beginner, `${label}: beginner must differ from expert`).not.toBe(byLevel.expert);
}

describe('event narration completeness matrix', () => {
  it('covers every trace event type used by describeEvent', () => {
    expect(Object.keys(EVENT_EXPLANATIONS).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it('every event type has non-empty, distinct prose at every level', () => {
    for (const eventType of EVENT_TYPES) {
      const ev: TraceEvent = { ...SAMPLE_EVENT, eventType };
      expectDistinctLevels(eventType, {
        child: explainEvent(ev, 'child'),
        beginner: explainEvent(ev, 'beginner'),
        expert: explainEvent(ev, 'expert'),
      });
    }
  });

  it('describeEvent defaults to the beginner level and accepts a level', () => {
    const ev: TraceEvent = { ...SAMPLE_EVENT, eventType: 'gate.executed' };
    expect(describeEvent(ev)).toBe(explainEvent(ev, 'beginner'));
    expect(describeEvent(ev, 'child')).toBe(explainEvent(ev, 'child'));
    expect(describeEvent(ev, 'expert')).toBe(explainEvent(ev, 'expert'));
  });
});

describe('tour chapter explanations', () => {
  it('covers all 16 tour chapters at all three levels', () => {
    expect(TOUR_CHAPTERS.length).toBeGreaterThanOrEqual(16);
    for (const chapter of TOUR_CHAPTERS) {
      const entry = TOUR_CHAPTER_EXPLANATIONS[chapter.id];
      expect(entry, `chapter ${chapter.id} must have leveled text`).toBeDefined();
      expectDistinctLevels(`chapter ${chapter.id}`, entry!);
    }
  });
});

describe('certainty and source glossary', () => {
  it('explains all 7 certainty labels at all levels', () => {
    expect(Object.keys(CERTAINTY_GLOSSARY)).toHaveLength(7);
    for (const [label, entry] of Object.entries(CERTAINTY_GLOSSARY)) {
      expectDistinctLevels(`certainty ${label}`, entry);
    }
  });

  it('explains all 9 source classifications at all levels', () => {
    expect(Object.keys(SOURCE_GLOSSARY)).toHaveLength(9);
    for (const [source, entry] of Object.entries(SOURCE_GLOSSARY)) {
      expectDistinctLevels(`source ${source}`, entry);
    }
  });

  it('child level explains labels in plain words without removing them', () => {
    expect(CERTAINTY_GLOSSARY.MEASURED.child.toLowerCase()).toContain('for real');
    expect(CERTAINTY_GLOSSARY.EXACT.child.toLowerCase()).toContain('exactly');
    expect(CERTAINTY_GLOSSARY.SAMPLED.child.toLowerCase()).toContain('dice');
    expect(CERTAINTY_GLOSSARY.ILLUSTRATIVE.child.toLowerCase()).toContain('picture');
  });
});

describe('mission text', () => {
  it('covers every mission with briefing, celebration, and every step at all levels', () => {
    for (const mission of MISSIONS) {
      const entry = MISSION_TEXT[mission.id];
      expect(entry, `mission ${mission.id} must have text`).toBeDefined();
      expectDistinctLevels(`mission ${mission.id} briefing`, entry!.briefing);
      expectDistinctLevels(`mission ${mission.id} celebration`, entry!.celebration);
      for (const stepDef of mission.steps) {
        const stepText = entry!.steps[stepDef.id];
        expect(stepText, `mission ${mission.id} step ${stepDef.id}`).toBeDefined();
        expectDistinctLevels(`mission ${mission.id} step ${stepDef.id}`, stepText!);
      }
    }
  });
});

describe('child-level heuristics', () => {
  it('keeps average sentence length under 12 words everywhere', () => {
    for (const { label, text } of allChildTexts()) {
      expect(
        averageSentenceLength(text),
        `${label} child text averages too many words per sentence: "${text}"`,
      ).toBeLessThan(12);
    }
  });

  it('never uses forbidden jargon at the child level', () => {
    for (const { label, text } of allChildTexts()) {
      const lower = text.toLowerCase();
      for (const word of JARGON_FORBIDDEN_AT_CHILD_LEVEL) {
        expect(lower, `${label} child text must not contain "${word}"`).not.toContain(word);
      }
    }
  });
});
