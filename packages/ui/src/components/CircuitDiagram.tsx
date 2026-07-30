import type { ReactElement } from 'react';
import type { TraceCircuit, TraceCircuitInstruction } from 'qsimcity-trace';

/**
 * SVG circuit diagram with a complete table alternative for screen readers.
 * Columns are computed with the same wire-dependency rule as circuit depth,
 * so the picture matches the reported metrics.
 */

export interface CircuitDiagramProps {
  readonly circuit: TraceCircuit;
  readonly title: string;
  /** Highlighted (executed) instruction ids. */
  readonly executedIds?: ReadonlySet<string> | undefined;
  /** The instruction the playhead is on. */
  readonly currentInstructionId?: string | null | undefined;
  readonly onSelectInstruction?: ((instructionId: string) => void) | undefined;
  readonly selectedInstructionId?: string | null | undefined;
  /** Compact mode for side-by-side comparison. */
  readonly compact?: boolean | undefined;
}

interface Placed {
  readonly instr: TraceCircuitInstruction;
  readonly column: number;
}

export function layoutColumns(circuit: TraceCircuit): Placed[] {
  const qubitFront = new Array<number>(circuit.numQubits).fill(0);
  const clbitFront = new Array<number>(Math.max(1, circuit.numClbits)).fill(0);
  const placed: Placed[] = [];
  for (const instr of circuit.instructions) {
    const wires: number[] = [];
    for (const q of instr.qubits) wires.push(qubitFront[q] ?? 0);
    for (const c of instr.clbits) wires.push(clbitFront[c] ?? 0);
    if (instr.condition) {
      const reg = circuit.cregs.find((r) => r.name === instr.condition!.creg);
      if (reg) {
        let offset = 0;
        for (const r of circuit.cregs) {
          if (r.name === reg.name) break;
          offset += r.size;
        }
        for (let i = 0; i < reg.size; i++) wires.push(clbitFront[offset + i] ?? 0);
      }
    }
    const column = Math.max(0, ...wires);
    const level = column + (instr.kind === 'barrier' ? 0 : 1);
    for (const q of instr.qubits) qubitFront[q] = level;
    for (const c of instr.clbits) clbitFront[c] = level;
    if (instr.condition) {
      const reg = circuit.cregs.find((r) => r.name === instr.condition!.creg);
      if (reg) {
        let offset = 0;
        for (const r of circuit.cregs) {
          if (r.name === reg.name) break;
          offset += r.size;
        }
        for (let i = 0; i < reg.size; i++) clbitFront[offset + i] = level;
      }
    }
    placed.push({ instr, column });
  }
  return placed;
}

function gateLabel(instr: TraceCircuitInstruction): string {
  if (instr.kind === 'measure') return 'M';
  if (instr.kind === 'reset') return '|0>';
  if (instr.kind === 'barrier') return '‖';
  if (instr.params.length > 0) {
    return `${instr.name}(${instr.params.map((p) => formatAngle(p)).join(',')})`;
  }
  return instr.name;
}

export function formatAngle(value: number): string {
  const overPi = value / Math.PI;
  for (const [num, label] of [
    [1, 'pi'],
    [0.5, 'pi/2'],
    [0.25, 'pi/4'],
    [-1, '-pi'],
    [-0.5, '-pi/2'],
    [-0.25, '-pi/4'],
  ] as const) {
    if (Math.abs(overPi - num) < 1e-9) return label;
  }
  return value.toFixed(2);
}

export function instructionDescription(instr: TraceCircuitInstruction): string {
  const qubits = instr.qubits.map((q) => `q${q}`).join(', ');
  const cond = instr.condition ? ` if ${instr.condition.creg} == ${instr.condition.value}` : '';
  if (instr.kind === 'measure') {
    return `Measure ${qubits} into classical bit ${instr.clbits.join(', ')}${cond}`;
  }
  if (instr.kind === 'reset') return `Reset ${qubits} to |0>${cond}`;
  if (instr.kind === 'barrier') return `Barrier across ${qubits}`;
  const params = instr.params.length > 0 ? ` (${instr.params.map(formatAngle).join(', ')})` : '';
  return `Gate ${instr.name}${params} on ${qubits}${cond}`;
}

const COL_W = 46;
const ROW_H = 34;
const LEFT = 46;
const TOP = 18;

