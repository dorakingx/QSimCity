import type {
  CertaintyLabel,
  SourceClassification,
  TraceEvent,
  TraceEventType,
} from 'qsimcity-trace';

/**
 * Central store of leveled prose (spec section 7.4). Every learner-facing
 * text surface — event narration, tour chapters, the certainty and source
 * glossary, and mission text — provides child, beginner, and expert
 * variants. Child text uses short concrete sentences and no jargon; expert
 * text uses current terminology. Scientific labels are never removed at any
 * level; the child level explains them in plain words instead.
 */

export type ExplanationLevel = 'child' | 'beginner' | 'expert';

export const EXPLANATION_LEVELS: readonly ExplanationLevel[] = ['child', 'beginner', 'expert'];

export interface LeveledText {
  readonly child: string;
  readonly beginner: string;
  readonly expert: string;
}

type EventNarrator = (ev: TraceEvent) => string;

type LeveledNarrators = Readonly<Record<ExplanationLevel, EventNarrator>>;

function payloadOf(ev: TraceEvent): Record<string, unknown> {
  return ev.payload as Record<string, unknown>;
}

/**
 * Narration for every trace event type at every level. The beginner level is
 * the classic QSimCity narration; the child level is short and concrete; the
 * expert level names the underlying mechanism.
 */
