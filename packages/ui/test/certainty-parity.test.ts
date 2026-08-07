import { describe, expect, it } from 'vitest';
import { logicalToPhysicalAt } from '@qsimcity/world';
import { runPipeline } from '../src/pipeline/runPipeline.js';
import { LEGEND_ENTRIES } from '../src/content/legend.js';

/**
 * The City Legend states a certainty for each animated class, and the
 * Inspector and Event Log render the certainty carried on the events
 * themselves. Those two must agree, and only a test that reads the events
 * the *production pipeline* emits can prove it: an earlier version decided
 * gate certainty by string-comparing the phase label against `'ideal'`,
 * which the web pipeline never passes (it passes `'physical-ideal'`), so
 * every QPU light was labelled SAMPLED while the Legend promised EXACT for
 * an ideal replay. The legend test alone could not see it, because it only
 * inspected the legend constant.
 */

const BASE = {
  qasm: 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0],q[1];\nmeasure q -> c;\n',
  shots: 32,
  seed: 'certainty-parity',
  deviceId: 'linear-5',
  layoutMethod: 'trivial' as const,
  optimize: true,
};

function gateCertainties(events: readonly { eventType: string; certainty: string }[]): Set<string> {
  return new Set(
    events.filter((e) => e.eventType === 'gate.executed').map((e) => String(e.certainty)),
  );
}

describe('emitted certainty matches the City Legend', () => {
  const qpuLights = LEGEND_ENTRIES.find((e) => e.id === 'qpu-lights');

  it('labels an ideal replay EXACT, exactly as the legend promises', async () => {
    const { trace } = await runPipeline({ ...BASE, noise: null });
    const certainties = gateCertainties(trace.events);
    expect(certainties.size).toBeGreaterThan(0);
    expect([...certainties]).toEqual([qpuLights?.certainty ?? 'EXACT']);
    expect(qpuLights?.certainty).toBe('EXACT');
  });

  it('labels a noisy replay SAMPLED, exactly as the legend promises', async () => {
    const { trace } = await runPipeline({
      ...BASE,
      noise: {
        readoutError: 0.02,
        depolarizing1q: 0.01,
        depolarizing2q: 0.02,
        amplitudeDamping: 0.01,
        phaseDamping: 0.01,
      },
    });
    const certainties = gateCertainties(trace.events);
    expect(certainties.size).toBeGreaterThan(0);
    expect([...certainties]).toEqual([qpuLights?.noisyCertainty ?? 'SAMPLED']);
    expect(qpuLights?.noisyCertainty).toBe('SAMPLED');
  });
});

/**
 * The 2D coupling map, the 3D banners and the Inspector all derive logical
 * residency from `logicalToPhysicalAt`, and the mapping module states they
 * "can never disagree". They did: the 2D view filled the gap before
 * `layout.assigned` from the trace header's `initialLayout`, so it asserted
 * a compiler decision at ticks before the compiler had made it while the
 * other two correctly showed nothing.
 */
describe('logical residency before the layout stage', () => {
  it('has no assignment at all until layout.assigned fires', async () => {
    const { trace } = await runPipeline({ ...BASE, noise: null, layoutMethod: 'interaction' });
    const assignedAt = trace.events.find((e) => e.eventType === 'layout.assigned')?.logicalTick;
    expect(assignedAt, 'the pipeline must record a layout decision').toBeTypeOf('number');
    for (let tick = 0; tick < assignedAt!; tick += 1) {
      expect(logicalToPhysicalAt(trace, tick).size, `tick ${tick}`).toBe(0);
    }
    expect(logicalToPhysicalAt(trace, assignedAt!).size).toBeGreaterThan(0);
  });
});
