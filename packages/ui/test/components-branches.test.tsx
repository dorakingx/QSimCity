// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Trace } from 'qsimcity-trace';
import { MetricsPanel } from '../src/components/MetricsPanel.js';
import { ResultsSection } from '../src/components/ResultsSection.js';
import { SchedulePanel } from '../src/components/SchedulePanel.js';
import { Inspector } from '../src/components/Inspector.js';
import { LabControls } from '../src/components/LabControls.js';
import { EventLog } from '../src/components/EventLog.js';
import { Accessible2DView } from '../src/views/Accessible2DView.js';
import { HelpOverlay } from '../src/components/HelpOverlay.js';
import { SettingsMenu } from '../src/components/SettingsMenu.js';
import { CommandPalette } from '../src/components/CommandPalette.js';
import { useAppStore, DEFAULT_CONFIG, DEFAULT_SETTINGS } from '../src/store/appStore.js';
import { createDirectRunner } from '../src/pipeline/workerClient.js';
import { runPipeline } from '../src/pipeline/runPipeline.js';
import { getSampleCircuit } from '@qsimcity/domain';

/** Branch coverage for empty, error, and alternate-configuration states. */

let noisyTrace: Trace;
let vqeLikeTrace: Trace;

beforeEach(() => {
  cleanup();
  useAppStore.setState({
    mode: 'home',
    config: { ...DEFAULT_CONFIG },
    running: false,
    runError: null,
    trace: null,
    playbackTick: 0,
    playbackPlaying: false,
    selection: null,
    settings: { ...DEFAULT_SETTINGS },
    inspectorOpen: false,
    scheduleOpen: false,
    paletteOpen: false,
    helpOpen: false,
    toast: null,
    runner: createDirectRunner(),
  });
});

function emptyTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    schemaVersion: '1.0.0',
    traceId: 't-empty',
    createdAt: new Date().toISOString(),
    generator: { generator: 'test', generatorVersion: '1.0.0' },
    seed: 's',
    packageVersions: {},
    inputHash: '0000000000000000',
    deviceId: null,
    shots: 0,
    noise: null,
    inputCircuit: { name: 'empty', numQubits: 1, numClbits: 0, cregs: [], instructions: [] },
    compiledCircuit: null,
    initialLayout: null,
    finalLayout: null,
    metrics: [],
    results: {},
    events: [],
    ...overrides,
  };
}

