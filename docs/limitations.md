# Known Limitations

An honest list of what QSimCity does not do or does imperfectly. None of
these are hidden behind marketing language in the product; where a
limitation touches a number on screen, the certainty label says so.

## Scientific scope

- **Small circuits only.** Exact statevector simulation is capped at 12
  qubits; nothing is approximated silently beyond that — larger programs
  are rejected with a clear message.
- **Gate-level only.** No pulse-level physics, no calibration drift, no
  crosstalk, no leakage. The noise model is four standard channels
  (depolarizing 1q/2q, amplitude damping, phase damping) plus readout
  error, applied per instruction.
- **No error correction.** Logical qubits here mean "program qubits before
  layout", not fault-tolerant logical qubits.
- **No real-QPU submission.** Everything is simulation; imported Qiskit
  traces replay real transpiler decisions but still simulate execution.
- **Success proxies are not fidelity.** Comparison metrics are labeled for
  what they are (for example total-variation distance between count
  distributions).

## Visualization semantics

- **The city is a metaphor with a contract.** District activity, the
  convoy, couriers, banners, stacks, and weather derive from the trace;
  ambient traffic, pedestrians, clouds, and water are ILLUSTRATIVE and say
  so in the Legend. No amplitude or state vector is ever drawn as a moving
  object.
- **Counts stacks show representative records.** The Harbor stacks count
  the representative per-measurement records present in the trace events
  (one per measurement per simulation pass), not all N shots; the full
  histograms live in the results panels. The Legend and inspector say
  exactly this.
- **Playback pacing is presentation.** Tick pacing is uniform for
  watchability; real per-instruction durations appear in the schedule
  panel as model estimates (ESTIMATED).

## Engineering

- **Performance numbers are host-specific.** The committed FPS, Lighthouse,
  and soak evidence was measured on the development machine (Apple
  Silicon, Chromium); the tools rerun anywhere but absolute numbers vary.
- **Visual baselines are platform-locked.** Screenshot tests are pinned to
  darwin renderers; other platforms regenerate their own baselines.
- **Reduced-motion trades life for stability.** With reduced motion on,
  ambient city life pauses entirely (that is the point), so the city looks
  intentionally still.
- **Screen-reader testing** was performed against the accessibility tree
  (axe plus role/name assertions), not with a specific commercial screen
  reader.
- **Localization**: English only in v1; the architecture leaves room for
  i18n but no translation exists yet.
