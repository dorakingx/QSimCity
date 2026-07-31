import { describe, expect, it } from 'vitest';
import { DISTRICTS } from '@qsimcity/world';
import { EVENT_TYPES, type TraceEvent } from 'qsimcity-trace';
import { TOUR_CHAPTERS } from '../src/tour/chapters.js';
import { describeEvent } from '../src/components/EventLog.js';
import { ACTIVE_SIMPLIFICATIONS } from '../src/components/ProvenancePanel.js';
import { CERTAINTY_DESCRIPTIONS, SOURCE_DESCRIPTIONS } from '../src/components/CertaintyBadge.js';
import { KEYBOARD_MAP } from '../src/components/HelpOverlay.js';
import {
  layoutColumns,
  formatAngle,
  instructionDescription,
} from '../src/components/CircuitDiagram.js';

describe('guided tour chapters (spec §7.2)', () => {
  it('has at least 16 chapters', () => {
    expect(TOUR_CHAPTERS.length).toBeGreaterThanOrEqual(16);
  });

  it('every chapter carries the full epistemic structure', () => {
    for (const c of TOUR_CHAPTERS) {
      expect(c.see.length, c.id).toBeGreaterThan(40);
      expect(c.represents.length, c.id).toBeGreaterThan(40);
      expect(c.exactness.length, c.id).toBeGreaterThan(40);
      expect(c.why.length, c.id).toBeGreaterThan(40);
      expect(
        DISTRICTS.some((d) => d.id === c.districtId),
        c.id,
      ).toBe(true);
    }
  });

  it('chapter exactness statements reference certainty vocabulary', () => {
    const vocab = [
      'EXACT',
      'COMPUTED',
      'SAMPLED',
      'ESTIMATED',
      'ILLUSTRATIVE',
      'MEASURED',
      'CALIBRATION',
    ];
    for (const c of TOUR_CHAPTERS) {
      expect(
        vocab.some((v) => c.exactness.includes(v)),
        `${c.id} exactness must use certainty vocabulary`,
      ).toBe(true);
    }
  });

  it('the pipeline story visits key districts in order', () => {
    const ids = TOUR_CHAPTERS.map((c) => c.districtId);
    expect(ids[0]).toBe('program-port');
    expect(ids).toContain('qpu-grid');
    expect(ids).toContain('noise-atmosphere');
    expect(ids).toContain('measurement-harbor');
    expect(ids.at(-1)).toBe('observatory');
  });

  it('chapter titles cover the 16 required topics', () => {
    const titles = TOUR_CHAPTERS.map((c) => c.title.toLowerCase()).join(' | ');
    for (const topic of [
      'port',
      'logical qubits',
      'normalization',
      'initial layout',
      'topology',
      'routing',
      'swap',
      'basis translation',
      'optimization',
      'scheduling',
      'execution',
      'noise',
      'measurement',
      'shot statistics',
      'classical feedback',
      'result comparison',
    ]) {
      expect(titles, topic).toContain(topic);
    }
  });
});

describe('describeEvent narration', () => {
  const base: Omit<TraceEvent, 'eventType'> = {
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

  it('produces English narration for every event type', () => {
    for (const eventType of EVENT_TYPES) {
      const text = describeEvent({ ...base, eventType });
      expect(text.length, eventType).toBeGreaterThan(10);
      expect(text, eventType).toMatch(/^[A-Z]/);
    }
  });

  it('narrates condition outcomes distinctly', () => {
    const fired = describeEvent({ ...base, eventType: 'classical.condition_evaluated' });
    expect(fired).toContain('fired');
    const skipped = describeEvent({
      ...base,
      eventType: 'classical.condition_evaluated',
      payload: { ...base.payload, satisfied: false },
    });
    expect(skipped).toContain('skipped');
  });
});

describe('provenance vocabulary', () => {
  it('describes all 7 certainty labels and 9 source classifications', () => {
    expect(Object.keys(CERTAINTY_DESCRIPTIONS)).toHaveLength(7);
    expect(Object.keys(SOURCE_DESCRIPTIONS)).toHaveLength(9);
    for (const text of [
      ...Object.values(CERTAINTY_DESCRIPTIONS),
      ...Object.values(SOURCE_DESCRIPTIONS),
    ]) {
      expect(text.length).toBeGreaterThan(15);
    }
  });

  it('active simplifications cover the required honesty topics', () => {
    const all = ACTIVE_SIMPLIFICATIONS.map((s) => s.text).join(' ');
    expect(all).toContain('representative');
    expect(all).toContain('trajectory');
    expect(all).toContain('not fidelity');
    expect(all).toContain('never quantum amplitudes');
    expect(ACTIVE_SIMPLIFICATIONS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('keyboard map', () => {
  it('documents the core shortcuts', () => {
    const all = KEYBOARD_MAP.map((k) => `${k.keys} ${k.action}`).join(' | ');
    expect(all).toContain('command palette');
    expect(all).toContain('Play or pause');
    expect(all).toContain('first-person');
    expect(KEYBOARD_MAP.length).toBeGreaterThanOrEqual(10);
  });
});

describe('circuit diagram helpers', () => {
  it('layoutColumns packs independent gates into one column', () => {
    const circuit = {
      name: 't',
      numQubits: 2,
      numClbits: 0,
      cregs: [],
      instructions: [
        {
          id: 'a',
          kind: 'gate' as const,
          name: 'h',
          qubits: [0],
          params: [],
          clbits: [],
          condition: null,
        },
        {
          id: 'b',
          kind: 'gate' as const,
          name: 'h',
          qubits: [1],
          params: [],
          clbits: [],
          condition: null,
        },
        {
          id: 'c',
          kind: 'gate' as const,
          name: 'cx',
          qubits: [0, 1],
          params: [],
          clbits: [],
          condition: null,
        },
      ],
    };
    const placed = layoutColumns(circuit);
    expect(placed[0]!.column).toBe(0);
    expect(placed[1]!.column).toBe(0);
    expect(placed[2]!.column).toBe(1);
  });

  it('formatAngle renders common multiples of pi symbolically', () => {
    expect(formatAngle(Math.PI)).toBe('pi');
    expect(formatAngle(Math.PI / 2)).toBe('pi/2');
    expect(formatAngle(-Math.PI / 4)).toBe('-pi/4');
    expect(formatAngle(0.123)).toBe('0.12');
  });

  it('instructionDescription covers gates, measures, resets, conditions', () => {
    expect(
      instructionDescription({
        id: 'i',
        kind: 'gate',
        name: 'rx',
        qubits: [0],
        params: [Math.PI],
        clbits: [],
        condition: null,
      }),
    ).toBe('Gate rx (pi) on q0');
    expect(
      instructionDescription({
        id: 'i',
        kind: 'measure',
        name: 'measure',
        qubits: [1],
        params: [],
        clbits: [3],
        condition: null,
      }),
    ).toContain('Measure q1 into classical bit 3');
    expect(
      instructionDescription({
        id: 'i',
        kind: 'reset',
        name: 'reset',
        qubits: [0],
        params: [],
        clbits: [],
        condition: null,
      }),
    ).toContain('Reset q0');
    expect(
      instructionDescription({
        id: 'i',
        kind: 'gate',
        name: 'x',
        qubits: [0],
        params: [],
        clbits: [],
        condition: { creg: 'm', value: 1 },
      }),
    ).toContain('if m == 1');
  });
});
