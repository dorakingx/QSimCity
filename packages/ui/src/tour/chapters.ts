import type { DistrictId } from '@qsimcity/world';

/**
 * Guided Tour content (spec §7.2): 16 chapters, each stating what is on
 * screen, what it represents, and exactly how much of it is exact,
 * computed, sampled, estimated, or illustrative.
 */

export interface TourChapter {
  readonly id: string;
  readonly title: string;
  /** District the camera flies to and the 2D view highlights. */
  readonly districtId: DistrictId;
  readonly see: string;
  readonly represents: string;
  readonly exactness: string;
  readonly why: string;
}

export const TOUR_CHAPTERS: readonly TourChapter[] = [
  {
    id: 'port',
    title: 'Quantum Program Port',
    districtId: 'program-port',
    see: 'Ships docked at the western harbor, each carrying a program manifest. The Intake Desk console opens the Quantum Lab.',
    represents:
      'The entry point of every computation: OpenQASM text you paste, a bundled sample, or an imported trace file.',
    exactness:
      'The harbor scenery is ILLUSTRATIVE. The program text and its parsed structure are EXACT — they are the real input, hashed into the trace for provenance.',
    why:
      'Everything downstream is determined by this input. Reproducibility starts with hashing exactly what arrived at the port.',
  },
  {
    id: 'logical-qubits',
    title: 'Logical Qubits',
    districtId: 'program-port',
    see: 'Numbered manifest lines on the docked ship — one per logical qubit declared by the program.',
    represents:
      'Logical qubits: the named workers of your algorithm, before any decision about which physical hardware qubit will host them.',
    exactness:
      'The count and indices are EXACT (parsed from your program). The ship metaphor is ILLUSTRATIVE — logical qubits are mathematical labels, not objects.',
    why:
      'Keeping logical and physical qubits distinct is the single most important habit for reading compiler output.',
  },
  {
    id: 'normalization',
    title: 'Circuit Normalization',
    districtId: 'ir-foundry',
    see: 'The Foundry furnaces glowing as the program is recast. The event log lists circuit.normalized and gate.decomposed events.',
    represents:
      'Parsing and normalization: composite gates (like the Toffoli) expand into elementary operations the rest of the pipeline understands.',
    exactness:
      'The decomposition sequence is COMPUTED by the reference compiler and is verified to preserve the circuit’s unitary semantics. The furnace is ILLUSTRATIVE.',
    why:
      'Compilers reason over a small vocabulary. Normalization is why a 3-qubit gate becomes a longer but equivalent story in 1- and 2-qubit words.',
  },
  {
    id: 'initial-layout',
    title: 'Initial Layout',
    districtId: 'layout-exchange',
    see: 'The Assignment Hall floor, where logical qubit tags are matched to physical pylon numbers. The Inspector shows the chosen mapping.',
    represents:
      'The initial layout: which physical qubit hosts each logical qubit at the start of execution.',
    exactness:
      'The mapping is COMPUTED (deterministic heuristic, or your manual choice). Its quality is judged later by real SWAP counts, not by promises.',
    why:
      'A poor initial layout forces extra routing. You can test this causally: switch the Layout Desk to trivial and rerun a long-range circuit.',
  },
  {
    id: 'topology',
    title: 'Physical Qubit Topology',
    districtId: 'qpu-grid',
    see: 'The pylons of the QPU Grid and the bridges between them — the device’s coupling map made walkable.',
    represents:
      'The physical device topology: two-qubit gates can only fire across existing bridges.',
    exactness:
      'The topology is EXACT for the selected device model (the same graph the compiler and the Qiskit bridge use). The pylon architecture is ILLUSTRATIVE.',
    why:
      'Topology is the constraint that makes compilation interesting: algorithms assume any-to-any, hardware disagrees.',
  },
  {
    id: 'routing',
    title: 'Routing',
    districtId: 'routing-transit',
    see: 'Signal lights tracing a path across the rail yard when a long-range interaction is requested. route.selected events appear in the log.',
    represents:
      'Route selection: the shortest path between two distant physical qubits, found on the real coupling graph.',
    exactness:
      'Paths are COMPUTED (deterministic breadth-first search). The rail metaphor is ILLUSTRATIVE — nothing physical travels; the mapping table changes.',
    why:
      'Every hop on this path becomes a SWAP. Distance on the coupling map is the currency routing spends.',
  },
  {
    id: 'swap',
    title: 'SWAP Insertion',
    districtId: 'routing-transit',
    see: 'SWAP cars exchanging two platform labels, and routing.swap_inserted events with the physical qubits involved.',
    represents:
      'SWAP gates that exchange which logical qubit lives on which physical qubit, bringing interaction partners adjacent.',
    exactness:
      'SWAP positions and counts are COMPUTED and appear one-for-one in the compiled circuit. Each SWAP costs three CX gates after translation — that arithmetic is EXACT.',
    why:
      'SWAPs are pure overhead: they add error exposure without advancing the algorithm. Compare SWAP counts across devices in Compare Mode.',
  },
  {
    id: 'translation',
    title: 'Basis Translation',
    districtId: 'translation-refinery',
    see: 'The cracking column refining every gate into the native dialect. gate.translated events list the basis: rz, sx, x, cx.',
    represents:
      'Translation into the gate set the hardware natively implements, via ZYZ Euler decomposition for single-qubit gates.',
    exactness:
      'The translation is COMPUTED and tested for unitary equivalence up to global phase. The refinery is ILLUSTRATIVE.',
    why:
      'What you write is not what runs. Reading compiled output requires knowing the native basis the machine speaks.',
  },
  {
    id: 'optimization',
    title: 'Circuit Optimization',
    districtId: 'optimization-works',
    see: 'The mill grinding away redundant gates; gate.cancelled events count the removals, and the metrics panel shows depth shrinking.',
    represents:
      'Peephole optimization: adjacent inverse pairs cancel, rotations merge, zero-rotations vanish.',
    exactness:
      'Every cancellation is COMPUTED and semantics-preserving (verified by equivalence tests). The before/after metric deltas are EXACT counts.',
    why:
      'Shorter circuits finish sooner and meet less noise. Toggle the Mill Lever off and rerun to see the cost of skipping this stage.',
  },
  {
    id: 'scheduling',
    title: 'Scheduling',
    districtId: 'scheduling-tower',
    see: 'The Chronarch Tower assigning start times; the Schedule panel lists every instruction’s start and model duration.',
    represents:
      'ASAP scheduling: independent gates run in parallel lanes; dependent gates wait for their qubits.',
    exactness:
      'The schedule is ESTIMATED from model gate durations. It teaches parallelism honestly but is not hardware timing — replay pacing is separate presentation time.',
    why:
      'Idle qubits still decohere. Understanding the schedule explains why depth, not gate count, is the enemy.',
  },
  {
    id: 'execution',
    title: 'QPU Execution',
    districtId: 'qpu-grid',
    see: 'Pylons lighting as gates fire; coupling bridges flashing for two-qubit gates, in step with the timeline.',
    represents:
      'Execution of the circuit: the statevector simulator applying each gate in sequence.',
    exactness:
      'Amplitude evolution is EXACT (statevector math, cross-validated against Qiskit). The light show is ILLUSTRATIVE — internal quantum state is not observable like this on real hardware.',
    why:
      'This is the honest version of the “quantum computer working” picture: a simulation you may inspect completely, clearly labeled as such.',
  },
  {
    id: 'noise',
    title: 'Noise',
    districtId: 'noise-atmosphere',
    see: 'Weather fronts over the grid when noise is enabled; noise.applied events report which channel fired on which qubit.',
    represents:
      'Noise channels: readout error, depolarizing, amplitude damping, phase damping — applied by the trajectory method.',
    exactness:
      'Each recorded noise event is SAMPLED (one Kraus branch, seeded and reproducible). Ensemble statistics converge to the channel; a single trajectory is one possible history.',
    why:
      'Noise is why quantum computing is hard. Turn the dials at the weather station and watch distributions smear in Compare Mode.',
  },
  {
    id: 'measurement',
    title: 'Measurement',
    districtId: 'measurement-harbor',
    see: 'Containers landing on the dock as qubits are measured; measurement.sampled events carry the representative outcomes.',
    represents:
      'Measurement collapse: each shot yields one classical bitstring, drawn from the state’s probability distribution.',
    exactness:
      'Outcomes are SAMPLED with a recorded seed. The underlying probabilities (shown in the Observatory) are EXACT for noise-free circuits.',
    why:
      'Quantum programs do not output states; they output samples. Everything you learn from a quantum computer arrives through this dock.',
  },
  {
    id: 'statistics',
    title: 'Shot Statistics',
    districtId: 'measurement-harbor',
    see: 'Container stacks forming the histogram; the results panel reports counts, fractions, and a sampling-uncertainty note.',
    represents:
      'Aggregated counts over all shots, the statistical evidence a quantum computation produces.',
    exactness:
      'Counts are SAMPLED; their agreement with EXACT probabilities is limited by shot noise of roughly 1/√shots. The uncertainty note is that arithmetic, stated plainly.',
    why:
      'Run the Shot Drought scenario: with too few shots, even a perfect computer looks noisy. Statistics is part of the machine.',
  },
  {
    id: 'feedback',
    title: 'Classical Feedback',
    districtId: 'classical-control',
    see: 'Messages racing along elevated conduits from the Harbor back to the Grid; classical.condition_evaluated events tell you which conditions fired.',
    represents:
      'Feed-forward: mid-circuit measurement results steering later gates, the mechanism behind teleportation and dynamic circuits.',
    exactness:
      'Condition evaluations are SAMPLED per trajectory (they depend on measured bits) and each recorded decision is the real one taken by the seeded run.',
    why:
      'This loop — measure, decide, act — is what makes quantum computers computers rather than physics demonstrations.',
  },
  {
    id: 'comparison',
    title: 'Result Comparison',
    districtId: 'observatory',
    see: 'The Observatory dome with both histograms side by side: solid ideal bars against hatched noisy bars, each labeled with its certainty.',
    represents:
      'The scientific conclusion: how noise, layout, routing, and shot count moved your results away from the ideal.',
    exactness:
      'Ideal exact probabilities are EXACT; both count sets are SAMPLED; compiled-circuit metrics are COMPUTED. Nothing on this dais is unlabeled.',
    why:
      'Comparison is how every claim in QSimCity is kept honest — and how you will reason about real quantum hardware. This concludes the tour; the whole city is now yours to explore.',
  },
];
