import { useEffect, useState, type ReactElement } from 'react';
import { useAppStore, DEFAULT_CONFIG } from '../store/appStore.js';
import { SCENARIOS, getScenario, scenarioRunConfig } from './scenarios.js';
import { runVqeScenario } from './vqe.js';

/** Kicks off a scenario run; VQE progress rides the store's running flag. */
function startScenario(scenarioId: string): void {
  const scenario = getScenario(scenarioId);
  const s = useAppStore.getState();
  if (scenario.kind === 'vqe') {
    useAppStore.setState({ running: true, runProgress: 0 });
    void runVqeScenario({ seed: scenario.seed, shots: scenario.config.shots ?? 512 }).then(
      ({ trace, finalEnergy }) => {
        useAppStore.setState({
          trace,
          running: false,
          runProgress: 1,
          playbackTick: 0,
          playbackPlaying: true,
        });
        useAppStore
          .getState()
          .showToast(`VQE finished: estimated energy ${finalEnergy.toFixed(3)} (exact -1.118).`);
      },
    );
  } else {
    s.updateConfig(scenarioRunConfig(scenario));
    void s.run();
  }
}

/**
 * Scenario browser and runner (spec §9). Starting a scenario applies its
 * deterministic configuration, runs it, and evaluates the objective
 * completion condition against the produced trace. Reset restores defaults.
 */
export function ScenarioPanel(): ReactElement | null {
  const activeScenarioId = useAppStore((s) => s.activeScenarioId);
  const trace = useAppStore((s) => s.trace);
  const running = useAppStore((s) => s.running);
  const [listOpen, setListOpen] = useState(false);
  const { setActiveScenario, updateConfig, showToast } = useAppStore.getState();

  const scenario = activeScenarioId ? getScenario(activeScenarioId) : null;
  const complete = scenario && trace ? scenario.isComplete(trace) : false;

  // Runs also when the id is set externally (in-world console actions).
  useEffect(() => {
    if (activeScenarioId) startScenario(activeScenarioId);
  }, [activeScenarioId]);

  return (
    <div className="scenario-dock">
      <button
        type="button"
        aria-expanded={listOpen}
        onClick={() => setListOpen(!listOpen)}
      >
        Scenarios {scenario ? `— ${scenario.title}` : ''}
      </button>
      {listOpen && (
        <ul className="scenario-list" aria-label="Scenarios">
          {SCENARIOS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={s.id === activeScenarioId ? 'true' : undefined}
                onClick={() => {
                  setListOpen(false);
                  setActiveScenario(s.id);
                }}
              >
                <strong>{s.title}</strong>
                <span className="hint"> {s.purpose}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {scenario && (
        <section className="scenario-card" aria-label={`Scenario: ${scenario.title}`}>
          <h3>{scenario.title}</h3>
          <p>{scenario.purpose}</p>
          <h4>Expected causal chain</h4>
          <ol>
            {scenario.causalChain.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <dl>
            <dt>Healthy state</dt>
            <dd>{scenario.healthyState}</dd>
            <dt>Failure state</dt>
            <dd>{scenario.failureState}</dd>
            <dt>Comparison metric</dt>
            <dd>{scenario.comparisonMetric}</dd>
            <dt>Completion</dt>
            <dd>
              {running
                ? 'Running…'
                : complete
                  ? `Complete: ${scenario.completionText}`
                  : `Not yet complete. Goal: ${scenario.completionText}`}
            </dd>
          </dl>
          <div className="inspector-actions">
            <button
              type="button"
              onClick={() => {
                setActiveScenario(null);
                updateConfig({ ...DEFAULT_CONFIG });
                showToast('Scenario reset. Configuration restored to defaults.');
              }}
            >
              Reset scenario
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
