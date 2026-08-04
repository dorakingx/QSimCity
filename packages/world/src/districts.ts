import type { Stage } from 'qsimcity-trace';

/**
 * The authoritative city plan (spec §13): district identities, bounds, and
 * the road spine. All 3D, 2D, tour, and inspector surfaces derive geography
 * from this module — no other module may invent coordinates.
 *
 * Geography IS the architecture diagram: districts are laid out along a
 * west-to-east processing boulevard in pipeline order, with the QPU Grid at
 * the city's center-east, support districts flanking it, and the
 * Observatory on the southern hill overlooking everything.
 */

export type DistrictId =
  | 'program-port'
  | 'ir-foundry'
  | 'layout-exchange'
  | 'routing-transit'
  | 'translation-refinery'
  | 'optimization-works'
  | 'scheduling-tower'
  | 'qpu-grid'
  | 'noise-atmosphere'
  | 'measurement-harbor'
  | 'classical-control'
  | 'observatory';

export interface DistrictRect {
  /** Center in world units (x east, z south). */
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

export interface District {
  readonly id: DistrictId;
  readonly name: string;
  readonly role: string;
  /** Trace stages whose events land in this district. */
  readonly stages: readonly Stage[];
  readonly bounds: DistrictRect;
  /** Base accent color (hex) — always paired with shape/icon/text cues. */
  readonly accentColor: string;
  /** Icon token used by 2D mode and labels. */
  readonly icon: string;
  readonly description: string;
}

/**
 * City scale factor. District zones, road spacing, coasts, and anchors are
 * authored on the original compact grid and scaled up so each district holds
 * several real city blocks. Building and road widths stay in true meters —
 * only the spacing between things grows.
 */
export const CITY_SCALE = 1.8;

const RAW_DISTRICTS: readonly District[] = [
  {
    id: 'program-port',
    name: 'Program Port',
    role: 'Program input: OpenQASM, samples, imported traces',
    stages: ['input'],
    bounds: { x: -170, z: 20, width: 70, depth: 80 },
    accentColor: '#38b6d8',
    icon: 'anchor',
    description:
      'Ships carrying quantum programs dock here. Every run begins at the Port: OpenQASM text, a bundled sample, or an imported trace file.',
  },
  {
    id: 'ir-foundry',
    name: 'IR Foundry',
    role: 'Parsing, normalization, gate expansion',
    stages: ['parse', 'normalize'],
    bounds: { x: -100, z: 20, width: 60, depth: 70 },
    accentColor: '#d8783a',
    icon: 'furnace',
    description:
      'Raw program text is melted down and recast into a normalized instruction stream. Composite gates are expanded into elementary operations.',
  },
  {
    id: 'layout-exchange',
    name: 'Layout Exchange',
    role: 'Logical-to-physical qubit assignment',
    stages: ['layout'],
    bounds: { x: -40, z: 20, width: 55, depth: 70 },
    accentColor: '#c9a53a',
    icon: 'exchange',
    description:
      'The trading floor where logical qubits are matched with physical homes on the device. A poor deal here costs SWAPs downstream.',
  },
  {
    id: 'routing-transit',
    name: 'Routing Transit',
    role: 'Route selection and SWAP insertion',
    stages: ['routing'],
    bounds: { x: 15, z: 20, width: 55, depth: 70 },
    accentColor: '#7a5fd8',
    icon: 'rails',
    description:
      'The rail yard. When two qubits must interact across the device, routes are planned here and SWAP cars shuttle quantum information between platforms.',
  },
  {
    id: 'translation-refinery',
    name: 'Translation Refinery',
    role: 'Native basis-gate translation',
    stages: ['translation'],
    bounds: { x: 70, z: 55, width: 50, depth: 55 },
    accentColor: '#3ac98f',
    icon: 'pipes',
    description:
      'Every abstract gate is refined into the machine’s native dialect: rz, sx, x, and cx. Nothing leaves the refinery the hardware cannot speak.',
  },
  {
    id: 'optimization-works',
    name: 'Optimization Works',
    role: 'Gate cancellation and depth reduction',
    stages: ['optimization'],
    bounds: { x: 70, z: -10, width: 50, depth: 50 },
    accentColor: '#5fb63a',
    icon: 'gears',
    description:
      'The machine works where redundant gates are ground away. Adjacent inverses cancel; rotations merge; the circuit leaves lighter than it arrived.',
  },
  {
    id: 'scheduling-tower',
    name: 'Scheduling Tower',
    role: 'Instruction timing and parallelism',
    stages: ['scheduling'],
    bounds: { x: 125, z: 20, width: 45, depth: 60 },
    accentColor: '#d8c93a',
    icon: 'clock',
    description:
      'Air-traffic control for instructions. The tower assigns every operation a start time, packing independent gates into parallel lanes.',
  },
  {
    id: 'qpu-grid',
    name: 'QPU Grid',
    role: 'Physical qubits and gate execution',
    stages: ['execution'],
    bounds: { x: 195, z: 20, width: 80, depth: 80 },
    accentColor: '#38d8d0',
    icon: 'chip',
    description:
      'The cryogenic heart of the city. Each pylon is a physical qubit; light on the coupling bridges is a two-qubit gate firing.',
  },
  {
    id: 'noise-atmosphere',
    name: 'Noise Atmosphere',
    role: 'Error rates and noise-model provenance',
    stages: ['noise'],
    bounds: { x: 195, z: -55, width: 80, depth: 50 },
    accentColor: '#b63ad8',
    icon: 'storm',
    description:
      'The weather station. Decoherence and gate error roll over the QPU Grid as weather fronts — the panels here say exactly which model is forecast.',
  },
  {
    id: 'measurement-harbor',
    name: 'Measurement Harbor',
    role: 'Shots, counts, and statistics',
    stages: ['measurement'],
    bounds: { x: 195, z: 95, width: 80, depth: 55 },
    accentColor: '#d83a6a',
    icon: 'crane',
    description:
      'Where quantum becomes classical. Each shot lands a container of bits on the dock; stacked containers form the count histogram.',
  },
  {
    id: 'classical-control',
    name: 'Classical Control Center',
    role: 'Feed-forward and hybrid loops',
    stages: ['classical'],
    bounds: { x: 125, z: 95, width: 55, depth: 50 },
    accentColor: '#3a6ad8',
    icon: 'relay',
    description:
      'The city’s nervous system. Measurement results race back along elevated conduits to steer later gates and drive variational optimization loops.',
  },
  {
    id: 'observatory',
    name: 'Observatory',
    role: 'Analysis: circuit, histograms, provenance',
    stages: ['result'],
    bounds: { x: -20, z: 130, width: 90, depth: 60 },
    accentColor: '#8ad83a',
    icon: 'dome',
    description:
      'On the southern hill, the Observatory sees the whole pipeline at once: the 2D circuit, the coupling map, histograms, metrics, and every provenance label.',
  },
];

export const DISTRICTS: readonly District[] = RAW_DISTRICTS.map((d) => ({
  ...d,
  bounds: {
    x: d.bounds.x * CITY_SCALE,
    z: d.bounds.z * CITY_SCALE,
    width: d.bounds.width * CITY_SCALE,
    depth: d.bounds.depth * CITY_SCALE,
  },
}));

export function getDistrict(id: DistrictId): District {
  const d = DISTRICTS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown district: ${id}`);
  return d;
}

export function districtForStage(stage: Stage): District {
  const d = DISTRICTS.find((x) => x.stages.includes(stage));
  if (!d) throw new Error(`No district mapped to stage: ${stage}`);
  return d;
}

/** World-space bounds of the whole city including margins. */
export const CITY_BOUNDS = {
  minX: -230 * CITY_SCALE,
  maxX: 260 * CITY_SCALE,
  minZ: -100 * CITY_SCALE,
  maxZ: 180 * CITY_SCALE,
} as const;

/** The west-to-east processing boulevard road spine (polyline x,z). */
export const BOULEVARD: readonly (readonly [number, number])[] = [
  [-205, 20],
  [-170, 20],
  [-100, 20],
  [-40, 20],
  [15, 20],
  [70, 20],
  [125, 20],
  [195, 20],
].map(([x, z]) => [x! * CITY_SCALE, z! * CITY_SCALE] as const);
