// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LEGEND_ENTRIES } from '../src/content/legend.js';
import { CityLegend } from '../src/components/CityLegend.js';

/**
 * City Legend completeness (W4.6): every animated entity class in the city
 * is listed with meaning, trigger, and a certainty/source classification,
 * and semantic vehicles never claim to be quantum states.
 */

describe('city legend content', () => {
  it('covers every animated entity class in the 3D city', () => {
    const required = [
      'job-convoy',
      'courier-van',
      'logical-banner',
      'qpu-lights',
      'harbor-stacks',
      'district-glow',
      'noise-weather',
      'ambient-car',
      'pedestrian',
      'district-pulse',
      'city-ambience',
    ];
    const ids = LEGEND_ENTRIES.map((e) => e.id);
    for (const id of required) {
      expect(ids, id).toContain(id);
    }
  });

  it('gives every entry a meaning, a trigger, and classifications', () => {
    for (const entry of LEGEND_ENTRIES) {
      expect(entry.name.length, entry.id).toBeGreaterThan(3);
      expect(entry.represents.length, entry.id).toBeGreaterThan(40);
      expect(entry.trigger.length, entry.id).toBeGreaterThan(30);
      expect(entry.source.length, entry.id).toBeGreaterThan(3);
      expect(['EXACT', 'COMPUTED', 'SAMPLED', 'ILLUSTRATIVE', 'ESTIMATED'], entry.id).toContain(
        entry.certainty,
      );
    }
  });

  it('never describes vehicles or people as quantum states', () => {
    for (const entry of LEGEND_ENTRIES) {
      if (entry.id === 'ambient-car' || entry.id === 'pedestrian' || entry.id === 'courier-van') {
        expect(entry.represents.toLowerCase().includes('quantum state'), entry.id).toBe(false);
        expect(entry.represents.toLowerCase().includes('amplitude'), entry.id).toBe(false);
      }
    }
    // The convoy entry explicitly denies being a quantum state.
    const convoy = LEGEND_ENTRIES.find((e) => e.id === 'job-convoy')!;
    expect(convoy.represents).toMatch(/never a quantum state/i);
  });

  it('classifies purely decorative motion as ILLUSTRATIVE', () => {
    for (const id of ['ambient-car', 'pedestrian', 'district-pulse', 'city-ambience']) {
      const entry = LEGEND_ENTRIES.find((e) => e.id === id)!;
      expect(entry.certainty, id).toBe('ILLUSTRATIVE');
    }
  });
});

describe('CityLegend component', () => {
  it('renders every entry and closes on demand', async () => {
    let closed = false;
    render(<CityLegend onClose={() => (closed = true)} />);
    expect(screen.getByRole('dialog', { name: /City legend/i })).toBeTruthy();
    for (const entry of LEGEND_ENTRIES) {
      expect(screen.getByRole('heading', { name: entry.name })).toBeTruthy();
    }
    await userEvent.click(screen.getByRole('button', { name: /Close legend/i }));
    expect(closed).toBe(true);
  });
});
