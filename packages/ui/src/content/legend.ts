import type { CertaintyLabel, SourceClassification } from 'qsimcity-trace';

/**
 * The City Legend (spec §5.4, W4.6): every animated entity class in the 3D
 * city, what it represents, what makes it move, and how certain its data
 * is. Nothing moves in the city that is not listed here. Vehicles and
 * people represent instructions, jobs, or classical messages — never
 * amplitudes or quantum states.
 */

export interface LegendEntry {
  readonly id: string;
  readonly name: string;
  /** What the entity stands for. */
  readonly represents: string;
  /** What causes it to appear or move. */
  readonly trigger: string;
  readonly source: SourceClassification;
  readonly certainty: CertaintyLabel;
}

export const LEGEND_ENTRIES: readonly LegendEntry[] = [
  {
    id: 'job-convoy',
    name: 'Job convoy',
    represents:
      'Your program as a job moving through the pipeline. The glowing crate is the compiled circuit being carried between stages — never a quantum state.',
    trigger:
      'Stands at the district whose stage owns the latest event at the current playback tick; scrubbing the timeline repositions it exactly.',
    source: 'reference_compiler',
    certainty: 'COMPUTED',
  },
  {
    id: 'courier-van',
    name: 'Courier vans',
    represents:
      'Classical measurement results on their way to the Classical Control Center for feed-forward decisions. The cargo is the measured bit.',
    trigger:
      'One van departs the Measurement Harbor for each sampled measurement; it arrives when the classical condition is evaluated.',
    source: 'sampled_simulation',
    certainty: 'SAMPLED',
  },
  {
    id: 'logical-banner',
    name: 'Logical qubit banners',
    represents:
      'The persistent identity of each logical qubit (q0, q1, ...) living on a physical pylon. Banners keep their color for the whole run.',
    trigger:
      'The layout stage assigns banners to pylons; a SWAP makes two banners fly between pylons at the same tick the inspector reports the exchange.',
    source: 'reference_compiler',
    certainty: 'COMPUTED',
  },
  {
    id: 'qpu-lights',
    name: 'Pylon and bridge lights',
    represents:
      'Physical qubits (pylons) and couplers (bridges) on the device. A lit bridge is a two-qubit gate firing between those physical qubits.',
    trigger: 'Gate-executed events at the current tick, on physical qubit identities only.',
    source: 'exact_simulation',
    certainty: 'EXACT',
  },
  {
    id: 'harbor-stacks',
    name: 'Harbor container stacks',
    represents:
      'The live counts histogram: one container per representative measured record, stacked by bitstring on the results dock.',
    trigger:
      'Each sampled measurement adds to a stack; grey containers are shots still being measured mid-circuit.',
    source: 'sampled_simulation',
    certainty: 'SAMPLED',
  },
  {
    id: 'district-glow',
    name: 'District accent glow',
    represents:
      'Which pipeline stage is working right now: each district’s accent architecture brightens while its events fire.',
    trigger: 'Any trace event of that district’s stage at the current tick.',
    source: 'reference_compiler',
    certainty: 'COMPUTED',
  },
  {
    id: 'noise-weather',
    name: 'Noise weather',
    represents:
      'The configured noise model as weather over the QPU Grid: cloud cover scales with channel strengths; rain falls while noise events fire.',
    trigger:
      'Cloud cover derives from the run’s noise parameters; rain appears exactly at ticks with noise-applied events.',
    source: 'sampled_simulation',
    certainty: 'COMPUTED',
  },
  {
    id: 'ambient-car',
    name: 'Ambient traffic',
    represents:
      'Background city life so streets read as inhabited. It carries no scientific meaning at all.',
    trigger:
      'Deterministic loops on the arterial roads; paused entirely when reduced motion is on.',
    source: 'illustrative',
    certainty: 'ILLUSTRATIVE',
  },
  {
    id: 'pedestrian',
    name: 'District workers',
    represents:
      'Walking figures near each district’s landmark. Their number grows with the district’s current activity; their paths mean nothing.',
    trigger:
      'Density follows events at the current tick (computed); the walking loops themselves are illustrative.',
    source: 'illustrative',
    certainty: 'ILLUSTRATIVE',
  },
  {
    id: 'district-pulse',
    name: 'District pulse rings',
    represents: 'A momentary highlight helping the eye find the district that just became active.',
    trigger: 'Fires when a district’s stage produces events at the tick; purely presentational.',
    source: 'illustrative',
    certainty: 'ILLUSTRATIVE',
  },
  {
    id: 'city-ambience',
    name: 'Clouds, water, and trees',
    represents:
      'Static scenery: drifting clouds, the sea, street trees. Pure atmosphere with no data behind it.',
    trigger: 'Always present; motion is time-based only and stops under reduced motion.',
    source: 'illustrative',
    certainty: 'ILLUSTRATIVE',
  },
];
