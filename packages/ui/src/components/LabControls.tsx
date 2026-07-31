import { useRef, useState, type ReactElement } from 'react';
import { DEVICES, SAMPLE_CIRCUITS } from '@qsimcity/domain';
import { MAX_SHOTS } from '@qsimcity/simulator';
import { TRACE_FILE_EXTENSION, TRACE_LIMITS } from 'qsimcity-trace';
import { useAppStore } from '../store/appStore.js';
import { encodeShareUrl } from '../store/shareUrl.js';

/**
 * Quantum Lab configuration (spec §7.3): program input, run parameters,
 * noise, layout, import/export, and shareable URLs. Inline validation with
 * line/column parser errors; user input is preserved on error.
 */
export function LabControls(): ReactElement {
  const config = useAppStore((s) => s.config);
  const running = useAppStore((s) => s.running);
  const progress = useAppStore((s) => s.runProgress);
  const error = useAppStore((s) => s.runError);
  const trace = useAppStore((s) => s.trace);
  const { updateConfig, loadSample, run, cancelRun, importTraceJson, exportTrace, showToast } =
    useAppStore.getState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const onImportFile = async (file: File): Promise<void> => {
    setImportError(null);
    if (file.size > TRACE_LIMITS.maxImportBytes) {
      setImportError(
        `File is ${(file.size / (1024 * 1024)).toFixed(1)} MiB; the import limit is ${
          TRACE_LIMITS.maxImportBytes / (1024 * 1024)
        } MiB.`,
      );
      return;
    }
    const text = await file.text();
    const result = importTraceJson(text);
    if (!result.ok) setImportError(result.error ?? 'Import failed');
    else showToast('Trace imported.');
  };

  const onExport = (): void => {
    const exported = exportTrace();
    if (!exported) return;
    const blob = new Blob([exported.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exported.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onShare = async (): Promise<void> => {
    const url = encodeShareUrl(config);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Shareable link copied to clipboard.');
    } catch {
      showToast(`Shareable link: ${url}`);
    }
  };

  return (
    <form
      className="lab-controls"
      aria-label="Quantum Lab configuration"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <div className="field-row">
        <label htmlFor="lab-sample">Sample circuit</label>
        <select
          id="lab-sample"
          value={config.sampleId ?? ''}
          onChange={(e) => {
            if (e.target.value) loadSample(e.target.value);
          }}
        >
          <option value="">Custom program</option>
          {SAMPLE_CIRCUITS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row field-row-editor">
        <label htmlFor="lab-qasm">
          OpenQASM 2.0 program <span className="hint">(max 12 qubits for exact simulation)</span>
        </label>
        <textarea
          id="lab-qasm"
          value={config.qasm}
          spellCheck={false}
          rows={10}
          onChange={(e) => updateConfig({ qasm: e.target.value, sampleId: null })}
          aria-invalid={error !== null}
          aria-describedby={error ? 'lab-qasm-error' : undefined}
        />
        {error && (
          <p id="lab-qasm-error" className="field-error" role="alert">
            {error.line !== undefined ? `Line ${error.line}, column ${error.col}: ` : ''}
            {error.message}
          </p>
        )}
      </div>

      <div className="field-grid">
        <div className="field-row">
          <label htmlFor="lab-shots">Shots</label>
          <input
            id="lab-shots"
            type="number"
            min={1}
            max={MAX_SHOTS}
            value={config.shots}
            onChange={(e) => updateConfig({ shots: Number(e.target.value) })}
          />
        </div>
        <div className="field-row">
          <label htmlFor="lab-seed">Seed</label>
          <input
            id="lab-seed"
            type="text"
            value={config.seed}
            onChange={(e) => updateConfig({ seed: e.target.value })}
          />
        </div>
        <div className="field-row">
          <label htmlFor="lab-device">Device topology</label>
          <select
            id="lab-device"
            value={config.deviceId}
            onChange={(e) => updateConfig({ deviceId: e.target.value })}
          >
            {DEVICES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="lab-layout">Initial layout</label>
          <select
            id="lab-layout"
            value={Array.isArray(config.layoutMethod) ? 'manual' : config.layoutMethod}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'trivial' || v === 'interaction') updateConfig({ layoutMethod: v });
            }}
          >
            <option value="interaction">Automatic (interaction heuristic)</option>
            <option value="trivial">Trivial (logical i on physical i)</option>
            {Array.isArray(config.layoutMethod) && <option value="manual">Manual</option>}
          </select>
        </div>
        <div className="field-row field-row-checkbox">
          <label>
            <input
              type="checkbox"
              checked={config.optimize}
              onChange={(e) => updateConfig({ optimize: e.target.checked })}
            />
            Optimize compiled circuit
          </label>
        </div>
        <div className="field-row field-row-checkbox">
          <label>
            <input
              type="checkbox"
              checked={config.noiseEnabled}
              onChange={(e) => updateConfig({ noiseEnabled: e.target.checked })}
            />
            Enable noise model
          </label>
        </div>
      </div>

      {config.noiseEnabled && (
        <fieldset className="noise-fieldset">
          <legend>Noise parameters (trajectory model, results labeled SAMPLED)</legend>
          {(
            [
              ['readoutError', 'Readout error', 0.5],
              ['depolarizing1q', 'Depolarizing (1-qubit gates)', 0.2],
              ['depolarizing2q', 'Depolarizing (2-qubit gates)', 0.2],
              ['amplitudeDamping', 'Amplitude damping', 0.5],
              ['phaseDamping', 'Phase damping', 0.5],
            ] as const
          ).map(([key, label, max]) => (
            <div className="field-row" key={key}>
              <label htmlFor={`noise-${key}`}>
                {label}: {config.noise[key].toFixed(3)}
              </label>
              <input
                id={`noise-${key}`}
                type="range"
                min={0}
                max={max}
                step={0.001}
                value={config.noise[key]}
                onChange={(e) =>
                  updateConfig({ noise: { ...config.noise, [key]: Number(e.target.value) } })
                }
              />
            </div>
          ))}
        </fieldset>
      )}

      <div className="lab-actions">
        {running ? (
          <>
            <progress value={progress} max={1} aria-label="Run progress" />
            <button type="button" onClick={cancelRun}>
              Cancel
            </button>
          </>
        ) : (
          <button type="submit" className="primary">
            Run
          </button>
        )}
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Import trace
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={`${TRACE_FILE_EXTENSION},.json`}
          className="visually-hidden"
          aria-label={`Import a ${TRACE_FILE_EXTENSION} trace file (limit ${TRACE_LIMITS.maxImportBytes / (1024 * 1024)} MiB)`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImportFile(file);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={onExport} disabled={!trace}>
          Export trace
        </button>
        <button type="button" onClick={() => void onShare()} disabled={config.sampleId === null}>
          Copy share link
        </button>
      </div>
      {importError && (
        <p className="field-error" role="alert">
          {importError}
        </p>
      )}
      {config.sampleId === null && (
        <p className="hint">
          Share links are available for bundled samples (custom programs stay local).
        </p>
      )}
    </form>
  );
}
