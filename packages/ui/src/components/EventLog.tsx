import type { ReactElement } from 'react';
import { activityAtTick, districtForStage } from '@qsimcity/world';
import type { Trace, TraceEvent } from 'qsimcity-trace';
import { useAppStore } from '../store/appStore.js';
import { CertaintyBadge } from './CertaintyBadge.js';

/** Human-readable narration of a trace event (shared by 2D mode and tour). */
export function describeEvent(ev: TraceEvent): string {
  const p = ev.payload as Record<string, unknown>;
  switch (ev.eventType) {
    case 'program.loaded':
      return `Program loaded: ${String(p['numQubits'] ?? '?')} qubits, ${String(p['instructions'] ?? '?')} instructions.`;
    case 'program.parsed':
      return 'Program parsed into the intermediate representation.';
    case 'circuit.normalized':
      return `Circuit normalized to ${String(p['instructionCount'] ?? '?')} elementary instructions.`;
    case 'gate.decomposed':
      return `Composite gate ${String(p['gate'] ?? '?')} decomposed into ${String(p['expandedInto'] ?? '?')} elementary gates.`;
    case 'layout.assigned':
      return `Initial layout assigned (${String(p['method'] ?? '?')}): logical qubits placed on physical qubits ${JSON.stringify(p['layout'] ?? [])}.`;
    case 'route.selected':
      return `Route selected across physical qubits ${JSON.stringify(p['path'] ?? [])}.`;
    case 'routing.swap_inserted':
      return `SWAP inserted between physical qubits ${JSON.stringify(p['physicalQubits'] ?? ev.physicalQubits)}.`;
    case 'gate.translated':
      return `Gates translated to the native basis {${(p['basisGates'] as string[] | undefined)?.join(', ') ?? '?'}}.`;
    case 'gate.cancelled':
      return `${String(p['cancelledCount'] ?? '?')} redundant gates cancelled.`;
    case 'circuit.optimized':
      return `Optimization complete: ${String(p['instructionCount'] ?? p['passCount'] ?? '?')} instructions remain.`;
    case 'instruction.scheduled':
      return `Instruction scheduled at ${String(p['startNs'] ?? '?')} ns (model duration ${String(p['durationNs'] ?? '?')} ns).`;
    case 'execution.started':
      return `Execution started: ${String(p['shots'] ?? '?')} shots${p['noisy'] ? ' with noise' : ''}.`;
    case 'gate.executed':
      return `Gate ${String(p['gate'] ?? '?')} executed on qubit(s) ${ev.logicalQubits.join(', ')}${p['phase'] === 'noisy' ? ' (noisy pass)' : ''}.`;
    case 'noise.applied': {
      const kind = String(p['kind'] ?? 'noise');
      return `Noise event: ${kind.replace(/_/g, ' ')} on qubit ${ev.logicalQubits.join(', ')}.`;
    }
    case 'measurement.sampled':
      return `Qubit ${ev.logicalQubits.join(', ')} measured: representative outcome ${String(p['outcome'] ?? '?')} into classical bit ${String(p['clbit'] ?? '?')}${p['readoutFlipped'] ? ' (readout error flipped it)' : ''}.`;
    case 'classical.condition_evaluated':
      return `Classical condition ${String(p['creg'] ?? '?')} == ${String(p['expected'] ?? '?')} evaluated: register held ${String(p['actual'] ?? '?')}, so the operation ${p['satisfied'] ? 'fired' : 'was skipped'}.`;
    case 'optimizer.iteration_started':
      return `Variational optimizer iteration ${String(p['iteration'] ?? '?')} started.`;
    case 'optimizer.iteration_completed':
      return `Optimizer iteration ${String(p['iteration'] ?? '?')} completed: energy ${String(p['energy'] ?? '?')}.`;
    case 'mitigation.applied':
      return 'Error mitigation applied to the results.';
    case 'execution.completed':
      return 'Execution completed.';
  }
}

/** Timeline event log for the current tick (2D mode's live narration). */
export function EventLog({ trace }: { trace: Trace }): ReactElement {
  const tick = useAppStore((s) => s.playbackTick);
  const activity = activityAtTick(trace, tick);
  return (
    <section className="event-log" aria-label="Events at the current timeline position">
      <h3 className="panel-caption">
        Tick {activity.tick} of {activity.maxTick}
      </h3>
      {activity.eventsAtTick.length === 0 ? (
        <p className="hint">No events at this tick.</p>
      ) : (
        <ul>
          {activity.eventsAtTick.map((ev) => (
            <li key={ev.eventId}>
              <span className="event-district">{districtForStage(ev.stage).name}:</span>{' '}
              {describeEvent(ev)} <CertaintyBadge certainty={ev.certainty} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
