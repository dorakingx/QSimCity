import { getSampleCircuit } from '@qsimcity/domain';
import type { Trace, TraceCircuit } from 'qsimcity-trace';
import { DEFAULT_NOISE, type RunConfig } from '../store/appStore.js';
import type { LearningProgress } from '../store/progress.js';
import { missionText, type LeveledText } from '../content/explanations.js';
import { bellTemplateState, compileBuilderQasm, ghzTemplateState } from '../builder/model.js';

/**
 * The seven playable missions (spec section 7.3). Each mission carries a
 * deterministic configuration, ordered guided steps with objective isDone
 * predicates over the store state (for auto-advance and checkmarks), and a
 * machine-checkable completion condition evaluated against the real trace —
 * the same mechanism scenarios use. No mission invents science: every
 * completion check reads recorded trace events or result sets.
 */

/** The slice of store state mission steps may inspect. */
export interface MissionStepSnapshot {
  readonly config: RunConfig;
  readonly trace: Trace | null;
  readonly playbackTick: number;
  readonly playbackPlaying: boolean;
  readonly progress: LearningProgress;
}

export type ContextualControl = 'pause' | 'step' | 'rewind' | 'undo' | 'reset';

export interface MissionStep {
  readonly id: string;
  /** data-mission-target of the on-screen control this step points at. */
  readonly target: string;
  readonly text: LeveledText;
  readonly isDone: (s: MissionStepSnapshot) => boolean;
}

export interface Mission {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly briefing: LeveledText;
  readonly celebration: LeveledText;
  /** Applied over the current configuration when the mission starts. */
  readonly config: Partial<RunConfig>;
  readonly steps: readonly MissionStep[];
  readonly contextualControls: readonly ContextualControl[];
  /** Whether the mission panel embeds the block builder. */
  readonly usesBuilder: boolean;
  readonly isComplete: (trace: Trace, progress: LearningProgress) => boolean;
}

export const BELL_BUILDER_QASM = compileBuilderQasm(bellTemplateState());
export const GHZ_BUILDER_QASM = compileBuilderQasm(ghzTemplateState());

/**
 * A circuit dense with adjacent inverse pairs, so the optimizer has real
 * work to do in the cleanup mission. The pairs are semantically inert; the
 * surviving core is a Bell preparation.
 */
export const CLEANUP_QASM = `OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
x q[1];
x q[1];
z q[0];
z q[0];
cx q[0],q[1];
x q[1];
x q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];
`;

function hasEvent(trace: Trace, eventType: string): boolean {
  return trace.events.some((e) => e.eventType === eventType);
}

function hasEntanglingGate(circuit: TraceCircuit): boolean {
  return circuit.instructions.some((i) => i.kind === 'gate' && i.qubits.length >= 2);
}

function twoQubitGateCount(circuit: TraceCircuit): number {
  return circuit.instructions.filter((i) => i.kind === 'gate' && i.qubits.length >= 2).length;
}

function sameCounts(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
  }
  return true;
}

function distinctShotsCount(progress: LearningProgress): number {
  return new Set(progress.shotsHistory).size;
}

function step(
  missionId: string,
  stepId: string,
  target: string,
  isDone: (s: MissionStepSnapshot) => boolean,
): MissionStep {
  return { id: stepId, target, text: missionText(missionId).steps[stepId]!, isDone };
}

