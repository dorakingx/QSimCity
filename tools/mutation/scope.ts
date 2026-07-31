/**
 * Mutation scope manifest (spec §18.4).
 *
 * The previous catalogue was a hand-written list of 16 mutants, which is not
 * evidence that the scientific implementation is comprehensively guarded. The
 * scope is now declared per required capability area, mutants are generated
 * from operator rules applied to the covered files, and the manifest records
 * exactly which files were included, which were excluded, and why.
 */

export interface ScopeArea {
  readonly id: string;
  /** Required capability from the specification. */
  readonly capability: string;
  readonly files: readonly string[];
  /** Test paths that must be run to judge mutants in this area. */
  readonly tests: readonly string[];
}

/** Every required scientific capability, mapped to its implementation. */
export const SCOPE_AREAS: readonly ScopeArea[] = [
  {
    id: 'gate-evolution',
    capability: 'Single-qubit and multi-qubit gate evolution',
    files: ['packages/simulator/src/statevector.ts', 'packages/domain/src/gates.ts'],
    tests: ['packages/simulator', 'packages/reference-compiler', 'packages/domain'],
  },
  {
    id: 'indexing-endianness',
    capability: 'Qubit indexing, endianness, and classical-bit mapping',
    files: ['packages/domain/src/circuit.ts'],
    tests: ['packages/domain', 'packages/simulator', 'packages/reference-compiler'],
  },
  {
    id: 'measurement-collapse-reset',
    capability: 'Measurement, state collapse, reset, classical conditions, normalization',
    files: ['packages/simulator/src/engine.ts'],
    tests: ['packages/simulator', 'packages/ui/test/scenarios.test.ts'],
  },
  {
    id: 'noise-channels',
    capability: 'Readout, depolarizing, amplitude damping, phase damping',
    files: ['packages/simulator/src/noise.ts'],
    tests: ['packages/simulator'],
  },
  {
    id: 'layout-routing-swap',
    capability: 'Initial layout, routing, SWAP insertion, basis compliance, scheduling',
    files: ['packages/reference-compiler/src/passes.ts'],
    tests: ['packages/reference-compiler'],
  },
  {
    id: 'compiler-equivalence',
    capability: 'Basis translation and compiler equivalence',
    files: [
      'packages/reference-compiler/src/euler.ts',
      'packages/reference-compiler/src/compile.ts',
    ],
    tests: ['packages/reference-compiler'],
  },
  {
    id: 'global-phase-comparison',
    capability: 'Global-phase-aware comparison',
    files: ['packages/domain/src/complex.ts'],
    tests: ['packages/domain', 'packages/reference-compiler'],
  },
  {
    id: 'topology',
    capability: 'Device topology and shortest-path routing support',
    files: ['packages/domain/src/topology.ts'],
    tests: ['packages/domain', 'packages/reference-compiler'],
  },
  {
    id: 'trace-validation',
    capability: 'Trace validation and invariants',
    files: ['packages/trace/src/validate.ts'],
    tests: ['packages/trace'],
  },
  {
    id: 'trace-canonicalization',
    capability: 'Trace canonicalization and deterministic hashing',
    files: ['packages/trace/src/hash.ts', 'packages/trace/src/hashing-contract.ts'],
    tests: ['packages/trace'],
  },
  {
    id: 'seeded-randomness',
    capability: 'Deterministic seeded randomness',
    files: ['packages/domain/src/rng.ts'],
    tests: ['packages/domain', 'packages/simulator'],
  },
];

/**
 * Files deliberately outside the scientific mutation scope, each with a
 * reason. UI, rendering, and orchestration are covered by component,
 * end-to-end, and visual tests instead.
 */
export const EXCLUSIONS: Readonly<Record<string, string>> = {
  'packages/*/src/index.ts': 'Re-export barrels contain no logic',
  'packages/ui/src/**': 'Presentation layer; covered by component, a11y, and E2E tests',
  'packages/world/src/**': 'Layout data and derivations; covered by world unit tests',
  'packages/visual-engine/src/**': 'Rendering; covered by camera/scene-graph and visual tests',
  'packages/domain/src/samples.ts': 'Static circuit fixtures, no branching logic',
  'packages/domain/src/qasm/**': 'Parser is covered by 74 dedicated tests incl. hostile input',
  'packages/trace/src/schema.ts': 'Declarative zod schema; mutating it tests zod, not QSimCity',
  'packages/trace/src/types.ts': 'Type and constant declarations',
  'packages/trace/src/builder.ts': 'Thin accumulator; exercised by every producer test',
  'packages/trace/src/migrate.ts': 'Covered by dedicated migration tests',
  'packages/trace/src/serialize.ts': 'Thin JSON wrappers over hashed primitives',
  'packages/simulator/src/experiment.ts': 'Orchestration over mutated primitives',
  'packages/simulator/src/worker.ts': 'Worker entry point; not executable under Node tests',
};

