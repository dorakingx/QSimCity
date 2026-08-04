import { CITY_SCALE, type DistrictId } from './districts.js';

/**
 * In-world interactive equipment (spec §7.4): consoles the user can walk to
 * and operate. Each action is a real product operation dispatched to the
 * application store — never a decorative prop.
 */

export type InteractiveAction =
  | { kind: 'open-lab' }
  | { kind: 'load-sample'; sampleId: string }
  | {
      kind: 'adjust-noise';
      parameter:
        'readoutError' | 'depolarizing1q' | 'depolarizing2q' | 'amplitudeDamping' | 'phaseDamping';
    }
  | { kind: 'adjust-shots' }
  | { kind: 'choose-layout' }
  | { kind: 'choose-device' }
  | { kind: 'toggle-optimization' }
  | { kind: 'open-compare' }
  | { kind: 'open-observatory' }
  | { kind: 'inspect-schedule' }
  | { kind: 'run-scenario'; scenarioId: string }
  | { kind: 'playback-speed' };

export interface Interactive {
  readonly id: string;
  readonly districtId: DistrictId;
  readonly name: string;
  readonly prompt: string;
  readonly position: readonly [number, number];
  readonly action: InteractiveAction;
}

const RAW_INTERACTIVES: readonly Interactive[] = [
  {
    id: 'port-intake-desk',
    districtId: 'program-port',
    name: 'Intake Desk',
    prompt: 'Open the Quantum Lab to load or paste a program',
    position: [-185, 40],
    action: { kind: 'open-lab' },
  },
  {
    id: 'port-sample-crate',
    districtId: 'program-port',
    name: 'Sample Crate: Bell Pair',
    prompt: 'Load the Bell State sample circuit',
    position: [-155, 50],
    action: { kind: 'load-sample', sampleId: 'bell' },
  },
  {
    id: 'foundry-console',
    districtId: 'ir-foundry',
    name: 'Casting Console',
    prompt: 'Load the Toffoli sample and watch it decompose',
    position: [-112, 45],
    action: { kind: 'load-sample', sampleId: 'toffoli' },
  },
  {
    id: 'exchange-layout-desk',
    districtId: 'layout-exchange',
    name: 'Layout Desk',
    prompt: 'Choose automatic or manual initial layout',
    position: [-50, 45],
    action: { kind: 'choose-layout' },
  },
  {
    id: 'transit-switchboard',
    districtId: 'routing-transit',
    name: 'Route Switchboard',
    prompt: 'Choose the device topology routing must respect',
    position: [5, 45],
    action: { kind: 'choose-device' },
  },
  {
    id: 'refinery-valve',
    districtId: 'translation-refinery',
    name: 'Basis Valve',
    prompt: 'Load the QFT sample and watch basis translation',
    position: [58, 70],
    action: { kind: 'load-sample', sampleId: 'qft-3' },
  },
  {
    id: 'works-lever',
    districtId: 'optimization-works',
    name: 'Mill Lever',
    prompt: 'Enable or disable circuit optimization',
    position: [58, 0],
    action: { kind: 'toggle-optimization' },
  },
  {
    id: 'tower-dial',
    districtId: 'scheduling-tower',
    name: 'Chronarch Dial',
    prompt: 'Inspect the instruction schedule',
    position: [113, 40],
    action: { kind: 'inspect-schedule' },
  },
  {
    id: 'qpu-speed-crank',
    districtId: 'qpu-grid',
    name: 'Playback Crank',
    prompt: 'Change replay speed',
    position: [175, 50],
    action: { kind: 'playback-speed' },
  },
  {
    id: 'noise-readout-dial',
    districtId: 'noise-atmosphere',
    name: 'Readout Error Dial',
    prompt: 'Raise or lower readout error',
    position: [175, -40],
    action: { kind: 'adjust-noise', parameter: 'readoutError' },
  },
  {
    id: 'noise-damping-dial',
    districtId: 'noise-atmosphere',
    name: 'Damping Front Dial',
    prompt: 'Raise or lower amplitude damping',
    position: [200, -40],
    action: { kind: 'adjust-noise', parameter: 'amplitudeDamping' },
  },
  {
    id: 'noise-dephase-dial',
    districtId: 'noise-atmosphere',
    name: 'Dephasing Front Dial',
    prompt: 'Raise or lower phase damping',
    position: [225, -40],
    action: { kind: 'adjust-noise', parameter: 'phaseDamping' },
  },
  {
    id: 'harbor-shot-crane',
    districtId: 'measurement-harbor',
    name: 'Shot Crane',
    prompt: 'Change how many shots are collected',
    position: [175, 110],
    action: { kind: 'adjust-shots' },
  },
  {
    id: 'harbor-compare-board',
    districtId: 'measurement-harbor',
    name: 'Comparison Board',
    prompt: 'Open Compare Mode: ideal vs noisy',
    position: [220, 110],
    action: { kind: 'open-compare' },
  },
  {
    id: 'control-loop-panel',
    districtId: 'classical-control',
    name: 'Feedback Loop Panel',
    prompt: 'Run the Dynamic Feed-forward scenario',
    position: [113, 110],
    action: { kind: 'run-scenario', scenarioId: 'dynamic-feedforward' },
  },
  {
    id: 'observatory-lectern',
    districtId: 'observatory',
    name: 'Observatory Lectern',
    prompt: 'Open the Observatory panels',
    position: [-45, 140],
    action: { kind: 'open-observatory' },
  },
];

/** Console positions are authored on the compact grid and scaled with it. */
export const INTERACTIVES: readonly Interactive[] = RAW_INTERACTIVES.map((i) => ({
  ...i,
  position: [i.position[0] * CITY_SCALE, i.position[1] * CITY_SCALE],
}));

export function interactivesInDistrict(districtId: DistrictId): Interactive[] {
  return INTERACTIVES.filter((i) => i.districtId === districtId);
}