export const MISSIONS: readonly Mission[] = [
  {
    id: 'bell-pair',
    title: 'Light Up the Twin Towers',
    goal: 'Link two qubits into a Bell pair and watch their answers agree.',
    briefing: missionText('bell-pair').briefing,
    celebration: missionText('bell-pair').celebration,
    config: {
      qasm: BELL_BUILDER_QASM,
      sampleId: null,
      shots: 512,
      seed: 'mission-bell',
      deviceId: 'linear-5',
      noiseEnabled: false,
      layoutMethod: 'interaction',
      optimize: true,
    },
    usesBuilder: true,
    contextualControls: ['pause', 'step', 'rewind', 'undo', 'reset'],
    steps: [
      step(
        'bell-pair',
        'template',
        'builder-bell-template',
        (s) =>
          s.config.sampleId === null &&
          s.config.qasm.includes('h q[0];') &&
          s.config.qasm.includes('cx q[0],q[1];'),
      ),
      step('bell-pair', 'run', 'builder-run', (s) => s.trace !== null),
      step(
        'bell-pair',
        'watch',
        'timeline-play',
        (s) => s.trace !== null && bellPairComplete(s.trace),
      ),
    ],
    isComplete: (trace) => bellPairComplete(trace),
  },
  {
    id: 'ghz',
    title: 'Three of a Kind',
    goal: 'Extend the link to three qubits with a GHZ chain.',
    briefing: missionText('ghz').briefing,
    celebration: missionText('ghz').celebration,
    config: {
      qasm: GHZ_BUILDER_QASM,
      sampleId: null,
      shots: 512,
      seed: 'mission-ghz',
      deviceId: 'linear-5',
      noiseEnabled: false,
      layoutMethod: 'interaction',
      optimize: true,
    },
    usesBuilder: true,
    contextualControls: ['pause', 'step', 'rewind', 'undo', 'reset'],
    steps: [
      step(
        'ghz',
        'build',
        'builder-grid',
        (s) =>
          s.config.qasm.includes('qreg q[3];') &&
          s.config.qasm.includes('cx q[0],q[1];') &&
          s.config.qasm.includes('cx q[1],q[2];'),
      ),
      step(
        'ghz',
        'run',
        'builder-run',
        (s) => s.trace !== null && s.trace.inputCircuit.numQubits === 3,
      ),
      step('ghz', 'check', 'results', (s) => s.trace !== null && ghzComplete(s.trace)),
    ],
    isComplete: (trace) => ghzComplete(trace),
  },
  {
    id: 'long-way-around',
    title: 'The Long Way Around',
    goal: 'Watch far-apart qubits pay for their distance in SWAPs, then choose a better layout.',
    briefing: missionText('long-way-around').briefing,
    celebration: missionText('long-way-around').celebration,
    config: {
      sampleId: 'swap-storm',
      qasm: getSampleCircuit('swap-storm').qasm,
      shots: 256,
      seed: 'mission-longway',
      deviceId: 'linear-5',
      layoutMethod: 'trivial',
      noiseEnabled: false,
      optimize: true,
    },
    usesBuilder: false,
    contextualControls: ['pause', 'step', 'rewind', 'reset'],
    steps: [
      step(
        'long-way-around',
        'setup',
        'lab-sample',
        (s) => s.config.sampleId === 'swap-storm' && s.config.deviceId === 'linear-5',
      ),
      step(
        'long-way-around',
        'run',
        'mission-run',
        (s) => s.trace !== null && hasEvent(s.trace, 'routing.swap_inserted'),
      ),
      step(
        'long-way-around',
        'layout',
        'lab-layout',
        (s) => s.config.layoutMethod === 'interaction',
      ),
      step(
        'long-way-around',
        'rerun',
        'mission-run',
        (s) =>
          s.trace !== null &&
          s.trace.events.some(
            (e) =>
              e.eventType === 'layout.assigned' &&
              (e.payload as { method?: string }).method === 'interaction',
          ),
      ),
    ],
    isComplete: (trace) => hasEvent(trace, 'routing.swap_inserted'),
  },
  {
    id: 'storm',
    title: 'Storm Over the Grid',
    goal: 'Turn on noise and spot the difference between ideal and noisy results.',
    briefing: missionText('storm').briefing,
    celebration: missionText('storm').celebration,
    config: {
      sampleId: 'bell',
      qasm: getSampleCircuit('bell').qasm,
      shots: 1024,
      seed: 'mission-storm',
      deviceId: 'linear-5',
      layoutMethod: 'interaction',
      noiseEnabled: true,
      noise: { ...DEFAULT_NOISE, readoutError: 0.08, depolarizing2q: 0.03 },
      optimize: true,
    },
    usesBuilder: false,
    contextualControls: ['pause', 'step', 'rewind', 'reset'],
    steps: [
      step('storm', 'noise', 'lab-noise', (s) => s.config.noiseEnabled),
      step('storm', 'run', 'mission-run', (s) => s.trace !== null && s.trace.noise !== null),
      step('storm', 'compare', 'results', (s) => s.trace !== null && stormComplete(s.trace)),
    ],
    isComplete: (trace) => stormComplete(trace),
  },
  {
    id: 'courier',
    title: 'Message from the Docks',
    goal: 'Let a measured bit steer a later gate through the classical loop.',
    briefing: missionText('courier').briefing,
    celebration: missionText('courier').celebration,
    config: {
      sampleId: 'dynamic-feedforward',
      qasm: getSampleCircuit('dynamic-feedforward').qasm,
      shots: 512,
      seed: 'mission-courier',
      deviceId: 'linear-5',
      layoutMethod: 'interaction',
      noiseEnabled: false,
      optimize: true,
    },
    usesBuilder: false,
    contextualControls: ['pause', 'step', 'rewind', 'reset'],
    steps: [
      step('courier', 'setup', 'lab-sample', (s) => s.config.sampleId === 'dynamic-feedforward'),
      step(
        'courier',
        'run',
        'mission-run',
        (s) => s.trace !== null && hasEvent(s.trace, 'classical.condition_evaluated'),
      ),
      step('courier', 'play', 'timeline-play', (s) => s.playbackPlaying || s.playbackTick > 0),
    ],
    isComplete: (trace) => hasEvent(trace, 'classical.condition_evaluated'),
  },
  {
    id: 'cleanup',
    title: 'The Great Cleanup',
    goal: 'Watch redundant gates cancel and the circuit get shorter.',
    briefing: missionText('cleanup').briefing,
    celebration: missionText('cleanup').celebration,
    config: {
      sampleId: null,
      qasm: CLEANUP_QASM,
      shots: 256,
      seed: 'mission-cleanup',
      deviceId: 'linear-5',
      layoutMethod: 'interaction',
      noiseEnabled: false,
      optimize: true,
    },
    usesBuilder: false,
    contextualControls: ['pause', 'step', 'rewind', 'reset'],
    steps: [
      step('cleanup', 'optimize', 'lab-optimize', (s) => s.config.optimize),
      step(
        'cleanup',
        'run',
        'mission-run',
        (s) => s.trace !== null && hasEvent(s.trace, 'gate.cancelled'),
      ),
      step('cleanup', 'inspect', 'results', (s) => s.trace !== null && cleanupComplete(s.trace)),
    ],
    isComplete: (trace) => cleanupComplete(trace),
  },
  {
    id: 'count-on-it',
    title: 'Count on It',
    goal: 'Run with few shots and then many, and watch the histogram settle.',
    briefing: missionText('count-on-it').briefing,
    celebration: missionText('count-on-it').celebration,
    config: {
      sampleId: 'bell',
      qasm: getSampleCircuit('bell').qasm,
      shots: 64,
      seed: 'mission-count',
      deviceId: 'linear-5',
      layoutMethod: 'interaction',
      noiseEnabled: false,
      optimize: true,
    },
    usesBuilder: false,
    contextualControls: ['pause', 'step', 'rewind', 'reset'],
    steps: [
      step('count-on-it', 'run-few', 'mission-run', (s) => s.progress.shotsHistory.length >= 1),
      step('count-on-it', 'raise-shots', 'lab-shots', (s) => s.config.shots !== 64),
      step('count-on-it', 'run-again', 'mission-run', (s) => distinctShotsCount(s.progress) >= 2),
    ],
    isComplete: (trace, progress) => trace !== null && distinctShotsCount(progress) >= 2,
  },
];

