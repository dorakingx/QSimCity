import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useAppStore } from '../store/appStore.js';

/** Settings: quality preset, audio, motion, day/night, particles, labels. */
export function SettingsMenu(): ReactElement {
  const settings = useAppStore((s) => s.settings);
  const { updateSettings, clearLocalData, showToast } = useAppStore.getState();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
      >
        Settings
      </button>
      {open && (
        <div
          className="settings-popover"
          role="group"
          aria-label="Settings"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <div className="field-row">
            <label htmlFor="set-quality">Visual quality</label>
            <select
              id="set-quality"
              value={settings.quality}
              onChange={(e) => updateSettings({ quality: e.target.value as 'high' | 'balanced' | 'low' })}
            >
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="field-row">
            <label htmlFor="set-daynight">Time of day</label>
            <select
              id="set-daynight"
              value={settings.dayNight}
              onChange={(e) => updateSettings({ dayNight: e.target.value as 'day' | 'night' })}
            >
              <option value="night">Night</option>
              <option value="day">Day</option>
            </select>
          </div>
          <div className="field-row field-row-checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.audioEnabled}
                onChange={(e) => updateSettings({ audioEnabled: e.target.checked })}
              />
              Sound (starts only after you enable it)
            </label>
          </div>
          {settings.audioEnabled && (
            <div className="field-row">
              <label htmlFor="set-volume">Volume: {Math.round(settings.audioVolume * 100)}%</label>
              <input
                id="set-volume"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.audioVolume}
                onChange={(e) => updateSettings({ audioVolume: Number(e.target.value) })}
              />
            </div>
          )}
          <div className="field-row field-row-checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
              />
              Reduce motion
            </label>
          </div>
          <div className="field-row field-row-checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.particles}
                onChange={(e) => updateSettings({ particles: e.target.checked })}
              />
              Particles
            </label>
          </div>
          <div className="field-row field-row-checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.labels}
                onChange={(e) => updateSettings({ labels: e.target.checked })}
              />
              Floating labels
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              clearLocalData();
              showToast('Local data cleared. Settings reset to defaults.');
            }}
          >
            Clear locally stored data
          </button>
        </div>
      )}
    </div>
  );
}