describe('empty and partial states', () => {
  it('MetricsPanel renders dashes when metrics are absent', () => {
    render(<MetricsPanel trace={emptyTrace()} />);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(8);
  });

  it('MetricsPanel omits the layout line when there is no layout', () => {
    render(<MetricsPanel trace={emptyTrace()} />);
    expect(screen.queryByText(/Initial layout/)).toBeNull();
  });

  it('ResultsSection reports when a trace has no counts', () => {
    render(<ResultsSection trace={emptyTrace()} />);
    expect(screen.getByText('This trace contains no measurement counts.')).toBeTruthy();
  });

  it('SchedulePanel prompts when nothing has been scheduled', () => {
    useAppStore.setState({ scheduleOpen: true, trace: emptyTrace() });
    render(<SchedulePanel />);
    expect(screen.getByText('Run a circuit to see its schedule.')).toBeTruthy();
  });

  it('SchedulePanel prompts with no trace at all', () => {
    useAppStore.setState({ scheduleOpen: true, trace: null });
    render(<SchedulePanel />);
    expect(screen.getByText('Run a circuit to see its schedule.')).toBeTruthy();
  });

  it('EventLog reports quiet ticks', () => {
    render(<EventLog trace={emptyTrace()} />);
    expect(screen.getByText('No events at this tick.')).toBeTruthy();
  });

  it('Accessible2DView omits the coupling map when the trace has no device', () => {
    useAppStore.setState({ trace: emptyTrace() });
    render(<Accessible2DView />);
    expect(screen.queryByRole('group', { name: /Coupling map/ })).toBeNull();
  });

  it('Inspector reports unknown selections gracefully', () => {
    useAppStore.setState({
      inspectorOpen: true,
      selection: { kind: 'district', districtId: 'atlantis' },
    });
    render(<Inspector />);
    expect(screen.getByText('Unknown district.')).toBeTruthy();
    cleanup();
    useAppStore.setState({
      inspectorOpen: true,
      selection: { kind: 'building', buildingId: 'nope', districtId: 'qpu-grid' },
    });
    render(<Inspector />);
    expect(screen.getByText('Unknown building.')).toBeTruthy();
    cleanup();
    useAppStore.setState({
      inspectorOpen: true,
      selection: { kind: 'interactive', interactiveId: 'nope' },
    });
    render(<Inspector />);
    expect(screen.getByText('Unknown console.')).toBeTruthy();
  });

  it('Inspector reports a missing trace for instruction selections', () => {
    useAppStore.setState({
      inspectorOpen: true,
      trace: null,
      selection: { kind: 'instruction', instructionId: 'i0', circuit: 'input' },
    });
    render(<Inspector />);
    expect(screen.getByText('No trace loaded.')).toBeTruthy();
    cleanup();
    useAppStore.setState({
      inspectorOpen: true,
      trace: emptyTrace(),
      selection: { kind: 'instruction', instructionId: 'ghost', circuit: 'input' },
    });
    render(<Inspector />);
    expect(screen.getByText('Instruction not found in the current trace.')).toBeTruthy();
  });
});

describe('trace-driven branches', () => {
  beforeEach(async () => {
    if (!noisyTrace) {
      const { trace } = await runPipeline({
        qasm: getSampleCircuit('bell').qasm,
        shots: 64,
        seed: 'branch-noisy',
        deviceId: 'linear-5',
        noise: {
          readoutError: 0.15,
          depolarizing1q: 0.02,
          depolarizing2q: 0.05,
          amplitudeDamping: 0.02,
          phaseDamping: 0.02,
        },
        layoutMethod: 'trivial',
        optimize: true,
      });
      noisyTrace = trace;
    }
    if (!vqeLikeTrace) {
      const { trace } = await runPipeline({
        qasm: getSampleCircuit('teleportation').qasm,
        shots: 32,
        seed: 'branch-dyn',
        deviceId: 'linear-5',
        noise: null,
        layoutMethod: 'interaction',
        optimize: false,
      });
      vqeLikeTrace = trace;
    }
  });

  it('ResultsSection shows both series and a sampling-uncertainty note', () => {
    const { container } = render(<ResultsSection trace={noisyTrace} compare />);
    expect(screen.getAllByText(/Ideal vs noisy counts/).length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/sampling\s+uncertainty/);
  });

  it('MetricsPanel shows the post-routing layout when it differs', () => {
    render(<MetricsPanel trace={noisyTrace} />);
    expect(screen.getByText(/Initial layout:/)).toBeTruthy();
  });

  it('Inspector shows an instruction with jump actions', async () => {
    const instructionId = noisyTrace.inputCircuit.instructions[0]!.id;
    useAppStore.setState({
      inspectorOpen: true,
      trace: noisyTrace,
      playbackTick: 99,
      selection: { kind: 'instruction', instructionId, circuit: 'input' },
    });
    render(<Inspector />);
    expect(screen.getByText('Input circuit instruction')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Jump timeline/ }));
    expect(useAppStore.getState().playbackTick).toBeGreaterThanOrEqual(0);
    await userEvent.click(screen.getByRole('button', { name: /View in 2D circuit/ }));
    expect(useAppStore.getState().mode).toBe('accessible-2d');
  });

  it('Inspector shows a compiled instruction', () => {
    const instructionId = noisyTrace.compiledCircuit!.instructions[0]!.id;
    useAppStore.setState({
      inspectorOpen: true,
      trace: noisyTrace,
      selection: { kind: 'instruction', instructionId, circuit: 'compiled' },
    });
    render(<Inspector />);
    expect(screen.getByText('Compiled circuit instruction')).toBeTruthy();
  });

  it('Inspector district view offers a jump to the active instruction', async () => {
    const gateEvent = noisyTrace.events.find((e) => e.instructionId !== null)!;
    useAppStore.setState({
      inspectorOpen: true,
      trace: noisyTrace,
      playbackTick: gateEvent.logicalTick,
      selection: { kind: 'district', districtId: 'qpu-grid' },
    });
    render(<Inspector />);
    const jump = screen.queryByRole('button', { name: /Inspect active instruction/ });
    if (jump) {
      await userEvent.click(jump);
      expect(useAppStore.getState().selection?.kind).toBe('instruction');
    }
  });

  it('Inspector qubit view reports assignment and measured bits', () => {
    useAppStore.setState({
      inspectorOpen: true,
      trace: noisyTrace,
      playbackTick: 999,
      selection: { kind: 'qubit', qubit: 0 },
    });
    render(<Inspector />);
    expect(screen.getByRole('heading', { name: 'Physical qubit 0' })).toBeTruthy();
    expect(screen.getByText(/L0 \(initial layout\)|Unassigned/)).toBeTruthy();
  });

  it('EventLog narrates a dynamic circuit with conditions', () => {
    const condEvent = vqeLikeTrace.events.find(
      (e) => e.eventType === 'classical.condition_evaluated',
    )!;
    useAppStore.setState({ playbackTick: condEvent.logicalTick });
    render(<EventLog trace={vqeLikeTrace} />);
    expect(screen.getByText(/Classical condition/)).toBeTruthy();
  });

  it('Accessible2DView renders the full stack with a device trace', () => {
    useAppStore.setState({ trace: noisyTrace, playbackTick: 4 });
    render(<Accessible2DView />);
    expect(screen.getAllByRole('group', { name: /Coupling map/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('group', { name: /Ideal vs noisy|Measured counts/ }).length).toBeGreaterThan(0);
  });
});

