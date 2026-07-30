import { useEffect, useState, type ReactElement } from 'react';
import { useAppStore, DEFAULT_CONFIG } from '../store/appStore.js';
import { SCENARIOS, getScenario, scenarioRunConfig } from './scenarios.js';
import { runVqeScenario } from './vqe.js';

/**
 * Scenario browser and runner (spec §9). Starting a scenario applies its
 * deterministic configuration, runs it, and evaluates the objective
 * completion condition against the produced trace. Reset restores defaults.
 */
export function ScenarioPanel(): ReactElement | null {
  const activeScenarioId = useAppStore((s) => s.activeScenarioId);
  const trace = useAppStore((s) => s.trace);
  const running = useAppStore((s) => s.running);
  const [vqeRunning, setVqeRunning] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const { setActiveScenario, updateConfig, run, showToast } = useAppStore.getState();

  const scenario = activeScenarioId ? getScenario(activeScenarioId) : null;
  const complete = scenario && trace ? scenario.isComplete(trace) : false;

  useEffect(() => {
    if (!scenario) return;
    if (scenario.kind === 'vqe') {
      setVqeRunning(true);
      void runVqeScenario({ seed: scenario.seed, shots: scenario.config.shots ?? 512 }).then(
        ({ trace: vqeTrace, finalEnergy }) => {
          useAppStore.setState({ trace: vqeTrace, playbackTick: 0, playbackPlaying: true });
          setVqeRunning(false);
          showToast(`VQE finished: estimated energy ${finalEnergy.toFixed(3)} (exact -1.118).`);
        },
      );
    } else {
      updateConfig(scenarioRunConfig(scenario));
      void run();
    }
    // Scenario start is intentionally the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              {running || vqeRunning
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
