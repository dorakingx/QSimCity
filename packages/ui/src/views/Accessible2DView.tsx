import type { ReactElement } from 'react';
import { activityAtTick } from '@qsimcity/world';
import { useAppStore } from '../store/appStore.js';
import { LabControls } from '../components/LabControls.js';
import { CircuitDiagram } from '../components/CircuitDiagram.js';
import { CouplingMap } from '../components/CouplingMap.js';
import { TimelineBar } from '../components/TimelineBar.js';
import { ResultsSection } from '../components/ResultsSection.js';
import { MetricsPanel } from '../components/MetricsPanel.js';
import { ProvenancePanel } from '../components/ProvenancePanel.js';
import { EventLog } from '../components/EventLog.js';

/**
 * Accessible 2D Mode (spec §16): the complete core workflow without any
 * WebGL. This view is also the automatic fallback when WebGL is
 * unavailable.
 */
export function Accessible2DView(): ReactElement {
  const trace = useAppStore((s) => s.trace);
  const tick = useAppStore((s) => s.playbackTick);
  const selection = useAppStore((s) => s.selection);
  const { select } = useAppStore.getState();
  const activity = trace ? activityAtTick(trace, tick) : null;
  const currentInstructionId =
    activity?.eventsAtTick.find((e) => e.instructionId !== null)?.instructionId ?? null;

  return (
    <div className="view-2d">
      <section aria-label="Program and run configuration" className="view-2d-column">
        <h2>Program</h2>
        <LabControls />
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
                layout={trace.initialLayout}
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
      <section aria-label="Provenance" className="view-2d-column">
        <ProvenancePanel trace={trace} />
      </section>
    </div>
  );
}
