import { useState, type ReactElement } from 'react';
import { activityAtTick, hasLayoutAssignment, logicalToPhysicalAt } from '@qsimcity/world';
import { useAppStore } from '../store/appStore.js';
import { LabControls } from '../components/LabControls.js';
import { CircuitDiagram } from '../components/CircuitDiagram.js';
import { CouplingMap } from '../components/CouplingMap.js';
import { TimelineBar } from '../components/TimelineBar.js';
import { ResultsSection } from '../components/ResultsSection.js';
import { MetricsPanel } from '../components/MetricsPanel.js';
import { ProvenancePanel } from '../components/ProvenancePanel.js';
import { EventLog } from '../components/EventLog.js';
import { MissionPanel } from '../missions/MissionPanel.js';
import { Inspector } from '../components/Inspector.js';
import { CityLegend } from '../components/CityLegend.js';
import { ScenarioPanel } from '../scenarios/ScenarioPanel.js';

/**
 * Accessible 2D Mode (spec §16): the complete core workflow without any
 * WebGL, including the whole learning path — missions and the block
 * builder are plain DOM and live here too (spec W6.9). This view is also
 * the automatic fallback when WebGL is unavailable.
 *
 * "Complete" is a claim that has to be kept true. The Inspector, the City
 * Legend, the scenario dock and the Instruction Schedule were once rendered
 * only inside the WebGL branch, which left gate selection here a dead end
 * (the selection changed a stroke colour and nothing displayed it) and put
 * the per-instruction schedule behind walking an avatar to a console in the
 * 3D city. They are reachable from this view now.
 */
export function Accessible2DView(): ReactElement {
  const [legendOpen, setLegendOpen] = useState(false);
  const trace = useAppStore((s) => s.trace);
  const tick = useAppStore((s) => s.playbackTick);
  const selection = useAppStore((s) => s.selection);
  const { select } = useAppStore.getState();
  const activity = trace ? activityAtTick(trace, tick) : null;
  // Tick-aware logical residency: the same derivation the 3D banners use,
  // so the coupling map can never disagree with the city about where a
  // logical qubit lives mid-replay (SWAPs move it).
  //
  // Before layout.assigned fires there is no assignment to show, and an
  // earlier version filled the gap from the trace header's initialLayout —
  // which made the 2D map assert a compiler decision at ticks before the
  // compiler had made it, while the 3D banners and the inspector correctly
  // showed nothing. The only header fallback left is for traces that record
  // no layout stage at all, and it is labelled as a header value.
  const layoutAssignedInTrace = trace ? hasLayoutAssignment(trace) : false;
  const { layoutAtTick, layoutMoment } = (() => {
    if (!trace) return { layoutAtTick: null, layoutMoment: undefined };
    if (!layoutAssignedInTrace) {
      return {
        layoutAtTick: trace.initialLayout ?? null,
        layoutMoment: 'as recorded in the trace header',
      };
    }
    const map = logicalToPhysicalAt(trace, tick);
    if (map.size === 0) {
      return { layoutAtTick: null, layoutMoment: `not yet assigned at tick ${tick}` };
    }
    const width = trace.initialLayout?.length ?? map.size;
    return {
      layoutAtTick: Array.from({ length: width }, (_, logical) => map.get(logical) ?? -1),
      layoutMoment: `at tick ${tick}`,
    };
  })();
  const currentInstructionId =
    activity?.eventsAtTick.find((e) => e.instructionId !== null)?.instructionId ?? null;

  return (
    <div className="view-2d">
      <section aria-label="Program and run configuration" className="view-2d-column">
        <h2>Program</h2>
        <LabControls />
        <details className="missions-2d">
          <summary>Missions</summary>
          <MissionPanel embedded />
        </details>
      </section>
      <section aria-label="Circuit and replay" className="view-2d-column view-2d-main">
        <h2>Circuit journey</h2>
        {trace ? (
          <>
            <TimelineBar />
            <EventLog trace={trace} />
            <CircuitDiagram
              circuit={trace.inputCircuit}
              title="Input circuit (as written)"
              executedIds={activity?.executedInstructionIds}
              currentInstructionId={currentInstructionId}
              selectedInstructionId={
                selection?.kind === 'instruction' ? selection.instructionId : null
              }
              onSelectInstruction={(id) =>
                select({ kind: 'instruction', instructionId: id, circuit: 'input' })
              }
            />
            {trace.compiledCircuit && (
              <CircuitDiagram
                circuit={trace.compiledCircuit}
                title={`Compiled circuit (device ${trace.deviceId ?? 'unknown'})`}
                selectedInstructionId={
                  selection?.kind === 'instruction' ? selection.instructionId : null
                }
                onSelectInstruction={(id) =>
                  select({ kind: 'instruction', instructionId: id, circuit: 'compiled' })
                }
              />
            )}
            {trace.deviceId && (
              <CouplingMap
                deviceId={trace.deviceId}
                layout={layoutAtTick}
                layoutMoment={layoutMoment}
                activeQubits={activity?.activeQubits ?? []}
                activeCouplings={activity?.activeCouplings ?? []}
                selectedQubit={selection?.kind === 'qubit' ? selection.qubit : null}
                onSelectQubit={(q) => select({ kind: 'qubit', qubit: q })}
              />
            )}
            <MetricsPanel trace={trace} />
            <ResultsSection trace={trace} compare={Boolean(trace.results.noisyCounts)} />
          </>
        ) : (
          <p className="hint">
            Run a program or import a trace to explore its journey through parsing, layout, routing,
            translation, optimization, scheduling, execution, and measurement.
          </p>
        )}
      </section>
      <section aria-label="Provenance and selection" className="view-2d-column">
        <div className="view-2d-tools">
          <button type="button" onClick={() => setLegendOpen(true)}>
            City Legend
          </button>
          <button
            type="button"
            onClick={() => useAppStore.getState().setScheduleOpen(true)}
            aria-disabled={!trace}
          >
            Instruction schedule
          </button>
        </div>
        <div className="inspector-inline">
          <Inspector />
        </div>
        <ScenarioPanel />
        <ProvenancePanel trace={trace} />
      </section>
      {legendOpen && <CityLegend onClose={() => setLegendOpen(false)} />}
    </div>
  );
}