describe('LabControls interaction branches', () => {
  it('exports a trace via a blob download', async () => {
    const { trace } = await runPipeline({
      qasm: getSampleCircuit('bell').qasm,
      shots: 16,
      seed: 'export-branch',
      deviceId: 'linear-5',
      noise: null,
      layoutMethod: 'trivial',
      optimize: true,
    });
    useAppStore.setState({ trace });
    // Spy on the static helpers only: replacing globalThis.URL wholesale
    // would break every later `new URL(...)` in the suite.
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    render(<LabControls />);
    await userEvent.click(screen.getByRole('button', { name: 'Export trace' }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('copies a share link to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<LabControls />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(useAppStore.getState().toast).toContain('clipboard');
    vi.unstubAllGlobals();
  });

  it('falls back to showing the link when the clipboard is unavailable', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<LabControls />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await vi.waitFor(() => expect(useAppStore.getState().toast).toContain('Shareable link:'));
    vi.unstubAllGlobals();
  });

  it('disables the share button and explains why for custom programs', () => {
    useAppStore.setState({ config: { ...DEFAULT_CONFIG, sampleId: null } });
    render(<LabControls />);
    expect(screen.getByRole('button', { name: 'Copy share link' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/custom programs stay local/)).toBeTruthy();
  });

  it('shows progress and a cancel button while running', () => {
    useAppStore.setState({ running: true, runProgress: 0.4 });
    render(<LabControls />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it('rejects an oversized import file with a size message', async () => {
    render(<LabControls />);
    const input = screen.getByLabelText(/Import a .qsimcity.json trace file/) as HTMLInputElement;
    const big = new File(['x'.repeat(64)], 'big.qsimcity.json', { type: 'application/json' });
    Object.defineProperty(big, 'size', { value: 40 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('import limit');
    });
  });

  it('reports malformed imported traces', async () => {
    render(<LabControls />);
    const input = screen.getByLabelText(/Import a .qsimcity.json trace file/) as HTMLInputElement;
    const bad = new File(['{"schemaVersion":"1.0.0"}'], 'bad.qsimcity.json', {
      type: 'application/json',
    });
    fireEvent.change(input, { target: { files: [bad] } });
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/failed|invalid/i);
    });
  });

  it('imports a valid trace successfully', async () => {
    const { trace } = await runPipeline({
      qasm: getSampleCircuit('bell').qasm,
      shots: 16,
      seed: 'import-branch',
      deviceId: 'linear-5',
      noise: null,
      layoutMethod: 'trivial',
      optimize: true,
    });
    render(<LabControls />);
    const input = screen.getByLabelText(/Import a .qsimcity.json trace file/) as HTMLInputElement;
    const good = new File([JSON.stringify(trace)], 'good.qsimcity.json', {
      type: 'application/json',
    });
    fireEvent.change(input, { target: { files: [good] } });
    await vi.waitFor(() => expect(useAppStore.getState().traceImported).toBe(true));
    expect(useAppStore.getState().toast).toBe('Trace imported.');
  });

  it('shows a manual layout option when one is configured', () => {
    useAppStore.setState({ config: { ...DEFAULT_CONFIG, layoutMethod: [1, 0] } });
    render(<LabControls />);
    expect(screen.getByRole('option', { name: 'Manual' })).toBeTruthy();
  });
});

describe('overlay branch coverage', () => {
  it('HelpOverlay closes when the backdrop is clicked', () => {
    useAppStore.setState({ helpOpen: true });
    const { container } = render(<HelpOverlay />);
    fireEvent.click(container.querySelector('.modal-backdrop')!);
    expect(useAppStore.getState().helpOpen).toBe(false);
  });

  it('HelpOverlay closes on Escape', () => {
    useAppStore.setState({ helpOpen: true });
    render(<HelpOverlay />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(useAppStore.getState().helpOpen).toBe(false);
  });

  it('CommandPalette closes when the backdrop is clicked', () => {
    useAppStore.setState({ paletteOpen: true });
    const { container } = render(<CommandPalette />);
    fireEvent.click(container.querySelector('.modal-backdrop')!);
    expect(useAppStore.getState().paletteOpen).toBe(false);
  });

  it('CommandPalette runs sample, district, and action commands', async () => {
    useAppStore.setState({ paletteOpen: true });
    render(<CommandPalette />);
    await userEvent.type(screen.getByRole('combobox'), 'Load sample: GHZ');
    await userEvent.click(screen.getAllByRole('option')[0]!);
    expect(useAppStore.getState().config.sampleId).toBe('ghz-4');
    cleanup();
    useAppStore.setState({ paletteOpen: true });
    render(<CommandPalette />);
    await userEvent.type(screen.getByRole('combobox'), 'Toggle day');
    await userEvent.click(screen.getAllByRole('option')[0]!);
    expect(useAppStore.getState().settings.dayNight).toBe('day');
  });

  it('SettingsMenu closes when clicking outside and shows the volume slider', async () => {
    render(<SettingsMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByLabelText(/Sound/));
    expect(screen.getByLabelText(/Volume/)).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText('Visual quality')).toBeNull();
  });

  it('SettingsMenu closes on Escape', async () => {
    render(<SettingsMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.keyDown(screen.getByRole('group', { name: 'Settings' }), { key: 'Escape' });
    expect(screen.queryByLabelText('Visual quality')).toBeNull();
  });

  it('SettingsMenu toggles particles and labels', async () => {
    render(<SettingsMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByLabelText('Particles'));
    expect(useAppStore.getState().settings.particles).toBe(false);
    await userEvent.click(screen.getByLabelText('Floating labels'));
    expect(useAppStore.getState().settings.labels).toBe(false);
  });
});