function bellPairComplete(trace: Trace): boolean {
  return (
    trace.inputCircuit.numQubits === 2 &&
    hasEntanglingGate(trace.inputCircuit) &&
    hasEvent(trace, 'measurement.sampled')
  );
}

function ghzComplete(trace: Trace): boolean {
  return (
    trace.inputCircuit.numQubits === 3 &&
    twoQubitGateCount(trace.inputCircuit) >= 2 &&
    hasEvent(trace, 'measurement.sampled')
  );
}

function stormComplete(trace: Trace): boolean {
  if (trace.noise === null) return false;
  const ideal = trace.results.idealCounts?.counts;
  const noisy = trace.results.noisyCounts?.counts;
  if (!ideal || !noisy) return false;
  return !sameCounts(ideal, noisy);
}

function cleanupComplete(trace: Trace): boolean {
  return hasEvent(trace, 'gate.cancelled');
}

export function getMission(id: string): Mission {
  const mission = MISSIONS.find((m) => m.id === id);
  if (!mission) throw new Error(`Unknown mission: ${id}`);
  return mission;
}

/** Index of the first step whose isDone is false; steps.length when all hold. */
export function currentStepIndex(mission: Mission, snapshot: MissionStepSnapshot): number {
  for (let i = 0; i < mission.steps.length; i++) {
    if (!mission.steps[i]!.isDone(snapshot)) return i;
  }
  return mission.steps.length;
}
