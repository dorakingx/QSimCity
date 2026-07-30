import { describe, expect, it } from 'vitest';
import { getSampleCircuit, parseQasm } from '@qsimcity/domain';
import { runExperiment } from '@qsimcity/simulator';
import {
  activityAtTick,
  eventsAt,
  eventsUpTo,
  maxTickOf,
  tickDurationMs,
  BASE_TICK_MS,
} from '../src/playback.js';

async function bellTrace() {
  const qasm = getSampleCircuit('bell').qasm;
  const { trace } = await runExperiment(parseQasm(qasm), {
    shots: 100,
    seed: 'world-playback',
    programSource: qasm,
  });
  return trace;
}

describe('playback model', () => {
  it('maxTickOf matches the last event tick', async () => {
    const trace = await bellTrace();
    expect(maxTickOf(trace)).toBe(trace.events.at(-1)!.logicalTick);
    expect(maxTickOf(trace)).toBeGreaterThan(3);
  });

  it('eventsAt returns only events with the exact tick', async () => {
    const trace = await bellTrace();
    for (const ev of eventsAt(trace, 3)) expect(ev.logicalTick).toBe(3);
  });

  it('eventsUpTo accumulates monotonically', async () => {
    const trace = await bellTrace();
    let prev = 0;
    for (let t = 0; t <= maxTickOf(trace); t++) {
      const n = eventsUpTo(trace, t).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBe(trace.events.length);
  });

  it('activity clamps ticks to the valid range', async () => {
    const trace = await bellTrace();
    expect(activityAtTick(trace, -5).tick).toBe(0);
    expect(activityAtTick(trace, 10_000).tick).toBe(maxTickOf(trace));
  });

  it('maps gate events to the qpu-grid district', async () => {
    const trace = await bellTrace();
    const gateEvent = trace.events.find((e) => e.eventType === 'gate.executed')!;
    const activity = activityAtTick(trace, gateEvent.logicalTick);
    expect(activity.districts.some((d) => d.districtId === 'qpu-grid')).toBe(true);
  });

  it('accumulates measured bits from representative outcomes', async () => {
    const trace = await bellTrace();
    const final = activityAtTick(trace, maxTickOf(trace));
    expect(final.measuredBits.size).toBe(2);
    const b0 = final.measuredBits.get(0)!;
    const b1 = final.measuredBits.get(1)!;
    // Bell state: the representative shot is perfectly correlated.
    expect(b0).toBe(b1);
  });

  it('tracks executed instructions cumulatively', async () => {
    const trace = await bellTrace();
    const early = activityAtTick(trace, 1);
    const late = activityAtTick(trace, maxTickOf(trace));
    expect(late.executedInstructionIds.size).toBeGreaterThanOrEqual(
      early.executedInstructionIds.size,
    );
    expect(late.executedInstructionIds.size).toBeGreaterThanOrEqual(4);
  });

  it('reports active couplings for two-qubit gates', async () => {
    const trace = await bellTrace();
    const cxEvent = trace.events.find(
      (e) => e.eventType === 'gate.executed' && (e.payload as { gate?: string }).gate === 'cx',
    )!;
    const activity = activityAtTick(trace, cxEvent.logicalTick);
    expect(activity.activeCouplings).toContainEqual([0, 1]);
    expect(activity.activeQubits).toEqual([0, 1]);
  });

  it('tick duration scales inversely with speed and clamps to 0.1x..5x', () => {
    expect(tickDurationMs(1)).toBe(BASE_TICK_MS);
    expect(tickDurationMs(2)).toBe(BASE_TICK_MS / 2);
    expect(tickDurationMs(0.01)).toBe(BASE_TICK_MS / 0.1);
    expect(tickDurationMs(50)).toBe(BASE_TICK_MS / 5);
  });
});