export const EVENT_EXPLANATIONS: Readonly<Record<TraceEventType, LeveledNarrators>> = {
  'program.loaded': {
    child: (ev) => {
      const p = payloadOf(ev);
      return `A program ship arrived. It brought ${String(p['numQubits'] ?? '?')} qubits of work.`;
    },
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Program loaded: ${String(p['numQubits'] ?? '?')} qubits, ${String(p['instructions'] ?? '?')} instructions.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Ingested OpenQASM source: ${String(p['numQubits'] ?? '?')} qubits and ${String(p['instructions'] ?? '?')} instructions; the input text is hashed into the trace for provenance.`;
    },
  },
  'program.parsed': {
    child: () => 'We read the program. Now the city understands it.',
    beginner: () => 'Program parsed into the intermediate representation.',
    expert: () =>
      'Source parsed into the intermediate representation: registers flattened, gate references resolved, conditions attached.',
  },
  'circuit.normalized': {
    child: () => 'Big steps became small steps. Small steps are easier to run.',
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Circuit normalized to ${String(p['instructionCount'] ?? '?')} elementary instructions.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Normalization emitted ${String(p['instructionCount'] ?? '?')} elementary instructions; composite gates are expanded before layout so later passes reason over a fixed vocabulary.`;
    },
  },
  'gate.decomposed': {
    child: (ev) => {
      const p = payloadOf(ev);
      return `One big ${String(p['gate'] ?? '?')} gate became small gates.`;
    },
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Composite gate ${String(p['gate'] ?? '?')} decomposed into ${String(p['expandedInto'] ?? '?')} elementary gates.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Decomposed ${String(p['gate'] ?? '?')} into ${String(p['expandedInto'] ?? '?')} elementary gates; the expansion preserves the circuit semantics exactly.`;
    },
  },
  'layout.assigned': {
    child: () => 'Every qubit got a home on the chip. The map shows who lives where.',
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Initial layout assigned (${String(p['method'] ?? '?')}): logical qubits placed on physical qubits ${JSON.stringify(p['layout'] ?? [])}.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Initial layout via the ${String(p['method'] ?? '?')} method: logical-to-physical map ${JSON.stringify(p['layout'] ?? [])}. Layout quality is judged later by real SWAP counts.`;
    },
  },
  'route.selected': {
    child: () => 'We picked a path across the chip. Friends need to reach each other.',
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Route selected across physical qubits ${JSON.stringify(p['path'] ?? [])}.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Shortest path selected on the coupling graph via breadth-first search: ${JSON.stringify(p['path'] ?? [])}. Every intermediate hop will cost a SWAP.`;
    },
  },
  'routing.swap_inserted': {
    child: () => 'Two qubits traded homes. Now the right pair sits together.',
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `SWAP inserted between physical qubits ${JSON.stringify(p['physicalQubits'] ?? ev.physicalQubits)}.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `SWAP inserted on physical pair ${JSON.stringify(p['physicalQubits'] ?? ev.physicalQubits)}; the logical-to-physical permutation composes with this transposition, and each SWAP costs three CX after translation.`;
    },
  },
  'gate.translated': {
    child: () => 'The gates were rewritten in machine words. The machine only speaks a few words.',
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Gates translated to the native basis {${(p['basisGates'] as string[] | undefined)?.join(', ') ?? '?'}}.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Rebased onto the native gate set {${(p['basisGates'] as string[] | undefined)?.join(', ') ?? '?'}} using ZYZ Euler decomposition for single-qubit gates; equivalence holds up to global phase.`;
    },
  },
  'gate.cancelled': {
    child: (ev) => {
      const p = payloadOf(ev);
      return `Some gates undid each other. We removed ${String(p['cancelledCount'] ?? '?')} of them.`;
    },
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Cancelled ${String(p['cancelledCount'] ?? '?')} redundant gates.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Peephole optimization removed ${String(p['cancelledCount'] ?? '?')} gates: adjacent inverse pairs and null rotations cancel without changing the circuit semantics.`;
    },
  },
  'circuit.optimized': {
    child: () => 'Cleanup done. The circuit is shorter now.',
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Optimization complete: ${String(p['instructionCount'] ?? p['passCount'] ?? '?')} instructions remain.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Optimization reached a fixpoint with ${String(p['instructionCount'] ?? p['passCount'] ?? '?')} instructions remaining; shorter circuits accumulate less error exposure.`;
    },
  },
  'instruction.scheduled': {
    child: () => 'This step got its start time. Steps that can, run side by side.',
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Instruction scheduled at ${String(p['startNs'] ?? '?')} ns (model duration ${String(p['durationNs'] ?? '?')} ns).`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `ASAP-scheduled at t = ${String(p['startNs'] ?? '?')} ns with model duration ${String(p['durationNs'] ?? '?')} ns; these are model estimates, not hardware timing.`;
    },
  },
  'execution.started': {
    child: (ev) => {
      const p = payloadOf(ev);
      return `The run started. The machine will try ${String(p['shots'] ?? '?')} times.`;
    },
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Execution started: ${String(p['shots'] ?? '?')} shots${p['noisy'] ? ' with noise' : ''}.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Statevector execution begun for ${String(p['shots'] ?? '?')} shots${p['noisy'] ? ', with trajectory-method noise sampling' : ''}; the replay follows one representative trajectory.`;
    },
  },
  'gate.executed': {
    child: (ev) => {
      const p = payloadOf(ev);
      return `The ${String(p['gate'] ?? '?')} gate fired. The qubits changed.`;
    },
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Gate ${String(p['gate'] ?? '?')} executed on qubit(s) ${ev.logicalQubits.join(', ')}${p['phase'] === 'noisy' ? ' (noisy pass)' : ''}.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Applied ${String(p['gate'] ?? '?')} to qubit(s) ${ev.logicalQubits.join(', ')}${p['phase'] === 'noisy' ? ' during the noisy pass' : ''}; the simulator multiplied the state by the gate unitary.`;
    },
  },
  'noise.applied': {
    child: () => 'A gust of noise hit a qubit. It may cause a mistake.',
    beginner: (ev) => {
      const p = payloadOf(ev);
      const kind = String(p['kind'] ?? 'noise');
      return `Noise event: ${kind.replace(/_/g, ' ')} on qubit ${ev.logicalQubits.join(', ')}.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      const kind = String(p['kind'] ?? 'noise');
      return `Sampled a ${kind.replace(/_/g, ' ')} Kraus branch on qubit ${ev.logicalQubits.join(', ')}; single trajectories differ, the ensemble converges to the channel.`;
    },
  },
  'measurement.sampled': {
    child: (ev) => {
      const p = payloadOf(ev);
      return `We looked at qubit ${ev.logicalQubits.join(', ')}. It answered ${String(p['outcome'] ?? '?')}.`;
    },
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Qubit ${ev.logicalQubits.join(', ')} measured: representative outcome ${String(p['outcome'] ?? '?')} into classical bit ${String(p['clbit'] ?? '?')}${p['readoutFlipped'] ? ' (readout error flipped it)' : ''}.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Projective measurement of qubit ${ev.logicalQubits.join(', ')}: outcome ${String(p['outcome'] ?? '?')} recorded to classical bit ${String(p['clbit'] ?? '?')}${p['readoutFlipped'] ? ', flipped by the sampled readout error' : ''}; drawn from the state distribution with the recorded seed.`;
    },
  },
  'classical.condition_evaluated': {
    child: (ev) => {
      const p = payloadOf(ev);
      return p['satisfied']
        ? 'The message said yes. So the waiting gate fired.'
        : 'The message said no. So the waiting gate stayed quiet.';
    },
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Classical condition ${String(p['creg'] ?? '?')} == ${String(p['expected'] ?? '?')} evaluated: register held ${String(p['actual'] ?? '?')}, so the operation ${p['satisfied'] ? 'fired' : 'was skipped'}.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Feed-forward condition ${String(p['creg'] ?? '?')} == ${String(p['expected'] ?? '?')}: the register held ${String(p['actual'] ?? '?')}, so the conditioned operation was ${p['satisfied'] ? 'applied to the state' : 'omitted from this trajectory'}.`;
    },
  },
  'optimizer.iteration_started': {
    child: () => 'The helper computer tried a new guess.',
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Variational optimizer iteration ${String(p['iteration'] ?? '?')} started.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `VQE iteration ${String(p['iteration'] ?? '?')}: the classical optimizer proposed new ansatz parameters for evaluation.`;
    },
  },
  'optimizer.iteration_completed': {
    child: () => 'The guess got a score. The helper keeps the best one.',
    beginner: (ev) => {
      const p = payloadOf(ev);
      return `Optimizer iteration ${String(p['iteration'] ?? '?')} completed: energy ${String(p['energy'] ?? '?')}.`;
    },
    expert: (ev) => {
      const p = payloadOf(ev);
      return `Iteration ${String(p['iteration'] ?? '?')} energy estimate ${String(p['energy'] ?? '?')}: a sampled expectation value, so shot noise blurs the optimization landscape.`;
    },
  },
  'mitigation.applied': {
    child: () => 'We tidied the answers a little at the end.',
    beginner: () => 'Error mitigation applied to the results.',
    expert: () =>
      'Error mitigation applied to the aggregate distribution; mitigation post-processes counts and is labeled distinctly from raw results.',
  },
  'execution.completed': {
    child: () => 'The run finished. The results are in.',
    beginner: () => 'Execution completed.',
    expert: () =>
      'Execution complete; all events, metrics, and result sets are frozen into the immutable trace.',
  },
};

/** Leveled narration for a trace event. */
export function explainEvent(ev: TraceEvent, level: ExplanationLevel): string {
  return EVENT_EXPLANATIONS[ev.eventType][level](ev);
}

/**
 * Leveled summaries for every guided-tour chapter, keyed by chapter id.
 * The detailed epistemic structure (see / represents / exactness / why)
 * stays on the chapter records; these are the level-appropriate voiceovers.
 */
export const TOUR_CHAPTER_EXPLANATIONS: Readonly<Record<string, LeveledText>> = {
  port: {
    child:
      'Ships bring programs to the city. Your program is real cargo. Everything starts right here.',
    beginner:
      'Every computation enters here as OpenQASM text — pasted, sampled, or imported — and is hashed so the whole journey can be reproduced.',
    expert:
      'The intake stage: the OpenQASM source is the ground truth of the run, content-hashed into the trace so any replay is bound to exactly this input.',
  },
  'logical-qubits': {
    child: 'The ship lists its workers. Each worker is a qubit. They have numbers, not homes yet.',
    beginner:
      'Logical qubits are the named workers of your algorithm, declared by the program before any hardware decision is made.',
    expert:
      'Logical qubits are program-level indices with no physical identity yet; keeping them distinct from physical qubits is essential for reading compiler output.',
  },
  normalization: {
    child:
      'The foundry melts big gates down. Out come small, simple gates. The story stays the same.',
    beginner:
      'Normalization expands composite gates into elementary operations so every later stage works over a small, fixed vocabulary.',
    expert:
      'Composite gates expand into elementary one- and two-qubit operations with verified semantic equivalence; downstream passes assume this normal form.',
  },
  'initial-layout': {
    child:
      'Workers need homes on the chip. The exchange hands out homes. Good homes mean short trips.',
    beginner:
      'The initial layout decides which physical qubit hosts each logical qubit; a poor choice will cost extra routing later.',
    expert:
      'A deterministic heuristic (or manual choice) fixes the initial logical-to-physical embedding; its quality is measured afterwards in SWAP counts, not promises.',
  },
  topology: {
    child: 'The chip is a map of bridges. Qubits can only talk across bridges. No bridge, no talk.',
    beginner:
      'The device topology is the real coupling map: two-qubit gates can only fire between physically connected qubits.',
    expert:
      'The coupling graph is exact for the selected device model — the same graph the compiler and the Qiskit bridge consume — and it is the binding constraint on routing.',
  },
  routing: {
    child:
      'Two far friends want to meet. The city finds the shortest road. Every step has a price.',
    beginner:
      'Routing finds the shortest path between distant physical qubits on the coupling map; each hop on the path will become a SWAP.',
    expert:
      'Deterministic breadth-first search on the coupling graph selects minimal paths; path length is the routing cost function realized as inserted SWAPs.',
  },
  swap: {
    child: 'Two qubits trade homes. Now the friends are neighbors. Trading takes work, though.',
    beginner:
      'A SWAP exchanges which logical qubit lives on which physical qubit, bringing interaction partners next to each other at a real gate cost.',
    expert:
      'Each SWAP is a transposition composed onto the logical-to-physical permutation and costs three CX after translation — pure overhead that adds error exposure.',
  },
  translation: {
    child:
      'The refinery rewrites each gate. The machine only knows a few words. Now it understands everything.',
    beginner:
      'Translation rewrites every gate into the native basis the hardware actually implements, keeping the circuit meaning intact.',
    expert:
      'Single-qubit gates rebase via ZYZ Euler decomposition onto the native set; equivalence is tested up to global phase against the original circuit.',
  },
  optimization: {
    child: 'The mill grinds off waste. Gates that undo each other vanish. Shorter is better.',
    beginner:
      'Optimization cancels adjacent inverse pairs and merges rotations, shrinking depth without changing what the circuit computes.',
    expert:
      'Peephole passes run to a fixpoint: inverse-pair cancellation, rotation merging, null-rotation elimination — each rewrite is semantics-preserving and counted exactly.',
  },
  scheduling: {
    child:
      'The tower hands out start times. Some steps run side by side. Nobody bumps into anybody.',
    beginner:
      'Scheduling assigns start times so independent gates run in parallel lanes while dependent gates wait for their qubits.',
    expert:
      'ASAP scheduling over model gate durations exposes the parallel structure; timings are estimates for teaching, never hardware measurements.',
  },
  execution: {
    child: 'Now the chip does the work. Lights fire as gates run. You can watch every step.',
    beginner:
      'Execution applies each compiled gate in sequence; the pylons light exactly when the trace says a gate fired.',
    expert:
      'The statevector engine applies each gate unitary in scheduled order; the evolution is exact and cross-validated against Qiskit, while the light show is labeled illustrative.',
  },
  noise: {
    child: 'Storms roll over the chip. Noise can flip answers. Weather here means trouble there.',
    beginner:
      'Noise channels — readout error, depolarizing, damping — fire as recorded events, and the weather over the grid shows where they strike.',
    expert:
      'The trajectory method samples one Kraus branch per event with a recorded seed; a single shot is one possible history, and the ensemble converges to the channel.',
  },
  measurement: {
    child: 'We ask each qubit a question. It answers 0 or 1. The answer lands in a box.',
    beginner:
      'Measurement turns quantum state into classical bits: each shot yields one bitstring drawn from the state probabilities.',
    expert:
      'Projective measurement samples bitstrings from the squared amplitudes with a recorded seed; only these classical outcomes ever leave the device.',
  },
  statistics: {
    child:
      'Boxes pile into stacks. Tall stacks mean common answers. More tries make stacks steadier.',
    beginner:
      'The container stacks are the live histogram of counts; with more shots the observed fractions settle toward the true probabilities.',
    expert:
      'Counts are sampled evidence with statistical error scaling like one over the square root of the shot count; the exact distribution is shown alongside for calibration.',
  },
  feedback: {
    child: 'A measured answer becomes a message. The message races back. It can switch on a gate.',
    beginner:
      'Feed-forward sends measured bits back into the circuit, steering later gates — the mechanism behind teleportation and dynamic circuits.',
    expert:
      'Mid-circuit measurement results condition later operations per trajectory; each recorded decision is the one actually taken by the seeded run.',
  },
  comparison: {
    child:
      'The dome compares the answers. Perfect world next to real world. Now you can see the difference.',
    beginner:
      'The Observatory puts ideal, physical, and noisy results side by side so you can see exactly what compilation and noise changed.',
    expert:
      'Exact probabilities, sampled ideal counts, and sampled noisy counts sit in one labeled comparison; every divergence is attributable to a recorded cause in the trace.',
  },
};

/** Leveled tour-chapter summary; falls back to beginner when unknown. */
export function tourChapterExplanation(chapterId: string, level: ExplanationLevel): string {
  const entry = TOUR_CHAPTER_EXPLANATIONS[chapterId];
  if (!entry) return '';
  return entry[level];
}

/**
 * Certainty glossary at every level. Beginner texts are the canonical
 * descriptions re-exported by the certainty badge; the child level explains
 * labels in plain words without removing them.
 */
export const CERTAINTY_GLOSSARY: Readonly<Record<CertaintyLabel, LeveledText>> = {
  EXACT: {
    child: 'Computed exactly. The math has one right answer. This is it.',
    beginner: 'Computed exactly by the statevector simulator (within floating-point precision).',
    expert:
      'Exact within floating-point arithmetic: the statevector simulation admits no sampling error, only numerical precision limits.',
  },
  COMPUTED: {
    child: 'A real tool made this. It follows fixed steps. Same input, same answer.',
    beginner: 'Deterministic output of a real compiler or analysis pass.',
    expert:
      'Deterministic artifact of a real compiler or analysis pass; reproducible bit-for-bit from the same input and configuration.',
  },
  SAMPLED: {
    child: 'Sampled like dice rolls. We rolled many times. Same seed, same rolls.',
    beginner: 'Drawn from random sampling with a recorded seed; rerunning the seed reproduces it.',
    expert:
      'Drawn from seeded pseudo-random sampling; statistically faithful to the underlying distribution and exactly reproducible from the recorded seed.',
  },
  CALIBRATION: {
    child: 'This came from a machine report card. Someone wrote it down earlier.',
    beginner: 'Reported device calibration data with a recorded source and timestamp.',
    expert:
      'Device calibration snapshot with recorded provenance and timestamp; accuracy is bounded by the calibration procedure, not by this application.',
  },
  MEASURED: {
    child: 'Measured for real. A real experiment gave this number.',
    beginner: 'Imported from a real measurement record.',
    expert:
      'Imported empirical measurement record; the value reflects a physical experiment rather than any simulation in this application.',
  },
  ESTIMATED: {
    child: 'This is a good guess. A simple model made it. Do not treat it as measured.',
    beginner: 'Derived from a simplified model; a proxy, not a measurement.',
    expert:
      'Model-derived proxy quantity; useful for intuition and ordering, but not a measurement and not a fidelity.',
  },
  ILLUSTRATIVE: {
    child: 'Just a picture. It helps you see the idea. It is not data.',
    beginner: 'A visual teaching aid only; not derived from computation.',
    expert:
      'Presentation-layer visual with no computational backing; it may aid intuition but must never be read as data.',
  },
};

/** Source-classification glossary at every level. */
export const SOURCE_GLOSSARY: Readonly<Record<SourceClassification, LeveledText>> = {
  exact_simulation: {
    child: 'The exact math engine in your browser made this.',
    beginner: 'In-browser exact statevector simulation',
    expert: 'In-browser statevector simulation applying gate unitaries without sampling error.',
  },
  sampled_simulation: {
    child: 'The dice-rolling engine in your browser made this.',
    beginner: 'In-browser seeded sampling',
    expert: 'In-browser seeded pseudo-random sampling; reproducible from the recorded seed.',
  },
  qiskit_transpiler: {
    child: 'A real quantum toolkit compiled this.',
    beginner: 'Real Qiskit transpiler output',
    expert: 'Output of the real Qiskit transpiler, imported through the Python bridge.',
  },
  qiskit_aer: {
    child: 'A real quantum simulator program made this.',
    beginner: 'Qiskit Aer simulation output',
    expert: 'Qiskit Aer simulation output, imported for cross-validation against this engine.',
  },
  backend_calibration: {
    child: 'A machine report card gave this number.',
    beginner: 'Device calibration snapshot',
    expert: 'Device calibration snapshot with recorded backend name and timestamp.',
  },
  measured_import: {
    child: 'A real experiment gave this number.',
    beginner: 'Imported measurement record',
    expert: 'Imported record of physical measurements taken outside this application.',
  },
  reference_compiler: {
    child: 'The city compiler built this step by step.',
    beginner: 'QSimCity Reference Compiler output',
    expert:
      'QSimCity Reference Compiler output: a deliberately simple deterministic pipeline verified to preserve circuit semantics.',
  },
  estimated: {
    child: 'A simple model guessed this.',
    beginner: 'Model-based estimate',
    expert: 'Model-based estimate; a proxy quantity, never a measurement.',
  },
  illustrative: {
    child: 'This is only a picture.',
    beginner: 'Illustrative visual only',
    expert: 'Illustrative presentation with no data backing.',
  },
};

export function certaintyExplanation(label: CertaintyLabel, level: ExplanationLevel): string {
  return CERTAINTY_GLOSSARY[label][level];
}

export function sourceExplanation(source: SourceClassification, level: ExplanationLevel): string {
  return SOURCE_GLOSSARY[source][level];
}

export interface MissionTextEntry {
  readonly briefing: LeveledText;
  readonly celebration: LeveledText;
  readonly steps: Readonly<Record<string, LeveledText>>;
}

/**
 * Mission briefings, step instructions, and celebrations (spec section 7.3).
 * Step text names the exact on-screen control it refers to; the controls
 * carry matching data-mission-target attributes and exist in both the 3D
 * and Accessible 2D paths.
 */
export const MISSION_TEXT: Readonly<Record<string, MissionTextEntry>> = {
  'bell-pair': {
    briefing: {
      child:
        'Two qubits can become best friends. Ask one, and you know the other. Let us link a pair.',
      beginner:
        'Build a Bell pair: a Hadamard then a CX entangles two qubits so their measured bits always agree.',
      expert:
        'Prepare the Bell state with H then CX and sample it; the ideal distribution contains only correlated bitstrings 00 and 11.',
    },
    celebration: {
      child: 'You linked the pair! Both towers light up together. Their answers always match.',
      beginner:
        'Bell pair complete: only 00 and 11 appear in the counts — the two bits are perfectly correlated.',
      expert:
        'Bell state verified: the sampled distribution is supported on 00 and 11 only, the signature of maximal two-qubit entanglement.',
    },
    steps: {
      template: {
        child: 'Press the big Bell pair button in the block builder.',
        beginner: 'Press the "Bell pair" template button in the circuit builder.',
        expert:
          'Apply the "Bell pair" template in the builder: H on q0, CX q0 to q1, measure both.',
      },
      run: {
        child: 'Press the Run button. Watch the city work.',
        beginner: 'Press the "Run" button to send your circuit through the whole pipeline.',
        expert: 'Press "Run" to compile and execute the circuit and produce a fresh trace.',
      },
      watch: {
        child: 'Look at the result bars. Only two bars appear. The bits always match!',
        beginner:
          'Check the results histogram: only 00 and 11 appear, so the two bits always agree.',
        expert:
          'Inspect the counts: the support is {00, 11}, and any other outcome would falsify entanglement in the noise-free run.',
      },
    },
  },
  ghz: {
    briefing: {
      child: 'Three qubits can share one secret. All say 0, or all say 1. Build the chain.',
      beginner:
        'Extend entanglement to three qubits: H on q0, then a chain of CX gates makes a GHZ state.',
      expert:
        'Prepare a 3-qubit GHZ state with an H and a CX chain; the ideal distribution is supported on 000 and 111 only.',
    },
    celebration: {
      child: 'Three of a kind! All three answers always agree. You made a bigger link.',
      beginner: 'GHZ complete: every shot reads all zeros or all ones across three qubits.',
      expert:
        'GHZ state verified: all-or-nothing correlations across three qubits, the multipartite extension of the Bell pair.',
    },
    steps: {
      build: {
        child:
          'Use three lanes. Place H on the first lane. Then chain two CX blocks. Add measures.',
        beginner:
          'In the builder, use 3 qubit lanes: place H on q0, CX from q0 to q1, CX from q1 to q2, then measure each qubit.',
        expert:
          'Construct H(q0), CX(q0,q1), CX(q1,q2) with terminal measurements on all three lanes in the builder grid.',
      },
      run: {
        child: 'Press the Run button.',
        beginner: 'Press the "Run" button to execute your three-qubit circuit.',
        expert:
          'Press "Run" to compile and execute; three CX-linked qubits should survive routing.',
      },
      check: {
        child: 'Look at the bars. Only 000 and 111 show up.',
        beginner: 'Check the histogram: only 000 and 111 appear.',
        expert:
          'Verify the sampled support is {000, 111}; mixed strings would indicate a broken chain.',
      },
    },
  },
  'long-way-around': {
    briefing: {
      child:
        'Two far-apart qubits want to talk. Helpers must trade homes many times. Watch the trades.',
      beginner:
        'Run a circuit whose partners sit far apart on a line of qubits and watch the router insert SWAPs; then pick a better layout.',
      expert:
        'The swap-storm circuit on the linear-5 device with trivial layout forces heavy SWAP insertion; switching to the interaction heuristic reduces the overhead measurably.',
    },
    celebration: {
      child: 'You saw the trades! Better homes mean fewer trades. You just beat the router.',
      beginner:
        'Routing mission complete: you saw SWAPs appear and reduced them by choosing a better initial layout.',
      expert:
        'Routing overhead observed and reduced: SWAP count is the objective cost of layout quality, and you just optimized it.',
    },
    steps: {
      setup: {
        child: 'The Sample circuit box now shows SWAP Storm. The chip is a line.',
        beginner:
          'The mission loaded the "SWAP Storm" sample on the Linear-5 device with the trivial layout — see the "Sample circuit" and "Device topology" controls.',
        expert:
          'Configuration applied: swap-storm sample, linear-5 topology, trivial layout — the worst case for long-range CX routing.',
      },
      run: {
        child: 'Press the Run button. Watch qubits trade homes.',
        beginner: 'Press "Run" and watch routing.swap_inserted events appear in the event log.',
        expert:
          'Press "Run"; the router will insert SWAPs to shuttle logical qubits into adjacency.',
      },
      layout: {
        child: 'Find the Initial layout box. Switch it to Automatic.',
        beginner:
          'Change the "Initial layout" select from Trivial to Automatic (interaction heuristic).',
        expert: 'Switch the "Initial layout" control to the interaction heuristic.',
      },
      rerun: {
        child: 'Press Run again. Count the trades now. Fewer!',
        beginner: 'Press "Run" again and compare the SWAP count with your first run.',
        expert:
          'Rerun and compare compiled SWAP counts; the interaction layout should pay fewer SWAPs.',
      },
    },
  },
  storm: {
    briefing: {
      child: 'A storm can mess up answers. Turn on the weather. Then compare the results.',
      beginner:
        'Enable the noise model and run: the noisy counts drift away from the ideal ones, and the harbor stacks show the difference.',
      expert:
        'With the trajectory noise model enabled, sampled noisy counts diverge from ideal counts; the divergence is the observable cost of the configured channels.',
    },
    celebration: {
      child: 'You spotted the storm damage! Noisy answers differ from perfect ones.',
      beginner:
        'Noise mission complete: the noisy histogram differs from the ideal one, exactly as configured.',
      expert:
        'Noise impact verified: ideal and noisy result classes are distinct, and every contributing noise event is recorded in the trace.',
    },
    steps: {
      noise: {
        child: 'Find the noise switch. Turn it on.',
        beginner: 'Tick the "Enable noise model" checkbox in the run configuration.',
        expert:
          'Enable the noise model; the default channel parameters are sufficient for visible drift.',
      },
      run: {
        child: 'Press the Run button. The storm rolls in.',
        beginner: 'Press "Run": the pipeline now records noise events and a noisy result set.',
        expert:
          'Press "Run"; the trajectory method samples noise branches per shot with the recorded seed.',
      },
      compare: {
        child: 'Look at the two bar groups. They are not the same.',
        beginner: 'Compare the ideal and noisy histograms in the results — they differ.',
        expert:
          'Compare ideal versus noisy counts; forbidden outcomes and imbalance quantify the channel impact.',
      },
    },
  },
  courier: {
    briefing: {
      child:
        'A measured answer becomes a message. The message can switch on a gate. Watch it race.',
      beginner:
        'Run the dynamic feed-forward sample: a mid-circuit measurement steers a later gate through the classical loop.',
      expert:
        'The feed-forward sample measures mid-circuit and conditions a later X on the result; condition evaluations are recorded per trajectory.',
    },
    celebration: {
      child: 'Message delivered! The gate listened to the measured bit. The two bits agree.',
      beginner:
        'Feed-forward complete: the conditioned gate fired exactly when the measured bit said so.',
      expert:
        'Feed-forward verified: classical.condition_evaluated events record each decision, and the output bits agree shot for shot.',
    },
    steps: {
      setup: {
        child: 'The Sample circuit box shows Dynamic Feed-forward now.',
        beginner:
          'The mission loaded the "Dynamic Feed-forward" sample — see the "Sample circuit" control.',
        expert:
          'Configuration applied: the dynamic-feedforward sample with a mid-circuit measurement.',
      },
      run: {
        child: 'Press the Run button.',
        beginner: 'Press "Run" and let the pipeline finish.',
        expert:
          'Press "Run"; the trace will record condition evaluations in the classical control stage.',
      },
      play: {
        child: 'Press the Play button. Watch the courier drive.',
        beginner: 'Press "Play" on the timeline to watch the measured bit trigger the later gate.',
        expert:
          'Replay the timeline: the condition evaluation tick shows the courier delivering the measured bit.',
      },
    },
  },
  cleanup: {
    briefing: {
      child:
        'Some gates undo each other. The cleanup mill removes them. Shorter circuits are stronger.',
      beginner:
        'Run a circuit full of redundant gate pairs with optimization on, and watch the optimizer cancel them.',
      expert:
        'A cancellation-heavy circuit exercises the peephole optimizer; gate.cancelled events and metric deltas prove the removals.',
    },
    celebration: {
      child: 'Cleanup done! The useless gates are gone. The circuit got shorter.',
      beginner: 'Optimization mission complete: redundant gates cancelled and the depth shrank.',
      expert:
        'Cancellation verified: gate.cancelled events recorded, and before/after metrics show the semantic-preserving reduction.',
    },
    steps: {
      optimize: {
        child: 'Find the optimize switch. Make sure it is on.',
        beginner: 'Make sure the "Optimize compiled circuit" checkbox is ticked.',
        expert: 'Ensure optimization is enabled so the peephole passes run.',
      },
      run: {
        child: 'Press the Run button. The mill grinds.',
        beginner: 'Press "Run": the optimizer will cancel the redundant pairs in this circuit.',
        expert:
          'Press "Run"; inverse pairs in the loaded circuit will be removed at the optimization stage.',
      },
      inspect: {
        child: 'Look at the numbers. Fewer gates than before.',
        beginner: 'Check the metrics panel: the compiled gate count dropped below the input count.',
        expert:
          'Inspect the metrics: compiled gate count and depth are lower than the input; deltas are exact.',
      },
    },
  },
  'count-on-it': {
    briefing: {
      child: 'Few tries give shaky answers. Many tries give steady answers. See it yourself.',
      beginner:
        'Run with few shots, then with many: watch the histogram wobble settle as statistics accumulate.',
      expert:
        'Sampling error scales like one over the square root of the shot count; two runs at different shot counts make the scaling visible.',
    },
    celebration: {
      child: 'You counted on it! More tries made the bars steady. That is how certainty grows.',
      beginner:
        'Statistics mission complete: more shots gave a steadier histogram closer to the exact probabilities.',
      expert:
        'Shot-noise scaling observed: the empirical distribution converges toward the exact probabilities as shots increase.',
    },
    steps: {
      'run-few': {
        child: 'Press Run with the tiny shot number.',
        beginner: 'Press "Run" with the small shot count the mission set (64 shots).',
        expert: 'Run at 64 shots and note the wobble of the observed fractions.',
      },
      'raise-shots': {
        child: 'Find the Shots box. Make the number much bigger.',
        beginner: 'Raise the "Shots" input to a much larger value, for example 4096.',
        expert: 'Increase the "Shots" parameter by an order of magnitude or more.',
      },
      'run-again': {
        child: 'Press Run again. The bars calm down.',
        beginner: 'Press "Run" again and compare how much steadier the bars are.',
        expert:
          'Rerun and compare: the deviation from the exact distribution shrinks with the larger sample.',
      },
    },
  },
};

export function missionText(missionId: string): MissionTextEntry {
  const entry = MISSION_TEXT[missionId];
  if (!entry) throw new Error(`Unknown mission text: ${missionId}`);
  return entry;
}
