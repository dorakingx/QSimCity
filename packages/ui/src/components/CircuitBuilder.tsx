import { useCallback, useRef, useState, type ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';
import {
  BUILDER_MAX_COLUMNS,
  BUILDER_MAX_QUBITS,
  BUILDER_MIN_QUBITS,
  bellTemplateState,
  canPlace,
  compileBuilderQasm,
  EMPTY_BUILDER_STATE,
  occupiedLanes,
  paletteForLevel,
  paletteGate,
  placementAt,
  withPlacement,
  withoutPlacement,
  withQubitCount,
  type BuilderGateId,
  type BuilderGridState,
  type BuilderPlacement,
} from '../builder/model.js';

/**
 * Drag-and-drop circuit builder (spec section 7.2). Pointer events (not
 * HTML5 drag-and-drop) so mouse and touch both work; tap-to-select then
 * tap-to-place works everywhere; the grid is fully keyboard operable. The
 * grid compiles to OpenQASM 2.0 fed into the store configuration, so runs
 * go through the exact same parser and pipeline as the Lab's text editor.
 */

export interface CircuitBuilderApi {
  readonly state: BuilderGridState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly qasm: string;
  place(gate: BuilderGateId, column: number, qubit: number, targetQubit: number | null): void;
  remove(id: number): void;
  undo(): void;
  redo(): void;
  reset(): void;
  applyBellTemplate(): void;
  setNumQubits(n: number): void;
}

interface BuilderHistory {
  readonly past: readonly BuilderGridState[];
  readonly present: BuilderGridState;
  readonly future: readonly BuilderGridState[];
}

/**
 * Builder state with undo/redo history. Every change compiles the grid and
 * writes it into the run configuration (sampleId null: a custom program).
 */
export function useCircuitBuilder(): CircuitBuilderApi {
  const [history, setHistory] = useState<BuilderHistory>({
    past: [],
    present: EMPTY_BUILDER_STATE,
    future: [],
  });

  const commit = useCallback((updater: (prev: BuilderGridState) => BuilderGridState): void => {
    setHistory((h) => {
      const next = updater(h.present);
      if (next === h.present) return h;
      useAppStore.getState().updateConfig({ qasm: compileBuilderQasm(next), sampleId: null });
      return { past: [...h.past, h.present], present: next, future: [] };
    });
  }, []);

  const undo = useCallback((): void => {
    setHistory((h) => {
      const previous = h.past.at(-1);
      if (!previous) return h;
      useAppStore.getState().updateConfig({ qasm: compileBuilderQasm(previous), sampleId: null });
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback((): void => {
    setHistory((h) => {
      const next = h.future[0];
      if (!next) return h;
      useAppStore.getState().updateConfig({ qasm: compileBuilderQasm(next), sampleId: null });
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
    });
  }, []);

  return {
    state: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    qasm: compileBuilderQasm(history.present),
    place: (gate, column, qubit, targetQubit) =>
      commit((prev) => withPlacement(prev, gate, column, qubit, targetQubit)),
    remove: (id) => commit((prev) => withoutPlacement(prev, id)),
    undo,
    redo,
    reset: () => commit((prev) => ({ ...EMPTY_BUILDER_STATE, numQubits: prev.numQubits })),
    applyBellTemplate: () => commit(() => bellTemplateState()),
    setNumQubits: (n) => commit((prev) => withQubitCount(prev, n)),
  };
}

interface DragState {
  readonly kind: 'new' | 'existing';
  readonly gate: BuilderGateId;
  readonly placementId: number | null;
  readonly startX: number;
  readonly startY: number;
  readonly moved: boolean;
}

interface PendingPair {
  readonly gate: BuilderGateId;
  readonly column: number;
  readonly qubit: number;
}

interface CellRef {
  readonly column: number;
  readonly qubit: number;
}

function tileGlyph(p: BuilderPlacement, lane: number): string {
  if (p.gate === 'cx') return lane === p.qubit ? 'CX•' : '⊕';
  if (p.gate === 'swap') return '×';
  return paletteGate(p.gate).symbol;
}

export function CircuitBuilder({ builder }: { builder: CircuitBuilderApi }): ReactElement {
  const level = useAppStore((s) => s.settings.explanationLevel);
  const running = useAppStore((s) => s.running);
  const [armedGate, setArmedGate] = useState<BuilderGateId | null>(null);
  const [pendingPair, setPendingPair] = useState<PendingPair | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [status, setStatus] = useState('');
  /** The single tab stop inside the placement grid (roving tabindex). */
  const [rovingCell, setRovingCell] = useState<CellRef>({ column: 0, qubit: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const { state } = builder;
  const palette = paletteForLevel(level);
  const columns = Array.from({ length: BUILDER_MAX_COLUMNS }, (_, i) => i);
  const lanes = Array.from({ length: state.numQubits }, (_, i) => i);

  const cellFromPoint = (x: number, y: number): CellRef | null => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    const column = Math.min(
      BUILDER_MAX_COLUMNS - 1,
      Math.max(0, Math.floor(((x - rect.left) / rect.width) * BUILDER_MAX_COLUMNS)),
    );
    const qubit = Math.min(
      state.numQubits - 1,
      Math.max(0, Math.floor(((y - rect.top) / rect.height) * state.numQubits)),
    );
    return { column, qubit };
  };

  const isInsideGrid = (x: number, y: number): boolean => cellFromPoint(x, y) !== null;

  const tryPlace = (gate: BuilderGateId, cell: CellRef): void => {
    const def = paletteGate(gate);
    if (def.twoQubit) {
      setPendingPair({ gate, column: cell.column, qubit: cell.qubit });
      setStatus(
        `${def.label} placed its first end on qubit ${cell.qubit} in column ${cell.column + 1}. Now pick a second qubit lane in the same column.`,
      );
      return;
    }
    if (canPlace(state, gate, cell.column, cell.qubit, null)) {
      builder.place(gate, cell.column, cell.qubit, null);
      setStatus(`${def.label} placed on qubit ${cell.qubit} in column ${cell.column + 1}.`);
    } else {
      setStatus('That cell is taken. Pick an empty cell.');
    }
  };

  const handleCellActivate = (cell: CellRef): void => {
    if (pendingPair) {
      if (cell.column === pendingPair.column && cell.qubit !== pendingPair.qubit) {
        if (canPlace(state, pendingPair.gate, pendingPair.column, pendingPair.qubit, cell.qubit)) {
          builder.place(pendingPair.gate, pendingPair.column, pendingPair.qubit, cell.qubit);
          setStatus(
            `${paletteGate(pendingPair.gate).label} linked qubit ${pendingPair.qubit} with qubit ${cell.qubit}.`,
          );
        } else {
          setStatus('That lane is taken in this column. Pick a free lane.');
        }
        setPendingPair(null);
        return;
      }
      // A tap outside the prompt column restarts the two-step selection.
      setPendingPair(null);
    }
    const existing = placementAt(state, cell.column, cell.qubit);
    if (existing) {
      setStatus(
        `${paletteGate(existing.gate).label} is here. Press its remove button (or Delete) to take it away.`,
      );
      return;
    }
    if (armedGate) tryPlace(armedGate, cell);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, cell: CellRef): void => {
    // Cells sit inside per-cell slot wrappers, so navigate from the grid.
    const grid = e.currentTarget.closest('.builder-grid');
    const focusCell = (column: number, qubit: number): void => {
      const target = grid?.querySelector<HTMLButtonElement>(`[data-cell="${column}-${qubit}"]`);
      setRovingCell({ column, qubit });
      target?.focus();
    };
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusCell(Math.min(BUILDER_MAX_COLUMNS - 1, cell.column + 1), cell.qubit);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusCell(Math.max(0, cell.column - 1), cell.qubit);
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusCell(cell.column, Math.min(state.numQubits - 1, cell.qubit + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusCell(cell.column, Math.max(0, cell.qubit - 1));
        break;
      case 'Enter':
      case ' ':
        // Handled here (with preventDefault, so no duplicate native click)
        // to keep placement working identically across environments.
        e.preventDefault();
        handleCellActivate(cell);
        break;
      case 'Delete':
      case 'Backspace': {
        e.preventDefault();
        const placed = placementAt(state, cell.column, cell.qubit);
        if (placed) {
          builder.remove(placed.id);
          setStatus(`${paletteGate(placed.gate).label} removed.`);
        }
        break;
      }
      default:
        break;
    }
  };

  const onPalettePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    gate: BuilderGateId,
  ): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({
      kind: 'new',
      gate,
      placementId: null,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    });
  };

  const onTilePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    p: BuilderPlacement,
  ): void => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({
      kind: 'existing',
      gate: p.gate,
      placementId: p.id,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    });
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 4) setDrag({ ...drag, moved: true });
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    if (!drag) return;
    const current = drag;
    setDrag(null);
    if (current.kind === 'new') {
      if (current.moved) {
        const cell = cellFromPoint(e.clientX, e.clientY);
        if (cell) {
          if (
            pendingPair &&
            cell.column === pendingPair.column &&
            cell.qubit !== pendingPair.qubit
          ) {
            handleCellActivate(cell);
          } else if (!placementAt(state, cell.column, cell.qubit)) {
            tryPlace(current.gate, cell);
          } else {
            setStatus('That cell is taken. Pick an empty cell.');
          }
        }
      } else {
        // A tap arms the gate for tap-to-place.
        const next = armedGate === current.gate ? null : current.gate;
        setArmedGate(next);
        setPendingPair(null);
        setStatus(
          next
            ? `${paletteGate(next).label} selected. Tap an empty grid cell to place it.`
            : 'Gate deselected.',
        );
      }
      return;
    }
    // Existing tile: dragging it off the grid removes it.
    if (current.moved && current.placementId !== null && !isInsideGrid(e.clientX, e.clientY)) {
      builder.remove(current.placementId);
      setStatus(`${paletteGate(current.gate).label} removed by dragging it away.`);
    }
  };

  const measureHint =
    level === 'child'
      ? 'Build with blocks. Tap a block, then tap the grid.'
      : 'Place gates on the qubit lanes; time flows left to right. Everything compiles to OpenQASM 2.0.';

  return (
    <section
      className="circuit-builder"
      aria-label="Circuit builder"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <p className="hint builder-hint">{measureHint}</p>
      <div
        className="builder-palette"
        role="group"
        aria-label="Gate palette"
        data-mission-target="builder-palette"
      >
        {palette.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`builder-palette-tile${armedGate === g.id ? ' armed' : ''}`}
            aria-pressed={armedGate === g.id}
            aria-label={`${g.label}: ${g.description}`}
            title={g.description}
            data-mission-target={`builder-palette-${g.id}`}
            onPointerDown={(e) => onPalettePointerDown(e, g.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const next = armedGate === g.id ? null : g.id;
                setArmedGate(next);
                setStatus(
                  next
                    ? `${g.label} selected. Move to the grid and press Enter on a cell to place it.`
                    : 'Gate deselected.',
                );
              }
            }}
          >
            {g.symbol}
          </button>
        ))}
      </div>

      <div className="builder-toolbar">
        <label className="builder-qubits-label">
          Qubit lanes
          <select
            value={state.numQubits}
            aria-label="Number of qubit lanes"
            data-mission-target="builder-qubits"
            onChange={(e) => builder.setNumQubits(Number(e.target.value))}
          >
            {Array.from(
              { length: BUILDER_MAX_QUBITS - BUILDER_MIN_QUBITS + 1 },
              (_, i) => BUILDER_MIN_QUBITS + i,
            ).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary builder-template"
          data-mission-target="builder-bell-template"
          onClick={() => {
            builder.applyBellTemplate();
            setArmedGate(null);
            setPendingPair(null);
            setStatus('Bell pair template loaded: H, CX, and two measures.');
          }}
        >
          Bell pair
        </button>
        <button
          type="button"
          onClick={builder.undo}
          disabled={!builder.canUndo}
          data-mission-target="builder-undo"
        >
          Undo
        </button>
        <button type="button" onClick={builder.redo} disabled={!builder.canRedo}>
          Redo
        </button>
        <button
          type="button"
          data-mission-target="builder-reset"
          onClick={() => {
            builder.reset();
            setArmedGate(null);
            setPendingPair(null);
            setStatus('Grid cleared.');
          }}
        >
          Reset
        </button>
      </div>

      <div
        ref={gridRef}
        className="builder-grid"
        role="group"
        aria-label={`Circuit grid: ${state.numQubits} qubit lanes by ${BUILDER_MAX_COLUMNS} time columns`}
        data-mission-target="builder-grid"
        style={{
          gridTemplateColumns: `repeat(${BUILDER_MAX_COLUMNS}, minmax(2.4rem, 1fr))`,
          gridTemplateRows: `repeat(${state.numQubits}, 2.8rem)`,
        }}
      >
        {lanes.map((qubit) =>
          columns.map((column) => {
            const placed = placementAt(state, column, qubit);
            const isPendingOrigin =
              pendingPair !== null && pendingPair.column === column && pendingPair.qubit === qubit;
            const isPendingColumn = pendingPair !== null && pendingPair.column === column;
            const cellLabel = placed
              ? `Column ${column + 1}, qubit ${qubit}: ${paletteGate(placed.gate).label}`
              : `Column ${column + 1}, qubit ${qubit}: empty`;
            // The remove control is a SIBLING of the cell button, never a
            // descendant: interactive children inside a <button> are invalid
            // ARIA and confuse screen readers.
            return (
              <span
                key={`${column}-${qubit}`}
                className="builder-cell-slot"
                style={{ gridColumn: column + 1, gridRow: qubit + 1 }}
              >
                <button
                  type="button"
                  data-cell={`${column}-${qubit}`}
                  // Roving tabindex: the grid is one tab stop, not
                  // numQubits x 12. Arrow keys move within it. Without this
                  // a keyboard learner needed 31 Tab presses to get from the
                  // gate palette to Run.
                  tabIndex={rovingCell.column === column && rovingCell.qubit === qubit ? 0 : -1}
                  onFocus={() => setRovingCell({ column, qubit })}
                  className={`builder-cell${placed ? ' filled' : ''}${
                    isPendingOrigin ? ' pending-origin' : isPendingColumn ? ' pending-column' : ''
                  }`}
                  aria-label={cellLabel}
                  onClick={() => handleCellActivate({ column, qubit })}
                  onKeyDown={(e) => handleCellKeyDown(e, { column, qubit })}
                  {...(placed
                    ? {
                        onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) =>
                          onTilePointerDown(e, placed),
                      }
                    : {})}
                >
                  {placed ? (
                    <span className="builder-tile">
                      <span aria-hidden="true">{tileGlyph(placed, qubit)}</span>
                    </span>
                  ) : (
                    <span aria-hidden="true" className="builder-cell-dot">
                      ·
                    </span>
                  )}
                </button>
                {placed && occupiedLanes(placed)[0] === qubit && (
                  <button
                    type="button"
                    className="builder-tile-remove"
                    aria-label={`Remove ${paletteGate(placed.gate).label} from column ${column + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      builder.remove(placed.id);
                      setStatus(`${paletteGate(placed.gate).label} removed.`);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          }),
        )}
      </div>

      <p className="builder-status" role="status" aria-live="polite">
        {pendingPair
          ? `Pick the second qubit lane for ${paletteGate(pendingPair.gate).label} in column ${pendingPair.column + 1}.`
          : status}
      </p>

      <div className="builder-actions">
        <button
          type="button"
          className="primary"
          // Keeps focus on Run while the run is in flight. Disabling it
          // reactively blurred the learner to document.body at the single
          // most important moment in the product.
          aria-disabled={running || state.placements.length === 0}
          data-mission-target="builder-run"
          onClick={() => {
            if (running || state.placements.length === 0) return;
            useAppStore.getState().updateConfig({
              qasm: compileBuilderQasm(state),
              sampleId: null,
            });
            void useAppStore.getState().run();
          }}
        >
          Run
        </button>
        <details className="builder-qasm-preview">
          <summary>OpenQASM this grid compiles to</summary>
          <pre>
            <code>{builder.qasm}</code>
          </pre>
        </details>
      </div>
    </section>
  );
}