export function CircuitDiagram({
  circuit,
  title,
  executedIds,
  currentInstructionId,
  onSelectInstruction,
  selectedInstructionId,
  compact,
}: CircuitDiagramProps): ReactElement {
  const placed = layoutColumns(circuit);
  const columns = placed.length > 0 ? Math.max(...placed.map((p) => p.column)) + 1 : 1;
  const scale = compact ? 0.72 : 1;
  const clRailY = TOP + circuit.numQubits * ROW_H;
  const height = (clRailY + (circuit.numClbits > 0 ? ROW_H : 10)) * scale;
  const width = (LEFT + columns * COL_W + 20) * scale;

  return (
    <figure className="circuit-diagram" role="group" aria-label={title}>
      <figcaption className="panel-caption">{title}</figcaption>
      <div className="circuit-scroll">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width / scale} ${height / scale}`}
          role="img"
          aria-label={`Circuit diagram: ${title}. A table alternative follows.`}
        >
          {Array.from({ length: circuit.numQubits }, (_, q) => {
            const y = TOP + q * ROW_H + ROW_H / 2;
            return (
              <g key={`w${q}`}>
                <text x={6} y={y + 4} className="wire-label">
                  q{q}
                </text>
                <line x1={LEFT - 8} y1={y} x2={LEFT + columns * COL_W} y2={y} className="wire" />
              </g>
            );
          })}
          {circuit.numClbits > 0 && (
            <g>
              <text x={6} y={clRailY + ROW_H / 2 + 4} className="wire-label">
                c[{circuit.numClbits}]
              </text>
              <line
                x1={LEFT - 8}
                y1={clRailY + ROW_H / 2 - 2}
                x2={LEFT + columns * COL_W}
                y2={clRailY + ROW_H / 2 - 2}
                className="wire wire-classical"
              />
              <line
                x1={LEFT - 8}
                y1={clRailY + ROW_H / 2 + 2}
                x2={LEFT + columns * COL_W}
                y2={clRailY + ROW_H / 2 + 2}
                className="wire wire-classical"
              />
            </g>
          )}
          {placed.map(({ instr, column }) => {
            const cx = LEFT + column * COL_W + COL_W / 2;
            const executed = executedIds?.has(instr.id) ?? false;
            const isCurrent = currentInstructionId === instr.id;
            const isSelected = selectedInstructionId === instr.id;
            const cls = [
              'gate',
              executed ? 'gate-executed' : '',
              isCurrent ? 'gate-current' : '',
              isSelected ? 'gate-selected' : '',
              instr.kind,
            ]
              .filter(Boolean)
              .join(' ');
            const qys = instr.qubits.map((q) => TOP + q * ROW_H + ROW_H / 2);
            const minY = Math.min(...qys);
            const maxY = Math.max(...qys);
            const handleSelect = onSelectInstruction
              ? () => onSelectInstruction(instr.id)
              : undefined;
            return (
              <g
                key={instr.id}
                className={cls}
                {...(handleSelect
                  ? {
                      onClick: handleSelect,
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelect();
                        }
                      },
                      tabIndex: 0,
                      role: 'button',
                      'aria-label': instructionDescription(instr),
                    }
                  : {})}
              >
                {instr.qubits.length > 1 && (
                  <line x1={cx} y1={minY} x2={cx} y2={maxY} className="gate-link" />
                )}
                {instr.condition && (
                  <line
                    x1={cx}
                    y1={maxY}
                    x2={cx}
                    y2={clRailY + ROW_H / 2}
                    className="gate-link gate-link-classical"
                  />
                )}
                {instr.kind === 'measure' && (
                  <line
                    x1={cx}
                    y1={maxY}
                    x2={cx}
                    y2={clRailY + ROW_H / 2}
                    className="gate-link gate-link-classical"
                  />
                )}
                {instr.name === 'cx' && instr.qubits.length === 2 ? (
                  <>
                    <circle cx={cx} cy={qys[0]} r={4.5} className="gate-control" />
                    <circle cx={cx} cy={qys[1]} r={10} className="gate-target" />
                    <line x1={cx - 7} y1={qys[1]} x2={cx + 7} y2={qys[1]} className="gate-cross" />
                    <line x1={cx} y1={qys[1]! - 7} x2={cx} y2={qys[1]! + 7} className="gate-cross" />
                  </>
                ) : instr.name === 'cz' && instr.qubits.length === 2 ? (
                  <>
                    <circle cx={cx} cy={qys[0]} r={4.5} className="gate-control" />
                    <circle cx={cx} cy={qys[1]} r={4.5} className="gate-control" />
                  </>
                ) : instr.name === 'swap' && instr.qubits.length === 2 ? (
                  <>
                    {qys.map((y, i) => (
                      <g key={i}>
                        <line x1={cx - 6} y1={y - 6} x2={cx + 6} y2={y + 6} className="gate-cross" />
                        <line x1={cx - 6} y1={y + 6} x2={cx + 6} y2={y - 6} className="gate-cross" />
                      </g>
                    ))}
                  </>
                ) : instr.name === 'ccx' && instr.qubits.length === 3 ? (
                  <>
                    <circle cx={cx} cy={qys[0]} r={4.5} className="gate-control" />
                    <circle cx={cx} cy={qys[1]} r={4.5} className="gate-control" />
                    <circle cx={cx} cy={qys[2]} r={10} className="gate-target" />
                    <line x1={cx - 7} y1={qys[2]} x2={cx + 7} y2={qys[2]} className="gate-cross" />
                  </>
                ) : instr.kind === 'barrier' ? (
                  <line
                    x1={cx}
                    y1={minY - 12}
                    x2={cx}
                    y2={maxY + 12}
                    className="gate-barrier"
                  />
                ) : (
                  qys.map((y, i) => (
                    <g key={i}>
                      <rect
                        x={cx - 18}
                        y={y - 12}
                        width={36}
                        height={24}
                        rx={4}
                        className="gate-box"
                      />
                      <text x={cx} y={y + 4} textAnchor="middle" className="gate-text">
                        {gateLabel(instr)}
                      </text>
                    </g>
                  ))
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <details className="table-alternative">
        <summary>Instruction table (text alternative)</summary>
        <table>
          <caption>{title}: instruction sequence</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Operation</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {placed.map(({ instr }, i) => (
              <tr key={instr.id}>
                <td>{i + 1}</td>
                <td>{instructionDescription(instr)}</td>
                <td>
                  {currentInstructionId === instr.id
                    ? 'current'
                    : executedIds?.has(instr.id)
                      ? 'executed'
                      : 'pending'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
