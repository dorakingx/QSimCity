// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
      'noise-rain',
      'ambient-car',
      'sidewalk-stroller',
      'pedestrian',
      'program-ship',
      'refinery-steam',
      'scheduling-beacon',
      'observatory-beam',
      'district-pulse',
      'city-ambience',
    ];
    const ids = LEGEND_ENTRIES.map((e) => e.id);
    for (const id of required) {
      expect(ids, id).toContain(id);
    }
  });

  // The list above is hand-maintained, so on its own it only enforces what
  // the Legend says — not what the city does. This derives the requirement
  // from the renderer instead: the engine names every object it animates,
  // and an adversarial review found four named set pieces (the program
  // ship, refinery steam, the scheduling beacon and the observatory beam)
  // moving from trace data while the Legend asserted nothing moves that it
  // does not list. Naming a new animated object now fails this test until
  // it is explained.
  it('lists every object the engine names in its scene graph', () => {
    // happy-dom rewrites import.meta.url, so resolve from the working
    // directory, which vitest sets to either the package or the repo root.
    const candidates = [
      resolve(process.cwd(), '../visual-engine/src/engine.ts'),
      resolve(process.cwd(), 'packages/visual-engine/src/engine.ts'),
    ];
    const enginePath = candidates.find((c) => existsSync(c));
    expect(enginePath, 'engine source not found').toBeDefined();
    const source = readFileSync(enginePath!, 'utf8');
    const named = [...source.matchAll(/\.name = '([a-z0-9-]+)'/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(3);
    const ids = new Set(LEGEND_ENTRIES.map((e) => e.id));
    for (const name of named) {
      expect(ids, `engine object "${name}" has no City Legend entry`).toContain(name);
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

  it('carries a readable child register for every entry', () => {
    for (const entry of LEGEND_ENTRIES) {
      expect(entry.childRepresents.length, entry.id).toBeGreaterThan(20);
      expect(entry.childTrigger.length, entry.id).toBeGreaterThan(10);
      // Child prose stays free of the adult jargon a young reader cannot use.
      for (const term of ['derivation', 'histogram', 'trajectory', 'presentational']) {
        expect(entry.childRepresents.toLowerCase(), `${entry.id}: ${term}`).not.toContain(term);
        expect(entry.childTrigger.toLowerCase(), `${entry.id}: ${term}`).not.toContain(term);
      }
    }
  });

  it('splits noise provenance honestly: estimated clouds, sampled rain, noisy-phase gate lights', () => {
    const clouds = LEGEND_ENTRIES.find((e) => e.id === 'noise-weather')!;
    expect(clouds.source).toBe('estimated');
    expect(clouds.certainty).toBe('ESTIMATED');
    const rain = LEGEND_ENTRIES.find((e) => e.id === 'noise-rain')!;
    expect(rain.source).toBe('sampled_simulation');
    expect(rain.certainty).toBe('SAMPLED');
    const lights = LEGEND_ENTRIES.find((e) => e.id === 'qpu-lights')!;
    expect(lights.certainty).toBe('EXACT');
    expect(lights.noisyCertainty).toBe('SAMPLED');
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
    for (const id of [
      'ambient-car',
      'sidewalk-stroller',
      'pedestrian',
      'district-pulse',
      'city-ambience',
    ]) {
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
