import type { ReactElement } from 'react';
import type { CertaintyLabel, Trace } from 'qsimcity-trace';
import { CertaintyBadge } from './CertaintyBadge.js';
import { CERTAINTY_GLOSSARY, SOURCE_GLOSSARY } from '../content/explanations.js';
import { useAppStore } from '../store/appStore.js';

/**
 * Provenance and simplification disclosure (spec §10): what produced the
 * data on screen, how certain it is, and which simplifications apply.
 */

export const ACTIVE_SIMPLIFICATIONS: readonly { id: string; text: string }[] = [
  {
    id: 'representative-shot',
    text: 'The animated replay shows one representative sampled trajectory (shot 0). Aggregate statistics summarize all shots.',
  },
  {
    id: 'trajectory-noise',
    text: 'Noise uses the quantum-trajectory method: each shot samples one Kraus branch. Ensemble statistics converge to the channel; a single shot is not "the" state.',
  },
  {
    id: 'playback-time',
    text: 'Playback pacing is presentation time. Model gate durations (shown in the schedule) are estimates, never measured hardware timing.',
  },
  {
    id: 'compiler-model',
    text: 'The QSimCity Reference Compiler is a deliberately simple, deterministic pipeline. It is verified to preserve circuit semantics but does not reproduce Qiskit pass-for-pass.',
  },
  {
    id: 'city-metaphor',
    text: 'Moving objects in the city are jobs, instructions, classical messages, and samples — never quantum amplitudes. Quantum state is not a thing that travels on roads.',
  },
  {
    id: 'success-proxy',
    text: 'Any "estimated success proxy" is a product of modeled error rates. It is not fidelity and is labeled ESTIMATED.',
  },
];

export function ProvenancePanel({ trace }: { trace: Trace | null }): ReactElement {
  const level = useAppStore((s) => s.settings.explanationLevel);
  return (
    <section className="provenance-panel" aria-label="Provenance and simplifications">
      <h3 className="panel-caption">Provenance</h3>
      {trace ? (
        <>
          <dl className="provenance-list">
            <dt>Generator</dt>
            <dd>
              {trace.generator.generator} v{trace.generator.generatorVersion}
            </dd>
            <dt>Seed</dt>
            <dd>
              <code>{trace.seed}</code> (deterministic; rerun reproduces results)
            </dd>
            <dt>Input hash</dt>
            <dd>
              <code>{trace.inputHash}</code>
            </dd>
            <dt>Package versions</dt>
            <dd>
              {Object.entries(trace.packageVersions)
                .map(([k, v]) => `${k} ${v}`)
                .join(', ')}
            </dd>
            {trace.deviceId && (
              <>
                <dt>Device model</dt>
                <dd>{trace.deviceId}</dd>
              </>
            )}
            <dt>Data sources in this trace</dt>
            <dd>
              <ul>
                {[...new Set(trace.events.map((e) => e.source))].map((source) => (
                  <li key={source}>{SOURCE_GLOSSARY[source][level]}</li>
                ))}
              </ul>
            </dd>
          </dl>
        </>
      ) : (
        <p className="hint">Run a circuit or import a trace to see its provenance.</p>
      )}
      <h3 className="panel-caption">Certainty legend</h3>
      <dl className="certainty-legend">
        {(Object.keys(CERTAINTY_GLOSSARY) as CertaintyLabel[]).map((label) => (
          <div key={label} className="certainty-legend-row">
            <dt>
              <CertaintyBadge certainty={label} />
            </dt>
            <dd>{CERTAINTY_GLOSSARY[label][level]}</dd>
          </div>
        ))}
      </dl>
      <h3 className="panel-caption">Active simplifications</h3>
      <ul className="simplification-list">
        {ACTIVE_SIMPLIFICATIONS.map((s) => (
          <li key={s.id}>{s.text}</li>
        ))}
      </ul>
    </section>
  );
}
