// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { getSampleCircuit, parseQasm } from '@qsimcity/domain';
import type { ReactElement } from 'react';
import { CircuitBuilder, useCircuitBuilder } from '../src/components/CircuitBuilder.js';
import {
  bellTemplateState,
  compileBuilderQasm,
  ghzTemplateState,
  paletteForLevel,
  withPlacement,
  EMPTY_BUILDER_STATE,
  type BuilderGridState,
} from '../src/builder/model.js';
import { createDirectRunner } from '../src/pipeline/workerClient.js';
import { useAppStore, DEFAULT_CONFIG, DEFAULT_SETTINGS } from '../src/store/appStore.js';
import { DEFAULT_PROGRESS } from '../src/store/progress.js';

/**
 * Circuit builder tests (acceptance W6.2, W6.3): pointer and keyboard
 * placement, removal, undo/redo/reset, the Bell template, and the guarantee
 * that every grid compiles through the standard OpenQASM parser.
 */

function Harness(): ReactElement {
  const builder = useCircuitBuilder();
  return <CircuitBuilder builder={builder} />;
}

function resetStore(): void {
  useAppStore.setState({
    mode: 'lab',
    config: { ...DEFAULT_CONFIG },
    running: false,
    runProgress: 0,
    runError: null,
    trace: null,
    playbackTick: 0,
    playbackPlaying: false,
    selection: null,
    activeMissionId: null,
    labInputTab: 'blocks',
    progress: { ...DEFAULT_PROGRESS },
    settings: { ...DEFAULT_SETTINGS },
    toast: null,
    runner: createDirectRunner(),
  });
}

beforeEach(() => {
  cleanup();
  resetStore();
});

/** Arms a palette gate with a stationary pointer tap. */
function tapPaletteTile(name: RegExp): void {
  const tile = screen.getByRole('button', { name });
  fireEvent.pointerDown(tile, { clientX: 5, clientY: 5 });
  fireEvent.pointerUp(tile, { clientX: 5, clientY: 5 });
}

