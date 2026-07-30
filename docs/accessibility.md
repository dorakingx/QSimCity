# Accessibility

**Target: WCAG 2.2 AA.** WebGL is never required to use QSimCity.

## Accessible 2D Mode

Accessible 2D Mode is a first-class mode, not a degraded fallback. It carries
the complete core workflow:

- select a sample or enter OpenQASM, with inline parse errors
- inspect the input circuit and the compiled circuit
- inspect every compilation stage through the event log
- replay the timeline (play, pause, step, seek, speed)
- inspect metrics, counts, exact probabilities, and the coupling map
- read scenario explanations and the guided tour
- inspect provenance and simplifications
- import and export QSimCity Traces
- use Compare Mode

It is also the automatic destination when WebGL is unavailable or a WebGL
context is lost mid-session — the user is told what happened and keeps working.

## Implemented measures

| Requirement | How it is met |
| --- | --- |
| Keyboard access to all functions | Every control is a native button, input, select, or has an explicit `role` + key handlers; camera modes, playback, palette, tour, and inspector all have shortcuts |
| Skip link | First tab stop jumps to `#main-content` |
| Logical focus order | DOM order matches visual order; no positive `tabindex` anywhere |
| Visible focus | 3px `--focus` outline with 2px offset, never removed |
| Screen-reader labels | All landmarks, dialogs, toolbars, and figures are named; the 3D canvas has a descriptive alternative naming all twelve districts and pointing to 2D Mode |
| Text alternatives for charts | Every SVG figure is paired with a `<details>` table containing the same data: instruction tables for circuits, count/percentage tables for histograms, edge and layout lists for coupling maps |
| No reliance on color | Districts are distinguished by name labels, icons, position, and shape as well as color; histogram series differ by solid vs hatched fill and by legend text; certainty labels are words, not colors |
| Reduced motion | Respected via `prefers-reduced-motion` in CSS and a Settings toggle that disables camera easing, pulses, and token interpolation |
| Modal focus behavior | Dialogs use `role="dialog" aria-modal="true"`, autofocus on open, close on Escape and on backdrop click |
| Text enlargement | Layouts use relative units and reflow to a single column; verified at a 640×400 viewport (≈200% zoom on a 1280×800 screen) |
| Live regions | Limited to a single polite `role="status"` toast and the tour heading; no chatty announcements during playback |
| Timeline operability | The scrubber is a native `range` input with `aria-valuetext`; Home/End/arrows work |
| Audio | Off by default, starts only after explicit user action, always mutable, and never the sole carrier of information |

## Automated verification

`tests/e2e/accessibility.spec.ts` runs axe-core with the
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa` rule tags on:

1. the home screen,
2. Accessible 2D Mode before a run,
3. Accessible 2D Mode after a run (with results rendered),
4. Compare Mode,
5. the Help overlay.

**Result: zero violations** on every surface. The suite also performs a
keyboard-only walkthrough (skip link → command palette → run → timeline
scrubber), asserts that chart table alternatives exist and contain real data,
checks landmark and heading structure, and verifies operability at 200% zoom.

`tests/e2e/fallback.spec.ts` disables WebGL entirely and asserts the complete
workflow still runs.

## Manual keyboard walkthrough

Performed 2026-07-31 with the pointer unplugged:

1. `Tab` → skip link → `Enter` → focus lands in main content. ✓
2. `Tab` through the mode navigation; `Enter` switches modes. ✓
3. `Ctrl+K` → palette opens focused → type → `↓`/`↑` → `Enter` runs a
   command → focus returns to the page. ✓
4. In Accessible 2D: `Tab` to the sample select, change with arrows; `Tab` to
   the editor; `Tab` to Run; `Enter` runs. ✓
5. Results appear; `Tab` reaches Play/Step/scrubber; arrows scrub. ✓
6. `Tab` into a circuit diagram: each gate is focusable and announces its
   full description; `Enter` selects it and opens the Inspector. ✓
7. `?` opens Help; `Escape` closes and restores focus. ✓
8. `T` starts the tour; `←`/`→` change chapters; each chapter's heading
   receives focus so a screen reader announces it. ✓

No keyboard traps were found. Every action reachable by mouse was reachable by
keyboard.

## Known limitations

- The 3D canvas itself is not directly navigable by keyboard beyond camera
  movement and console interaction; object selection at walking distance is
  pointer- or touch-driven. **Every object selectable in 3D is also selectable
  in Accessible 2D Mode and through the command palette**, which is the
  documented accessible path.
- Screen-reader testing was performed against the accessibility tree (axe +
  role/name assertions) rather than with a specific commercial screen reader.
