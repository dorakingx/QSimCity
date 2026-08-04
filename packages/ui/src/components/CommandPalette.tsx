import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { SAMPLE_CIRCUITS } from '@qsimcity/domain';
import { DISTRICTS } from '@qsimcity/world';
import { useAppStore, type AppMode } from '../store/appStore.js';

/**
 * Command palette (Ctrl/Cmd-K or /): search across commands, modes,
 * districts, and samples. Focus is trapped while open; Escape closes.
 */

interface Command {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  run(): void;
}

export function CommandPalette(): ReactElement | null {
  const open = useAppStore((s) => s.paletteOpen);
  // Mount/unmount on open so local state (query, highlight) starts fresh
  // every time without effect-driven resets.
  if (!open) return null;
  return <PaletteContent />;
}

function PaletteContent(): ReactElement {
  const { setPaletteOpen } = useAppStore.getState();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const s = useAppStore.getState();
    const modes: [AppMode, string][] = [
      ['home', 'Go to Home'],
      ['tour', 'Start Guided Tour'],
      ['explore', 'Explore the city'],
      ['lab', 'Open Quantum Lab'],
      ['compare', 'Open Compare Mode'],
      ['accessible-2d', 'Open Accessible 2D Mode'],
    ];
    return [
      ...modes.map(([mode, title]) => ({
        id: `mode-${mode}`,
        title,
        group: 'Modes',
        run: () => s.setMode(mode),
      })),
      ...SAMPLE_CIRCUITS.map((sample) => ({
        id: `sample-${sample.id}`,
        title: `Load sample: ${sample.title}`,
        group: 'Samples',
        run: () => {
          s.loadSample(sample.id);
          s.setMode('lab');
        },
      })),
      ...DISTRICTS.map((d) => ({
        id: `district-${d.id}`,
        title: `Inspect district: ${d.name}`,
        group: 'Districts',
        run: () => s.select({ kind: 'district', districtId: d.id }),
      })),
      {
        id: 'run',
        title: 'Run current program',
        group: 'Actions',
        run: () => void s.run(),
      },
      {
        id: 'play-pause',
        title: 'Play / pause replay',
        group: 'Actions',
        run: () => (useAppStore.getState().playbackPlaying ? s.pause() : s.play()),
      },
      {
        id: 'help',
        title: 'Open help and keyboard map',
        group: 'Actions',
        run: () => s.setHelpOpen(true),
      },
      {
        id: 'cycle-time-of-day',
        title: 'Cycle time of day (day / golden hour / night)',
        group: 'Actions',
        run: () => {
          const current = useAppStore.getState().settings.timeOfDay;
          const next = current === 'day' ? 'golden' : current === 'golden' ? 'night' : 'day';
          s.updateSettings({ timeOfDay: next });
        },
      },
    ];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.title.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    // Autofocus on mount; local state starts fresh because the component
    // only mounts while open (the parent returns null otherwise).
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const runCommand = (c: Command): void => {
    setPaletteOpen(false);
    c.run();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setPaletteOpen(false);
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setPaletteOpen(false);
          else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter' && filtered[activeIndex]) {
            e.preventDefault();
            runCommand(filtered[activeIndex]!);
          }
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search commands, samples, districts…"
          aria-label="Search commands"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-listbox"
          aria-activedescendant={
            filtered[activeIndex] ? `palette-${filtered[activeIndex]!.id}` : undefined
          }
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
        />
        <ul id="palette-listbox" role="listbox" aria-label="Matching commands">
          {filtered.length === 0 && <li className="hint">No matching commands.</li>}
          {filtered.map((c, i) => (
            <li
              key={c.id}
              id={`palette-${c.id}`}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'active' : ''}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => runCommand(c)}
            >
              <span className="palette-group">{c.group}</span> {c.title}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