function cell(column: number, qubit: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-cell="${column}-${qubit}"]`);
  if (!el) throw new Error(`Missing cell ${column}-${qubit}`);
  return el;
}

describe('tap-to-place and removal', () => {
  it('places a one-qubit gate by tapping the palette then a cell', () => {
    render(<Harness />);
    tapPaletteTile(/Hadamard/);
    fireEvent.click(cell(0, 0));
    expect(cell(0, 0).getAttribute('aria-label')).toContain('Hadamard');
    expect(useAppStore.getState().config.qasm).toContain('h q[0];');
    expect(useAppStore.getState().config.sampleId).toBeNull();
  });

  it('places CX with an explicit two-step target selection and a visible prompt', () => {
    render(<Harness />);
    tapPaletteTile(/CX \(link\)/);
    fireEvent.click(cell(1, 0));
    expect(screen.getByRole('status').textContent).toContain('Pick the second qubit lane');
    fireEvent.click(cell(1, 1));
    expect(cell(1, 0).getAttribute('aria-label')).toContain('CX');
    expect(cell(1, 1).getAttribute('aria-label')).toContain('CX');
    expect(useAppStore.getState().config.qasm).toContain('cx q[0],q[1];');
  });

  it('refuses to stack two tiles on one cell', () => {
    render(<Harness />);
    tapPaletteTile(/Hadamard/);
    fireEvent.click(cell(0, 0));
    tapPaletteTile(/X \(flip\)/);
    fireEvent.click(cell(0, 0));
    expect(useAppStore.getState().config.qasm).not.toContain('x q[0];');
  });

  it('removes a tile with its remove button', () => {
    render(<Harness />);
    tapPaletteTile(/Hadamard/);
    fireEvent.click(cell(2, 1));
    expect(useAppStore.getState().config.qasm).toContain('h q[1];');
    fireEvent.click(screen.getByRole('button', { name: /Remove Hadamard/ }));
    expect(useAppStore.getState().config.qasm).not.toContain('h q[1];');
  });

  it('removes a tile by dragging it off the grid', () => {
    render(<Harness />);
    tapPaletteTile(/Hadamard/);
    fireEvent.click(cell(0, 0));
    expect(useAppStore.getState().config.qasm).toContain('h q[0];');
    const section = screen.getByRole('region', { name: 'Circuit builder' });
    fireEvent.pointerDown(cell(0, 0), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(section, { clientX: 300, clientY: 300 });
    fireEvent.pointerUp(section, { clientX: 300, clientY: 300 });
    expect(useAppStore.getState().config.qasm).not.toContain('h q[0];');
  });
});

describe('drag placement (pointer events, not HTML5 drag-and-drop)', () => {
  it('drops a palette gate onto the cell under the pointer', () => {
    render(<Harness />);
    const grid = document.querySelector('.builder-grid')!;
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 120,
      bottom: 20,
      width: 120,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const tile = screen.getByRole('button', { name: /Hadamard/ });
    const section = screen.getByRole('region', { name: 'Circuit builder' });
    fireEvent.pointerDown(tile, { clientX: 200, clientY: 200 });
    fireEvent.pointerMove(section, { clientX: 15, clientY: 5 });
    fireEvent.pointerUp(section, { clientX: 15, clientY: 5 });
    // Cell width 120/12 = 10, so x=15 is column 1; y=5 is qubit 0.
    expect(cell(1, 0).getAttribute('aria-label')).toContain('Hadamard');
    expect(useAppStore.getState().config.qasm).toContain('h q[0];');
  });
});

describe('keyboard operation', () => {
  it('arms a gate with Enter, navigates with arrows, places with Enter, removes with Delete', () => {
    render(<Harness />);
    const tile = screen.getByRole('button', { name: /Hadamard/ });
    tile.focus();
    fireEvent.keyDown(tile, { key: 'Enter' });
    expect(tile.getAttribute('aria-pressed')).toBe('true');

    const start = cell(0, 0);
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1, 0));
    fireEvent.keyDown(cell(1, 0), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(1, 1));

    fireEvent.keyDown(cell(1, 1), { key: 'Enter' });
    expect(cell(1, 1).getAttribute('aria-label')).toContain('Hadamard');
    expect(useAppStore.getState().config.qasm).toContain('h q[1];');

    fireEvent.keyDown(cell(1, 1), { key: 'Delete' });
    expect(useAppStore.getState().config.qasm).not.toContain('h q[1];');
  });
});

describe('undo, redo, reset, and the Bell template', () => {
  it('undoes, redoes, and resets grid changes', () => {
    render(<Harness />);
    tapPaletteTile(/Hadamard/);
    fireEvent.click(cell(0, 0));
    tapPaletteTile(/X \(flip\)/);
    fireEvent.click(cell(1, 1));
    expect(useAppStore.getState().config.qasm).toContain('x q[1];');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useAppStore.getState().config.qasm).not.toContain('x q[1];');
    expect(useAppStore.getState().config.qasm).toContain('h q[0];');

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(useAppStore.getState().config.qasm).toContain('x q[1];');

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    const qasm = useAppStore.getState().config.qasm;
    expect(qasm).not.toContain('h q[0];');
    expect(qasm).not.toContain('x q[1];');
    expect(() => parseQasm(qasm)).not.toThrow();
  });

  it('loads the Bell template with one click and matches the bell sample semantics', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Bell pair' }));
    const qasm = useAppStore.getState().config.qasm;
    const built = parseQasm(qasm);
    const sample = parseQasm(getSampleCircuit('bell').qasm);
    expect(built.numQubits).toBe(sample.numQubits);
    // Same operation-name sequence through the same parser: no separate
    // science between the builder and the Lab.
    expect(built.instructions.map((i) => i.name)).toEqual(sample.instructions.map((i) => i.name));
    expect(built.instructions.map((i) => [...i.qubits])).toEqual(
      sample.instructions.map((i) => [...i.qubits]),
    );
  });
});

describe('palette and compilation coverage', () => {
  it('shows the small palette at child level and the full palette otherwise', () => {
    expect(paletteForLevel('child').map((g) => g.id)).toEqual(['h', 'x', 'z', 'cx', 'measure']);
    const full = paletteForLevel('beginner').map((g) => g.id);
    for (const id of ['h', 'x', 'z', 'y', 's', 't', 'rz', 'cx', 'swap', 'measure']) {
      expect(full).toContain(id);
    }
    expect(paletteForLevel('expert')).toEqual(paletteForLevel('beginner'));
  });

  it('every palette gate compiles to parseable OpenQASM 2.0', () => {
    for (const gate of paletteForLevel('expert')) {
      let state: BuilderGridState = { ...EMPTY_BUILDER_STATE, numQubits: 2 };
      state = withPlacement(state, gate.id, 0, 0, gate.twoQubit ? 1 : null);
      expect(state.placements).toHaveLength(1);
      const qasm = compileBuilderQasm(state);
      expect(() => parseQasm(qasm), `${gate.id} must parse: ${qasm}`).not.toThrow();
    }
  });

  it('templates compile to parseable programs of the right shape', () => {
    const bell = parseQasm(compileBuilderQasm(bellTemplateState()));
    expect(bell.numQubits).toBe(2);
    const ghz = parseQasm(compileBuilderQasm(ghzTemplateState()));
    expect(ghz.numQubits).toBe(3);
    expect(ghz.instructions.filter((i) => i.name === 'cx')).toHaveLength(2);
    expect(ghz.instructions.filter((i) => i.kind === 'measure')).toHaveLength(3);
  });

  it('child explanation level renders only the small palette', () => {
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, explanationLevel: 'child' },
    });
    render(<Harness />);
    expect(screen.getByRole('button', { name: /Hadamard/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /SWAP/ })).toBeNull();
  });
});

describe('running the built circuit', () => {
  it('runs the compiled grid through the real pipeline', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Bell pair' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await vi.waitFor(
      () => {
        expect(useAppStore.getState().trace).not.toBeNull();
      },
      { timeout: 15_000, interval: 25 },
    );
    const trace = useAppStore.getState().trace!;
    expect(trace.inputCircuit.numQubits).toBe(2);
    expect(trace.events.some((e) => e.eventType === 'measurement.sampled')).toBe(true);
  });
});
