import type { CertaintyLabel, SourceClassification } from 'qsimcity-trace';

/**
 * The City Legend (spec §5.4, W4.6): every animated entity class in the 3D
 * city, what it represents, what makes it move, and how certain its data
 * is. Nothing moves in the city that is not listed here. Vehicles and
 * people represent instructions, jobs, or classical messages — never
 * amplitudes or quantum states.
 *
 * Each entry carries a child-register variant so the one overlay that
 * explains what a young learner literally sees moving is readable at the
 * child explanation level too.
 */

export interface LegendEntry {
  readonly id: string;
  readonly name: string;
  /** What the entity stands for. */
  readonly represents: string;
  /** The same meaning in child-register language. */
  readonly childRepresents: string;
  /** What causes it to appear or move. */
  readonly trigger: string;
  /** The same trigger in child-register language. */
  readonly childTrigger: string;
  readonly source: SourceClassification;
  readonly certainty: CertaintyLabel;
  /**
   * Certainty during a noisy trajectory replay, when it differs: which
   * gates fire at which tick can depend on sampled outcomes there.
   */
  readonly noisyCertainty?: CertaintyLabel;
}

export const LEGEND_ENTRIES: readonly LegendEntry[] = [
  {
    id: 'job-convoy',
    name: 'Job convoy',
    represents:
      'Your program as a job moving through the pipeline. The glowing crate is the compiled circuit being carried between stages — never a quantum state.',
    childRepresents:
      'The glowing truck carries your program like a package. It is the recipe, not the quantum magic itself.',
    trigger:
      'Stands at the most advanced pipeline stage the replay has reached by the current tick; scrubbing the timeline repositions it exactly.',
    childTrigger: 'It drives to the next building when your program finishes a step.',
    source: 'reference_compiler',
    certainty: 'COMPUTED',
  },
  {
    id: 'courier-van',
    name: 'Courier vans',
    represents:
      'Classical measurement results on their way to the Classical Control Center for feed-forward decisions. The cargo is the measured bit.',
    childRepresents:
      'Little vans deliver the answers (0 or 1) that come out of the measurement machines.',
    trigger:
      'One van departs the Measurement Harbor for each sampled measurement. When the run evaluates a classical condition, that evaluation completes the delivery; otherwise a short fixed journey paces it.',
    childTrigger: 'A van leaves every time a measurement happens.',
    source: 'sampled_simulation',
    certainty: 'SAMPLED',
  },
  {
    id: 'logical-banner',
    name: 'Logical qubit banners',
    represents:
      'The persistent identity of each logical qubit (q0, q1, ...) living on a physical pylon. Banners keep their color for the whole run.',
    childRepresents:
      'Each flag is a qubit’s name tag. The flag moves house when two qubits trade places.',
    trigger:
      'The layout stage assigns banners to pylons; a SWAP makes two banners fly between pylons at the same tick the inspector reports the exchange.',
    childTrigger: 'Flags swap towers exactly when the story says two qubits swapped.',
    source: 'reference_compiler',
    certainty: 'COMPUTED',
  },
  {
    id: 'qpu-lights',
    name: 'Pylon and bridge lights',
    represents:
      'Physical qubits (pylons) and couplers (bridges) on the device. A lit bridge is a two-qubit gate firing between those physical qubits. In an ideal replay the schedule of lights is exact; in a noisy replay it follows the sampled trajectory.',
    childRepresents:
      'Towers light up when a qubit is working. A lit bridge means two are working together.',
    trigger: 'Gate-executed events at the current tick, on physical qubit identities only.',
    childTrigger: 'A light turns on at the exact moment that step runs.',
    source: 'exact_simulation',
    certainty: 'EXACT',
    noisyCertainty: 'SAMPLED',
  },
  {
    id: 'harbor-stacks',
    name: 'Harbor container stacks',
    represents:
      'The live counts histogram: one container per representative measured record, stacked by bitstring on the results dock.',
    childRepresents:
      'Boxes pile up at the harbor. Each pile counts how many times one answer came out.',
    trigger:
      'Each sampled measurement adds to a stack; grey containers are shots still being measured mid-circuit.',
    childTrigger: 'A new box lands every time an answer is measured.',
    source: 'sampled_simulation',
    certainty: 'SAMPLED',
  },
  {
    id: 'district-glow',
    name: 'District accent glow',
    represents:
      'Which pipeline stage is working right now: each district’s accent architecture brightens while its events fire.',
    childRepresents: 'The neighborhood doing the work right now glows brighter.',
    trigger: 'Any trace event of that district’s stage at the current tick.',
    childTrigger: 'It glows while your program is inside that neighborhood.',
    source: 'reference_compiler',
    certainty: 'COMPUTED',
  },
  {
    id: 'noise-weather',
    name: 'Noise clouds',
    represents:
      'The configured noise model as cloud cover over the QPU Grid: coverage scales with the run’s configured channel strengths, before any sampling happens.',
    childRepresents: 'Clouds gather when the machine is set to be a bit unreliable.',
    trigger: 'Cloud cover derives from the run’s noise parameters; no noise model, no clouds.',
    childTrigger: 'Turning up the noise setting brings more clouds.',
    source: 'estimated',
    certainty: 'ESTIMATED',
  },
  {
    id: 'noise-rain',
    name: 'Noise rain',
    represents:
      'Sampled noise actually striking the run: rain falls over the QPU Grid only while noise-applied events fire in the trajectory.',
    childRepresents: 'Rain falls at the exact moments the noise really hits your program.',
    trigger: 'Noise-applied events at the current tick of the noisy replay.',
    childTrigger: 'Each raindrop moment matches a real noise hit in the story.',
    source: 'sampled_simulation',
    certainty: 'SAMPLED',
  },
  {
    id: 'ambient-car',
    name: 'Ambient traffic',
    represents:
      'Background city life so streets read as inhabited. It carries no scientific meaning at all.',
    childRepresents: 'Just city cars driving around. They mean nothing about your program.',
    trigger:
      'Deterministic loops on the arterial roads; removed entirely when reduced motion is on, leaving the streets empty rather than holding cars still.',
    childTrigger: 'They drive in loops all day, that is all.',
    source: 'illustrative',
    certainty: 'ILLUSTRATIVE',
  },
  {
    id: 'pedestrian',
    name: 'District workers',
    represents:
      'Walking figures near each district’s landmark. Their number grows with the district’s current activity; their paths mean nothing.',
    childRepresents: 'More workers appear where the city is busy. Where they walk means nothing.',
    trigger:
      'Density follows events at the current tick (computed); the walking loops themselves are illustrative.',
    childTrigger: 'Busy neighborhoods get more walkers.',
    source: 'illustrative',
    certainty: 'ILLUSTRATIVE',
  },
  {
    id: 'sidewalk-stroller',
    name: 'Sidewalk strollers',
    represents:
      'People walking the pavements of the main roads so the streets you can walk down read as inhabited. Their number carries no signal whatsoever.',
    childRepresents: 'People out walking. They are just going about their day.',
    trigger:
      'Fixed walkers pacing each arterial pavement on deterministic paths; removed entirely when reduced motion is on, leaving the pavements empty rather than holding figures still.',
    childTrigger: 'They walk up and down the street all day.',
    source: 'illustrative',
    certainty: 'ILLUSTRATIVE',
  },
  {
    id: 'program-ship',
    name: 'Arriving program ship',
    represents:
      'Your program reaching the city. The ship stands off in open water until the run starts, then sails in and berths at the Program Port pier.',
    childRepresents:
      'A ship brings your program into the city. It docks when your program arrives.',
    trigger:
      'Its position interpolates toward the pier once the trace reaches the input and parse stages, and sails back out when you scrub before them.',
    childTrigger: 'It sails in when your program starts, and back out when you rewind.',
    source: 'reference_compiler',
    certainty: 'COMPUTED',
  },
  {
    id: 'refinery-steam',
    name: 'Refinery steam',
    represents:
      'The Basis Refinery working. Steam rises from the stacks while your gates are being rewritten into the machine’s own gate set.',
    childRepresents:
      'Steam puffs from the factory while your gates are being changed into the machine’s gates.',
    trigger: 'Rises while translation-stage events fire at the current tick; still otherwise.',
    childTrigger: 'It puffs while the gate factory is busy.',
    source: 'reference_compiler',
    certainty: 'COMPUTED',
  },
  {
    id: 'scheduling-beacon',
    name: 'Scheduling Tower beacon',
    represents:
      'The Scheduling Tower deciding when each operation runs. The beacon sweeps while scheduling is in progress.',
    childRepresents: 'The tower’s light spins while the city works out the timing.',
    trigger:
      'Rotates while scheduling-stage events fire at the current tick; held still under reduced motion.',
    childTrigger: 'It spins when the timing is being worked out.',
    source: 'reference_compiler',
    certainty: 'COMPUTED',
  },
  {
    id: 'observatory-beam',
    name: 'Observatory beam',
    represents:
      'The Results Observatory reporting that the run finished. The beam appears once the result stage is reached.',
    childRepresents: 'A beam of light switches on when your answers are ready.',
    trigger: 'Appears once the trace reaches the result stage at or before the current tick.',
    childTrigger: 'It lights up when the results arrive.',
    source: 'reference_compiler',
    certainty: 'COMPUTED',
  },
  {
    id: 'district-pulse',
    name: 'District pulse rings',
    represents: 'A momentary highlight helping the eye find the district that just became active.',
    childRepresents: 'A ring flashes to show you where to look next.',
    trigger: 'Fires when a district’s stage produces events at the tick; purely presentational.',
    childTrigger: 'It flashes when a neighborhood starts working.',
    source: 'illustrative',
    certainty: 'ILLUSTRATIVE',
  },
  {
    id: 'city-ambience',
    name: 'Clouds, water, and trees',
    represents:
      'Static scenery: drifting clouds, the sea, street trees. Pure atmosphere with no data behind it.',
    childRepresents: 'The sky, sea, and trees are just scenery, like in a picture book.',
    trigger: 'Always present; motion is time-based only and stops under reduced motion.',
    childTrigger: 'They are always there, gently moving.',
    source: 'illustrative',
    certainty: 'ILLUSTRATIVE',
  },
];
