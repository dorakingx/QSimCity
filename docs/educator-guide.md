# QSimCity Educator Guide

QSimCity is a browser-based, offline-capable teaching environment for how
quantum programs are compiled and executed. Everything runs locally: no
accounts, no uploads, no telemetry, and no cost. This guide is for
teachers, club leaders, and outreach volunteers.

## What learners actually see

The full journey of a quantum program — parsing, logical-to-physical
layout, routing with SWAP insertion, translation to native gates,
optimization, scheduling, execution, noise, repeated-shot measurement, and
classical feed-forward — rendered as a believable city where each stage is
a district with a real function. The science underneath is a deterministic
statevector simulator cross-validated against Qiskit, and a reference
compiler whose compiled circuit is what actually executes.

Two honesty rules matter in class:

1. **Vehicles and people are never quantum states.** Trucks carry jobs,
   vans carry classical bits. The in-app Legend states this explicitly —
   a good discussion prompt about what *can* be visualized.
2. **Every number is labeled** EXACT, COMPUTED, SAMPLED, or ILLUSTRATIVE.
   Ask learners to find each kind; the child-level tooltips explain them
   as "measured for real / computed exactly / sampled like dice / just a
   picture".

## The mission path (recommended for ages 10+)

Seven missions with machine-checked completion and immediate feedback,
designed so a first-time learner can finish mission 1 from on-screen
guidance alone:

1. **Light Up the Twin Towers** — build a Bell pair with one tap and watch
   two pylons answer together. Concept: entanglement as perfect correlation.
2. **Three of a Kind** — extend to a GHZ trio with the block builder.
3. **The Long Way Around** — run a program whose qubits are far apart and
   watch SWAP banners trade pylons; then pick a better layout. Concept:
   hardware topology has a cost.
4. **Storm Over the Grid** — turn on noise and compare the Harbor stacks.
   Concept: real machines are imperfect.
5. **Message from the Docks** — measurement steers a later gate via a
   courier van. Concept: classical feed-forward.
6. **The Great Cleanup** — watch redundant gates cancel. Concept:
   compilers optimize.
7. **Count on It** — 32 shots versus 2048. Concept: statistics steady with
   samples.

An optional five-question picture assessment runs before mission 1 and
after mission 6. Results are framed as growth, stored only on the device,
and exportable by the learner. Set the explanation level (Settings) to
child, beginner, or expert to match your class; the certainty labels stay
at every level.

## Classroom logistics

- **Hardware:** any laptop or tablet from the last ~5 years with a browser.
  Chromebooks work. Touch is fully supported, including the builder.
- **Offline:** after one visit the app works without a network — useful
  for locked-down networks; verify once beforehand.
- **No WebGL? Screen readers?** Accessible 2D Mode is the complete
  product, including missions and the builder, and passes WCAG 2.2 AA
  automated checks.
- **Reduced motion** (Settings) stops ambient movement for
  motion-sensitive learners without losing any science.
- **Sound** is off by default and synthesized locally; enable it for the
  gate/measurement cues if the room allows.

## Suggested arcs

- **One session (45-60 min):** Onboarding "Play" → missions 1, 2, 4 →
  free exploration in walk mode with the Legend open.
- **Three sessions:** (1) missions 1-3 plus the Guided Tour chapters on
  layout and routing; (2) missions 4-5 plus the noise dials on the QPU
  campus consoles; (3) missions 6-7, then learners build their own
  circuit in the Lab and defend what the city showed.
- **Advanced students:** switch to expert level, open the Quantum Lab's
  Code tab, and reproduce a committed sample trace; discuss why replays
  are deterministic and what the seed does.

## Where to be careful

`docs/scientific-accuracy.md` lists exactly what is exact versus sampled
versus estimated, and `docs/limitations.md` lists what QSimCity does not
claim to teach (pulse physics, error correction, real-QPU behavior).
Success proxies shown in-app are never called fidelity.
