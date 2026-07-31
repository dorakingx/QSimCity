// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getSampleCircuit, parseQasm } from '@qsimcity/domain';
import type { Trace, TraceCircuit } from 'qsimcity-trace';
import { CircuitDiagram } from '../src/components/CircuitDiagram.js';
import { Histogram } from '../src/components/Histogram.js';
import { CouplingMap } from '../src/components/CouplingMap.js';
import { CertaintyBadge } from '../src/components/CertaintyBadge.js';
import { MetricsPanel } from '../src/components/MetricsPanel.js';
import { ProvenancePanel } from '../src/components/ProvenancePanel.js';
import { TimelineBar } from '../src/components/TimelineBar.js';
import { Inspector } from '../src/components/Inspector.js';
import { HelpOverlay } from '../src/components/HelpOverlay.js';
import { CommandPalette } from '../src/components/CommandPalette.js';
import { SettingsMenu } from '../src/components/SettingsMenu.js';
import { Toast } from '../src/components/Toast.js';
import { SchedulePanel } from '../src/components/SchedulePanel.js';
import { EventLog } from '../src/components/EventLog.js';
import { ResultsSection } from '../src/components/ResultsSection.js';
import { LabControls } from '../src/components/LabControls.js';
import { HomeView } from '../src/views/HomeView.js';
import { Accessible2DView } from '../src/views/Accessible2DView.js';
import { CompareView } from '../src/views/CompareView.js';
import { TourOverlay } from '../src/tour/TourOverlay.js';
import { ScenarioPanel } from '../src/scenarios/ScenarioPanel.js';
import { runPipeline } from '../src/pipeline/runPipeline.js';
import { createDirectRunner } from '../src/pipeline/workerClient.js';
import { useAppStore, DEFAULT_CONFIG, DEFAULT_SETTINGS } from '../src/store/appStore.js';

/** Waits cover real parse+compile+simulate work on a cold cache. */
const WAIT = { timeout: 15_000, interval: 25 } as const;

let bellTrace: Trace;

function resetStore(): void {
  useAppStore.setState({
    mode: 'home',
    config: { ...DEFAULT_CONFIG },
    running: false,
    runProgress: 0,
    runError: null,
    trace: null,
    traceImported: false,
    playbackTick: 0,
    playbackPlaying: false,
    playbackSpeed: 1,
    selection: null,
    tourChapter: 0,
    activeScenarioId: null,
    settings: { ...DEFAULT_SETTINGS },
    paletteOpen: false,
    helpOpen: false,
    inspectorOpen: false,
    scheduleOpen: false,
    toast: null,
    runner: createDirectRunner(),
  });
}

beforeEach(() => {
  cleanup();
  resetStore();
});

const simpleCircuit: TraceCircuit = {
  name: 'demo',
  numQubits: 2,
  numClbits: 2,
  cregs: [{ name: 'c', size: 2 }],
  instructions: [
    { id: 'a', kind: 'gate', name: 'h', qubits: [0], params: [], clbits: [], condition: null },
    { id: 'b', kind: 'gate', name: 'cx', qubits: [0, 1], params: [], clbits: [], condition: null },
    {
      id: 'c',
      kind: 'gate',
      name: 'rz',
      qubits: [1],
      params: [Math.PI / 2],
      clbits: [],
      condition: null,
    },
    {
      id: 'd',
      kind: 'gate',
      name: 'swap',
      qubits: [0, 1],
      params: [],
      clbits: [],
      condition: null,
    },
    {
      id: 'e',
      kind: 'barrier',
      name: 'barrier',
      qubits: [0, 1],
      params: [],
      clbits: [],
      condition: null,
    },
    {
      id: 'f',
      kind: 'measure',
      name: 'measure',
      qubits: [0],
      params: [],
      clbits: [0],
      condition: null,
    },
    {
      id: 'g',
      kind: 'gate',
      name: 'x',
      qubits: [1],
      params: [],
      clbits: [],
      condition: { creg: 'c', value: 1 },
    },
  ],
};

