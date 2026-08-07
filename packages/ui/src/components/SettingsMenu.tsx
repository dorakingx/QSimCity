import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useAppStore } from '../store/appStore.js';

/** Settings: quality preset, audio, motion, day/night, particles, labels. */
export function SettingsMenu(): ReactElement {
  const settings = useAppStore((s) => s.settings);
  const { updateSettings, clearLocalData, showToast } = useAppStore.getState();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The popover overlays the controls behind it, so Tab must stay inside it
  // and Escape must close it from anywhere — an earlier version put the
  // Escape handler on the popover itself, which never fired because focus
  // stayed on the trigger.
  useFocusTrap(popoverRef, open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        type="button"
        ref={triggerRef}
        aria-expanded={open}
        // `aria-haspopup="true"` announces a *menu*; this is a group of form
        // controls, which is what `dialog` describes.
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        Settings
      </button>
      {open && (
        <div className="settings-popover" ref={popoverRef} role="group" aria-label="Settings">
          <div className="field-row">
            <label htmlFor="set-quality">Visual quality</label>
            <select
              id="set-quality"
              value={settings.quality}
              onChange={(e) =>
                updateSettings({ quality: e.target.value as 'high' | 'balanced' | 'low' })
              }
            >
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="field-row">
            <label htmlFor="set-explanation-level">Explanation level</label>
            <select
              id="set-explanation-level"
              value={settings.explanationLevel}
              data-mission-target="settings-explanation-level"
              onChange={(e) =>
                updateSettings({
                  explanationLevel: e.target.value as 'child' | 'beginner' | 'expert',
                })
              }
            >
              <option value="child">Child (short and simple)</option>
              <option value="beginner">Beginner</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          <div className="field-row">
            <label htmlFor="set-daynight">Time of day</label>
            <select
              id="set-daynight"
              value={settings.timeOfDay}
              onChange={(e) =>
                updateSettings({ timeOfDay: e.target.value as 'day' | 'golden' | 'night' })
              }
            >
              <option value="day">Day</option>
              <option value="golden">Golden hour</option>
              <option value="night">Night</option>
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
            <p className="field-note">
              Rain over the QPU is the city&rsquo;s only rendering of sampled noise events. Turning
              particles off hides that signal; the Compare and results panels still show it.
            </p>
          </div>
          <div className="field-row field-row-checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.singleKeyShortcuts}
                onChange={(e) => updateSettings({ singleKeyShortcuts: e.target.checked })}
              />
              Single-key shortcuts
            </label>
            <p className="field-note">
              Turns off the unmodified letter and punctuation shortcuts (T, I, ?, comma, period,
              slash, and Space for play). Escape and Ctrl/Cmd&#8209;K keep working.
            </p>
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
