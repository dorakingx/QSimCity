import type { ReactElement } from 'react';
import { DISTRICTS, INTERACTIVES, generateBuildings, activityAtTick } from '@qsimcity/world';
import type { Trace, TraceCircuitInstruction } from 'qsimcity-trace';
import { useAppStore, type SelectionTarget } from '../store/appStore.js';
import { CertaintyBadge, SOURCE_DESCRIPTIONS } from './CertaintyBadge.js';
import { instructionDescription } from './CircuitDiagram.js';
import { ACTIVE_SIMPLIFICATIONS } from './ProvenancePanel.js';

/**
 * The Inspector (spec §15): identity, role, live state, relationships,
 * provenance, and jump actions for the current selection.
 */

function findInstruction(
  trace: Trace,
  id: string,
): { instr: TraceCircuitInstruction; which: 'input' | 'compiled' } | null {
  const input = trace.inputCircuit.instructions.find((i) => i.id === id);
  if (input) return { instr: input, which: 'input' };
  const compiled = trace.compiledCircuit?.instructions.find((i) => i.id === id);
  if (compiled) return { instr: compiled, which: 'compiled' };
  return null;
}

function InspectorBody({
  selection,
  trace,
}: {
  selection: SelectionTarget;
  trace: Trace | null;
}): ReactElement {
  const tick = useAppStore((s) => s.playbackTick);
  const { setTick, setMode, applyInteractiveAction } = useAppStore.getState();
  const activity = trace ? activityAtTick(trace, tick) : null;

  switch (selection.kind) {
    case 'district': {
      const district = DISTRICTS.find((d) => d.id === selection.districtId);
      if (!district) return <p>Unknown district.</p>;
      const events = activity?.districts.find((d) => d.districtId === district.id)?.events ?? [];
      const relatedSimplification = ACTIVE_SIMPLIFICATIONS.find((s) => s.id === 'city-metaphor')!;
      return (
        <>
          <h3>{district.name}</h3>
          <p className="inspector-role">{district.role}</p>
          <p>{district.description}</p>
          <dl>
            <dt>Pipeline stages</dt>
            <dd>{district.stages.join(', ')}</dd>
            <dt>Activity at tick {tick}</dt>
            <dd>{events.length === 0 ? 'Quiet' : events.map((e) => e.eventType).join(', ')}</dd>
            <dt>Simplification</dt>
            <dd>{relatedSimplification.text}</dd>
          </dl>
          {events.length > 0 && events[0]!.instructionId && (
            <button
              type="button"
              onClick={() => {
                useAppStore.getState().select({
                  kind: 'instruction',
                  instructionId: events[0]!.instructionId!,
                  circuit: 'input',
                });
              }}
            >
              Inspect active instruction
            </button>
          )}
        </>
      );
    }
    case 'building': {
      const building = generateBuildings().find((b) => b.id === selection.buildingId);
      const district = DISTRICTS.find((d) => d.id === selection.districtId);
      if (!building || !district) return <p>Unknown building.</p>;
      return (
        <>
          <h3>{building.name}</h3>
          <p className="inspector-role">
            {building.isLandmark ? 'Landmark of' : 'Part of'} {district.name}
          </p>
          <p>{district.description}</p>
          <dl>
            <dt>Function</dt>
            <dd>{district.role}</dd>
            <dt>Certainty of what this represents</dt>
            <dd>
              <CertaintyBadge certainty="ILLUSTRATIVE" /> The architecture is an illustration; the
              data it displays carries its own label.
            </dd>
          </dl>
        </>
      );
    }
    case 'qubit': {
      const q = selection.qubit;
      const logical = trace?.initialLayout ? trace.initialLayout.indexOf(q) : -1;
      const active = activity?.activeQubits.includes(q) ?? false;
      const measured = activity ? [...activity.measuredBits.entries()] : [];
      return (
        <>
          <h3>Physical qubit {q}</h3>
          <p className="inspector-role">QPU Grid pylon</p>
          <dl>
            <dt>Holds logical qubit</dt>
            <dd>
              {logical !== null && logical >= 0 ? `L${logical} (initial layout)` : 'Unassigned'}
            </dd>
            <dt>Active at tick {tick}</dt>
            <dd>{active ? 'Yes — an instruction touches this qubit now' : 'No'}</dd>
            <dt>Representative measured bits so far</dt>
            <dd>
              {measured.length === 0
                ? 'None yet'
                : measured.map(([clbit, v]) => `c${clbit}=${v}`).join(', ')}{' '}
              {measured.length > 0 && <CertaintyBadge certainty="SAMPLED" />}
            </dd>
          </dl>
        </>
      );
    }
    case 'instruction': {
      if (!trace) return <p>No trace loaded.</p>;
      const found = findInstruction(trace, selection.instructionId);
      if (!found) return <p>Instruction not found in the current trace.</p>;
      const { instr, which } = found;
      const events = trace.events.filter((e) => e.instructionId === instr.id);
      const firstEvent = events[0] ?? null;
      const executed = activity?.executedInstructionIds.has(instr.id) ?? false;
      return (
        <>
          <h3>{instructionDescription(instr)}</h3>
          <p className="inspector-role">
            {which === 'input' ? 'Input circuit instruction' : 'Compiled circuit instruction'}
          </p>
          <dl>
            <dt>Logical qubits</dt>
            <dd>{instr.qubits.join(', ') || '—'}</dd>
            {which === 'compiled' && trace.initialLayout && (
              <>
                <dt>Physical qubits</dt>
                <dd>{instr.qubits.join(', ')}</dd>
              </>
            )}
            <dt>Status at tick {tick}</dt>
            <dd>{executed ? 'Executed' : 'Pending'}</dd>
            {firstEvent && (
              <>
                <dt>Source</dt>
                <dd>
                  {SOURCE_DESCRIPTIONS[firstEvent.source]}{' '}
                  <CertaintyBadge certainty={firstEvent.certainty} />
                </dd>
              </>
            )}
          </dl>
          {events.length === 0 && which === 'input' && (
            <p className="hint">
              Execution runs the compiled circuit, so this logical instruction has no execution
              event of its own. Layout, routing, and translation may have moved, split, merged, or
              removed it. Select the corresponding compiled instruction to follow what ran on the
              device.
            </p>
          )}
          <div className="inspector-actions">
            {events.length > 0 && (
              <button type="button" onClick={() => setTick(events[0]!.logicalTick)}>
                Jump timeline to this instruction
              </button>
            )}
            <button type="button" onClick={() => setMode('accessible-2d')}>
              View in 2D circuit
            </button>
          </div>
        </>
      );
    }
    case 'interactive': {
      const interactive = INTERACTIVES.find((i) => i.id === selection.interactiveId);
      if (!interactive) return <p>Unknown console.</p>;
      const district = DISTRICTS.find((d) => d.id === interactive.districtId)!;
      return (
        <>
          <h3>{interactive.name}</h3>
          <p className="inspector-role">Interactive console in {district.name}</p>
          <p>{interactive.prompt}.</p>
          <button type="button" onClick={() => applyInteractiveAction(interactive.action)}>
            Operate: {interactive.prompt}
          </button>
        </>
      );
    }
  }
}

export function Inspector(): ReactElement | null {
  const selection = useAppStore((s) => s.selection);
  const trace = useAppStore((s) => s.trace);
  const open = useAppStore((s) => s.inspectorOpen);
  const { setInspectorOpen, select } = useAppStore.getState();

  if (!open) return null;
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="inspector-header">
        <h2>Inspector</h2>
        <button
          type="button"
          aria-label="Close inspector"
          onClick={() => {
            setInspectorOpen(false);
            select(null);
          }}
        >
          ×
        </button>
      </div>
      {selection ? (
        <InspectorBody selection={selection} trace={trace} />
      ) : (
        <p className="hint">
          Select a district, building, qubit, console, or circuit instruction to inspect it.
          {trace === null && ' Run a circuit first to give the city something to do.'}
        </p>
      )}
    </aside>
  );
}