describe('CircuitDiagram', () => {
  it('renders gates with an accessible table alternative', () => {
    render(<CircuitDiagram circuit={simpleCircuit} title="Test circuit" />);
    expect(screen.getByRole('group', { name: 'Test circuit' })).toBeTruthy();
    const details = screen.getByText('Instruction table (text alternative)');
    fireEvent.click(details);
    expect(screen.getByText(/Gate h on q0/)).toBeTruthy();
    expect(screen.getByText(/Gate cx on q0, q1/)).toBeTruthy();
    expect(screen.getByText(/Gate rz \(pi\/2\) on q1/)).toBeTruthy();
    expect(screen.getByText(/Measure q0 into classical bit 0/)).toBeTruthy();
    expect(screen.getByText(/if c == 1/)).toBeTruthy();
    expect(screen.getByText(/Barrier across q0, q1/)).toBeTruthy();
  });

  it('marks executed and current instructions in the table', () => {
    render(
      <CircuitDiagram
        circuit={simpleCircuit}
        title="Status"
        executedIds={new Set(['a'])}
        currentInstructionId="b"
      />,
    );
    fireEvent.click(screen.getByText('Instruction table (text alternative)'));
    expect(screen.getAllByText('executed').length).toBe(1);
    expect(screen.getAllByText('current').length).toBe(1);
    expect(screen.getAllByText('pending').length).toBe(5);
  });

  it('invokes onSelectInstruction on click and keyboard', async () => {
    const onSelect = vi.fn();
    render(<CircuitDiagram circuit={simpleCircuit} title="Pick" onSelectInstruction={onSelect} />);
    const gate = screen.getByRole('button', { name: /Gate h on q0/ });
    await userEvent.click(gate);
    expect(onSelect).toHaveBeenCalledWith('a');
    fireEvent.keyDown(gate, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(gate, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it('renders a ccx circuit and compact mode without error', () => {
    const ccx: TraceCircuit = {
      ...simpleCircuit,
      numQubits: 3,
      instructions: [
        {
          id: 'x',
          kind: 'gate',
          name: 'ccx',
          qubits: [0, 1, 2],
          params: [],
          clbits: [],
          condition: null,
        },
        {
          id: 'y',
          kind: 'gate',
          name: 'cz',
          qubits: [0, 1],
          params: [],
          clbits: [],
          condition: null,
        },
        {
          id: 'z',
          kind: 'reset',
          name: 'reset',
          qubits: [2],
          params: [],
          clbits: [],
          condition: null,
        },
      ],
    };
    render(<CircuitDiagram circuit={ccx} title="CCX" compact />);
    fireEvent.click(screen.getByText('Instruction table (text alternative)'));
    expect(screen.getByText(/Reset q2/)).toBeTruthy();
  });
});

describe('Histogram', () => {
  it('renders one series with a data table', () => {
    render(
      <Histogram
        title="Counts"
        series={[{ label: 'Ideal', counts: { '00': 60, '11': 40 }, certainty: 'SAMPLED' }]}
      />,
    );
    fireEvent.click(screen.getByText('Data table (text alternative)'));
    expect(screen.getByRole('rowheader', { name: '00' })).toBeTruthy();
    expect(screen.getByText('60.0%')).toBeTruthy();
  });

  it('renders two series for comparison', () => {
    render(
      <Histogram
        title="Compare"
        series={[
          { label: 'Ideal', counts: { '00': 50, '11': 50 }, certainty: 'SAMPLED' },
          { label: 'Noisy', counts: { '00': 40, '01': 10, '11': 50 }, certainty: 'SAMPLED' },
        ]}
      />,
    );
    expect(screen.getByText('Ideal')).toBeTruthy();
    expect(screen.getByText('Noisy')).toBeTruthy();
    fireEvent.click(screen.getByText('Data table (text alternative)'));
    expect(screen.getByRole('rowheader', { name: '01' })).toBeTruthy();
  });

  it('truncates to the most frequent outcomes and says so', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 40; i++) counts[i.toString(2).padStart(6, '0')] = 40 - i;
    render(
      <Histogram
        title="Many"
        series={[{ label: 'Ideal', counts, certainty: 'SAMPLED' }]}
        maxBars={5}
      />,
    );
    expect(screen.getByText(/Showing the 5 most frequent of 40 outcomes/)).toBeTruthy();
  });

  it('handles an empty series without dividing by zero', () => {
    render(
      <Histogram title="Empty" series={[{ label: 'Ideal', counts: {}, certainty: 'SAMPLED' }]} />,
    );
    expect(screen.getByRole('group', { name: 'Empty' })).toBeTruthy();
  });
});

describe('CouplingMap', () => {
  it('renders qubit nodes with layout overlay and text alternative', () => {
    render(
      <CouplingMap
        deviceId="linear-5"
        layout={[2, 3]}
        activeQubits={[2]}
        activeCouplings={[[2, 3]]}
      />,
    );
    expect(screen.getByRole('group', { name: /Coupling map/ })).toBeTruthy();
    fireEvent.click(screen.getByText('Topology details (text alternative)'));
    expect(screen.getByText(/logical 0 on physical 2/)).toBeTruthy();
    expect(screen.getByText(/0-1, 1-2, 2-3, 3-4/)).toBeTruthy();
  });

  it('supports qubit selection by pointer and keyboard', async () => {
    const onSelect = vi.fn();
    render(<CouplingMap deviceId="linear-5" onSelectQubit={onSelect} selectedQubit={1} />);
    const node = screen.getByRole('button', { name: 'Physical qubit 3' });
    await userEvent.click(node);
    expect(onSelect).toHaveBeenCalledWith(3);
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('renders grid and ring devices', () => {
    render(<CouplingMap deviceId="grid-3x3" />);
    cleanup();
    render(<CouplingMap deviceId="ring-8" />);
    expect(screen.getAllByRole('group', { name: /Ring 8/ }).length).toBeGreaterThan(0);
  });
});

describe('CertaintyBadge', () => {
  it('renders each certainty label with a tooltip', () => {
    render(
      <>
        <CertaintyBadge certainty="EXACT" />
        <CertaintyBadge certainty="ESTIMATED" />
      </>,
    );
    expect(screen.getByText('EXACT').getAttribute('title')).toContain('exactly');
    expect(screen.getByText('ESTIMATED').getAttribute('title')).toContain('proxy');
  });
});

describe('panels driven by a real trace', () => {
  beforeEach(async () => {
    if (!bellTrace) {
      const { trace } = await runPipeline({
        qasm: getSampleCircuit('bell').qasm,
        shots: 128,
        seed: 'component-tests',
        deviceId: 'linear-5',
        noise: null,
        layoutMethod: 'interaction',
        optimize: true,
      });
      bellTrace = trace;
    }
    useAppStore.setState({ trace: bellTrace });
  });

  it('MetricsPanel shows input vs compiled metrics and layout', () => {
    render(<MetricsPanel trace={bellTrace} />);
    expect(screen.getByRole('rowheader', { name: 'Gate count' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'SWAPs inserted' })).toBeTruthy();
    expect(screen.getByText(/Initial layout:/)).toBeTruthy();
  });

  it('ProvenancePanel lists generator, seed, sources, and simplifications', () => {
    render(<ProvenancePanel trace={bellTrace} />);
    expect(screen.getByText('qsimcity-web v1.0.0')).toBeTruthy();
    expect(screen.getByText('component-tests')).toBeTruthy();
    expect(screen.getByText(/In-browser exact statevector simulation/)).toBeTruthy();
    expect(screen.getByText(/never quantum amplitudes/)).toBeTruthy();
  });

  it('ProvenancePanel prompts when no trace is loaded', () => {
    render(<ProvenancePanel trace={null} />);
    expect(screen.getByText(/Run a circuit or import a trace/)).toBeTruthy();
  });

  it('TimelineBar controls playback state', async () => {
    render(<TimelineBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Play replay' }));
    expect(useAppStore.getState().playbackPlaying).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Pause replay' }));
    expect(useAppStore.getState().playbackPlaying).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Step forward one tick' }));
    expect(useAppStore.getState().playbackTick).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Step backward one tick' }));
    expect(useAppStore.getState().playbackTick).toBe(0);
    await userEvent.selectOptions(screen.getByRole('combobox'), '2');
    expect(useAppStore.getState().playbackSpeed).toBe(2);
  });

  it('TimelineBar renders nothing without a trace', () => {
    useAppStore.setState({ trace: null });
    const { container } = render(<TimelineBar />);
    expect(container.firstChild).toBeNull();
  });

  it('EventLog narrates events at the current tick', () => {
    useAppStore.setState({ playbackTick: 1 });
    render(<EventLog trace={bellTrace} />);
    expect(screen.getByText(/Tick 1 of/)).toBeTruthy();
  });

  it('ResultsSection shows counts and exact probabilities', () => {
    render(<ResultsSection trace={bellTrace} />);
    expect(screen.getByRole('group', { name: /Measured counts/ })).toBeTruthy();
    expect(screen.getByText(/Exact probabilities/)).toBeTruthy();
  });

  it('SchedulePanel lists scheduled instructions with the ESTIMATED label', () => {
    useAppStore.setState({ scheduleOpen: true });
    render(<SchedulePanel />);
    expect(screen.getByRole('dialog', { name: 'Instruction schedule' })).toBeTruthy();
    expect(screen.getByText('ESTIMATED')).toBeTruthy();
    expect(screen.getByText(/not measurements of real hardware timing/)).toBeTruthy();
  });

  it('SchedulePanel closes on Escape', async () => {
    useAppStore.setState({ scheduleOpen: true });
    render(<SchedulePanel />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(useAppStore.getState().scheduleOpen).toBe(false);
  });
});

describe('Inspector', () => {
  it('is hidden when closed and prompts when open with no selection', () => {
    const { container } = render(<Inspector />);
    expect(container.firstChild).toBeNull();
    cleanup();
    useAppStore.setState({ inspectorOpen: true });
    render(<Inspector />);
    expect(screen.getByText(/Select a district, building, qubit/)).toBeTruthy();
  });

  it('describes a selected district', () => {
    useAppStore.setState({
      inspectorOpen: true,
      selection: { kind: 'district', districtId: 'qpu-grid' },
    });
    render(<Inspector />);
    expect(screen.getByRole('heading', { name: 'QPU Grid' })).toBeTruthy();
    expect(screen.getByText(/cryogenic heart/)).toBeTruthy();
  });

  it('describes a selected qubit and interactive console', async () => {
    useAppStore.setState({ inspectorOpen: true, selection: { kind: 'qubit', qubit: 2 } });
    render(<Inspector />);
    expect(screen.getByRole('heading', { name: 'Physical qubit 2' })).toBeTruthy();
    cleanup();
    useAppStore.setState({
      inspectorOpen: true,
      selection: { kind: 'interactive', interactiveId: 'noise-readout-dial' },
    });
    render(<Inspector />);
    expect(screen.getByRole('heading', { name: 'Readout Error Dial' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Operate/ }));
    expect(useAppStore.getState().config.noiseEnabled).toBe(true);
  });

  it('describes a selected building', () => {
    useAppStore.setState({
      inspectorOpen: true,
      selection: { kind: 'building', buildingId: 'qpu-grid-landmark', districtId: 'qpu-grid' },
    });
    render(<Inspector />);
    expect(screen.getByRole('heading', { name: 'Cryostat Core' })).toBeTruthy();
    expect(screen.getByText('ILLUSTRATIVE')).toBeTruthy();
  });

  it('closes and clears the selection', async () => {
    useAppStore.setState({
      inspectorOpen: true,
      selection: { kind: 'district', districtId: 'observatory' },
    });
    render(<Inspector />);
    await userEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(useAppStore.getState().inspectorOpen).toBe(false);
    expect(useAppStore.getState().selection).toBeNull();
  });
});

describe('overlays and menus', () => {
  it('HelpOverlay renders the keyboard map and closes', async () => {
    useAppStore.setState({ helpOpen: true });
    render(<HelpOverlay />);
    expect(screen.getByRole('dialog', { name: /Help/ })).toBeTruthy();
    expect(screen.getByText('Keyboard map')).toBeTruthy();
    expect(screen.getByText(/never travels on roads/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Close help' }));
    expect(useAppStore.getState().helpOpen).toBe(false);
  });

  it('CommandPalette filters and runs commands with the keyboard', async () => {
    useAppStore.setState({ paletteOpen: true });
    render(<CommandPalette />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'Compare');
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(1);
    fireEvent.keyDown(input.closest('.command-palette')!, { key: 'Enter' });
    expect(useAppStore.getState().mode).toBe('compare');
    expect(useAppStore.getState().paletteOpen).toBe(false);
  });

  it('CommandPalette navigates with arrows and closes on Escape', async () => {
    useAppStore.setState({ paletteOpen: true });
    render(<CommandPalette />);
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'ArrowUp' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(useAppStore.getState().paletteOpen).toBe(false);
  });

  it('CommandPalette reports when nothing matches', async () => {
    useAppStore.setState({ paletteOpen: true });
    render(<CommandPalette />);
    await userEvent.type(screen.getByRole('combobox'), 'zzzznothing');
    expect(screen.getByText('No matching commands.')).toBeTruthy();
  });

  it('SettingsMenu updates settings and clears local data', async () => {
    render(<SettingsMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.selectOptions(screen.getByLabelText('Visual quality'), 'low');
    expect(useAppStore.getState().settings.quality).toBe('low');
    await userEvent.selectOptions(screen.getByLabelText('Time of day'), 'day');
    expect(useAppStore.getState().settings.dayNight).toBe('day');
    await userEvent.click(screen.getByLabelText(/Reduce motion/));
    expect(useAppStore.getState().settings.reducedMotion).toBe(true);
    await userEvent.click(screen.getByLabelText(/Sound/));
    expect(useAppStore.getState().settings.audioEnabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /Clear locally stored data/ }));
    expect(useAppStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('Toast shows and dismisses messages', async () => {
    useAppStore.setState({ toast: 'Hello there' });
    render(<Toast />);
    expect(screen.getByRole('status').textContent).toContain('Hello there');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(useAppStore.getState().toast).toBeNull();
  });
});

describe('views', () => {
  it('HomeView offers three entry points and the 2D alternative', async () => {
    render(<HomeView />);
    expect(screen.getByRole('heading', { name: /QSimCity/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Guided Tour' }));
    expect(useAppStore.getState().mode).toBe('tour');
    await userEvent.click(screen.getByRole('button', { name: /Use Accessible 2D Mode/ }));
    expect(useAppStore.getState().mode).toBe('accessible-2d');
  });

  it('HomeView announces the WebGL fallback when detection failed', () => {
    useAppStore.setState({ webglAvailable: false });
    render(<HomeView />);
    expect(screen.getByRole('status').textContent).toContain('3D rendering is unavailable');
  });

  it('Accessible2DView prompts before a run and renders panels after', async () => {
    render(<Accessible2DView />);
    expect(screen.getByText(/Run a program or import a trace/)).toBeTruthy();
    cleanup();
    useAppStore.setState({ trace: bellTrace, playbackTick: 3 });
    render(<Accessible2DView />);
    expect(
      screen.getAllByRole('group', { name: 'Input circuit (as written)' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole('group', { name: /Compiled circuit/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('group', { name: /Coupling map/ }).length).toBeGreaterThan(0);
  });

  it('CompareView explains that noise must be enabled to compare', async () => {
    render(<CompareView />);
    expect(screen.getByText(/Noise is currently disabled/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Enable noise' }));
    expect(useAppStore.getState().config.noiseEnabled).toBe(true);
  });

  it('CompareView shows both circuits once a trace exists', () => {
    useAppStore.setState({ trace: bellTrace, config: { ...DEFAULT_CONFIG, noiseEnabled: true } });
    render(<CompareView />);
    expect(screen.getByRole('heading', { name: 'Ideal vs noisy' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Before vs after compilation' })).toBeTruthy();
  });
});

describe('LabControls', () => {
  it('renders the configuration form and updates the store', async () => {
    render(<LabControls />);
    await userEvent.selectOptions(screen.getByLabelText('Sample circuit'), 'ghz-4');
    expect(useAppStore.getState().config.sampleId).toBe('ghz-4');
    await userEvent.selectOptions(screen.getByLabelText('Device topology'), 'ring-8');
    expect(useAppStore.getState().config.deviceId).toBe('ring-8');
    await userEvent.selectOptions(screen.getByLabelText('Initial layout'), 'trivial');
    expect(useAppStore.getState().config.layoutMethod).toBe('trivial');
    await userEvent.click(screen.getByLabelText(/Optimize compiled circuit/));
    expect(useAppStore.getState().config.optimize).toBe(false);
  });

  it('reveals noise sliders when noise is enabled', async () => {
    render(<LabControls />);
    await userEvent.click(screen.getByLabelText(/Enable noise model/));
    expect(screen.getByLabelText(/Readout error/)).toBeTruthy();
    expect(screen.getByLabelText(/Amplitude damping/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Phase damping/), { target: { value: '0.2' } });
    expect(useAppStore.getState().config.noise.phaseDamping).toBeCloseTo(0.2, 6);
  });

  it('shows a parse error with position and keeps the input', async () => {
    render(<LabControls />);
    const editor = screen.getByLabelText(/OpenQASM 2.0 program/);
    fireEvent.change(editor, { target: { value: 'OPENQASM 2.0;\nqreg q[1];\nnope q[0];' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Line 3');
    }, WAIT);
    expect((editor as HTMLTextAreaElement).value).toContain('nope');
  });

  it('disables export until a trace exists', () => {
    render(<LabControls />);
    expect(screen.getByRole('button', { name: 'Export trace' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});

describe('TourOverlay', () => {
  it('renders chapter content and navigates', async () => {
    useAppStore.setState({ mode: 'tour', tourChapter: 0 });
    render(<TourOverlay />);
    expect(screen.getByRole('heading', { name: 'Quantum Program Port' })).toBeTruthy();
    expect(screen.getByText('What you see')).toBeTruthy();
    expect(screen.getByText('How exact is this?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(useAppStore.getState().tourChapter).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: /Previous/ }));
    expect(useAppStore.getState().tourChapter).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    expect(useAppStore.getState().mode).toBe('explore');
  });

  it('selecting a chapter selects its district for camera sync', () => {
    useAppStore.setState({ mode: 'tour', tourChapter: 7 });
    render(<TourOverlay />);
    expect(useAppStore.getState().selection).toEqual({
      kind: 'district',
      districtId: 'translation-refinery',
    });
  });

  it('supports arrow-key chapter navigation', () => {
    useAppStore.setState({ mode: 'tour', tourChapter: 2 });
    render(<TourOverlay />);
    const section = screen.getByRole('region', { name: /Guided tour/ });
    fireEvent.keyDown(section, { key: 'ArrowRight' });
    expect(useAppStore.getState().tourChapter).toBe(3);
    fireEvent.keyDown(section, { key: 'ArrowLeft' });
    expect(useAppStore.getState().tourChapter).toBe(2);
  });
});

describe('ScenarioPanel', () => {
  it('lists all scenarios and shows details when one is active', async () => {
    render(<ScenarioPanel />);
    await userEvent.click(screen.getByRole('button', { name: /Scenarios/ }));
    expect(screen.getByText('SWAP Storm')).toBeTruthy();
    expect(screen.getByText('Variational Gridlock')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Shot Drought/ }));
    expect(useAppStore.getState().activeScenarioId).toBe('shot-drought');
    await vi.waitFor(() => {
      expect(screen.getByText('Expected causal chain')).toBeTruthy();
    }, WAIT);
  });

  it('resets the scenario and restores defaults', async () => {
    useAppStore.setState({ activeScenarioId: 'bell-state' });
    render(<ScenarioPanel />);
    await vi.waitFor(() => expect(screen.getByText('Bell State')).toBeTruthy(), WAIT);
    await userEvent.click(screen.getByRole('button', { name: 'Reset scenario' }));
    expect(useAppStore.getState().activeScenarioId).toBeNull();
  });
});

describe('QASM sample rendering sanity', () => {
  it('renders every bundled sample circuit diagram without error', () => {
    for (const id of ['bell', 'ghz-4', 'teleportation', 'grover-2', 'qft-3', 'toffoli']) {
      const circuit = parseQasm(getSampleCircuit(id).qasm);
      const traceCircuit: TraceCircuit = {
        name: id,
        numQubits: circuit.numQubits,
        numClbits: circuit.numClbits,
        cregs: circuit.cregs.map((r) => ({ name: r.name, size: r.size })),
        instructions: circuit.instructions.map((i) => ({
          id: i.id,
          kind: i.kind,
          name: i.name,
          qubits: [...i.qubits],
          params: [...i.params],
          clbits: [...i.clbits],
          condition: i.condition,
        })),
      };
      const { unmount } = render(<CircuitDiagram circuit={traceCircuit} title={id} />);
      expect(screen.getByRole('group', { name: id })).toBeTruthy();
      unmount();
    }
  });
});