/** Mutation operators applied to source within the scope. */
export interface MutationOperator {
  readonly id: string;
  readonly description: string;
  /** Matches a mutable site; the replacement is produced from the match. */
  readonly pattern: RegExp;
  readonly replace: (match: RegExpExecArray) => string | null;
}

const flipComparison: Record<string, string> = {
  '<': '<=',
  '<=': '<',
  '>': '>=',
  '>=': '>',
  '===': '!==',
  '!==': '===',
};

export const OPERATORS: readonly MutationOperator[] = [
  {
    id: 'comparison',
    description: 'Flip or weaken a comparison operator',
    pattern: /(?<![<>=!])(<=|>=|===|!==|<|>)(?![<>=])/g,
    replace: (m) => flipComparison[m[1]!] ?? null,
  },
  {
    id: 'arithmetic',
    description: 'Swap an arithmetic operator',
    pattern: /(?<=[\w)\]]\s)([+\-*/])(?=\s[\w(])/g,
    replace: (m) => ({ '+': '-', '-': '+', '*': '/', '/': '*' })[m[1]!] ?? null,
  },
  {
    id: 'boolean-literal',
    description: 'Invert a boolean literal',
    pattern: /\b(true|false)\b/g,
    replace: (m) => (m[1] === 'true' ? 'false' : 'true'),
  },
  {
    id: 'logical',
    description: 'Swap a logical connective',
    pattern: /(\s)(&&|\|\|)(\s)/g,
    replace: (m) => `${m[1]}${m[2] === '&&' ? '||' : '&&'}${m[3]}`,
  },
  {
    id: 'negation',
    description: 'Remove a boolean negation',
    pattern: /!(?=[a-zA-Z_(])/g,
    replace: () => '',
  },
  {
    id: 'numeric-literal',
    description: 'Perturb a numeric literal',
    pattern: /(?<![\w.])(\d+\.\d+|\d+)(?![\w.])/g,
    replace: (m) => {
      const value = Number(m[1]);
      if (!Number.isFinite(value)) return null;
      if (value === 0) return '1';
      if (value === 1) return '0';
      if (value === 2) return '3';
      return String(value === Math.floor(value) ? value + 1 : value * 2);
    },
  },
];

/**
 * Mutants that survive because they cannot change observable behaviour.
 *
 * A surviving mutant is either a hole in the tests or an equivalent mutant,
 * and the difference matters: the first is a defect, the second is a fact
 * about the language. Only mutants whose equivalence can be stated precisely
 * appear here, keyed by `file:line:operator`, and the mutation run fails if
 * any survivor is not either killed or listed here. "Hard to test" is not a
 * justification.
 */
export const REVIEWED_EQUIVALENT: Readonly<Record<string, string>> = {
  'packages/simulator/src/statevector.ts:110:comparison':
    'Extends the 4x4 row loop by one iteration. The extra row reads matrix ' +
    'entries past the end (undefined, giving NaN) and writes to idx[4], which ' +
    'is undefined; assigning to a non-index key of a Float64Array is discarded ' +
    'by the language, so no amplitude changes.',
  'packages/simulator/src/statevector.ts:110:numeric-literal':
    'Same site and same reason as the comparison mutant: the extra iteration ' +
    'writes to an undefined typed-array index, which JavaScript discards.',
  'packages/domain/src/gates.ts:153:comparison':
    'Extends the CCX basis loop to i = 8, which writes m[144] on a 128-element ' +
    'Float64Array. Out-of-range typed-array writes are discarded, so the gate ' +
    'matrix is unchanged.',
  'packages/simulator/src/noise.ts:103:comparison':
    'Extends the amplitude-damping scaling loop one element past the state ' +
    'vector. Reading gives undefined and the write is discarded, so no ' +
    'amplitude is scaled twice and none is missed.',
};
