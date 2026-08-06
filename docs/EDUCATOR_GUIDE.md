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

## Zero-setup 45-minute lesson plan

Nothing to install, no accounts, no logins, no marking. One tab per
learner. If your machines have no GPU or WebGL is blocked, use
**Accessible 2D** for the whole lesson — every step below works there.

**Before the room fills (2 min, you):** open the app once so the service
worker caches it; after that it runs offline. Write the URL on the board.

| Time | Phase | You do | Learners do | Objective |
| --- | --- | --- | --- | --- |
| 0:00–0:03 | Pre-check | Hand out the five picture questions on paper, or ask learners to take the in-app quiz and *not* discuss answers | Answer five picture questions | Baseline (see `LEARNING_EVALUATION.md`) |
| 0:03–0:08 | Hook | Open Explore on the projector. Fly once over the city. Ask: "this is one program being compiled — where do you think it starts?" | Watch, guess | Orientation |
| 0:08–0:18 | Mission 1 | Circulate. Point at the numbered steps rather than answering | Pick "Play a mission", tap **Bell pair**, press **Run**, watch the replay end to end | Entanglement as perfect correlation; the pipeline has stages |
| 0:18–0:24 | Discussion | Open the **Legend**. Ask: "what is in the trucks?" | Answer; find one `SAMPLED` and one `EXACT` badge on screen | Nothing quantum travels; every number is labelled |
| 0:24–0:34 | Mission 3 | Ask them to count SWAP banners before and after changing the layout | Run **The Long Way Around** with the bad layout, count SWAPs, switch to the interaction layout, re-run | Routing costs operations; layout choice matters |
| 0:34–0:40 | Mission 4 | Put two harbours side by side on the projector | Turn noise on, compare the container stacks | Noise shifts a distribution; it is not a "wrong answer" |
| 0:40–0:45 | Post-check and close | Collect the post-test; ask the misconception question aloud | Answer the same five questions; answer "what travels on the roads?" | Measure change; catch the transport misconception |

**If you have only 20 minutes:** rows 0:08–0:18 and 0:18–0:24 alone deliver
objectives 1, 7, and 8.

**If the class runs long:** Mission 5 (translation) and Mission 6
(optimisation) extend naturally, and the Guided Tour narrates the whole
pipeline hands-free.

### What to look for while circulating

- A learner who says "the qubit is driving down the road" has acquired the
  transport misconception. Open the Legend with them; it is the one
  sentence that fixes it.
- A learner who reads the histogram as "the answer is 00" has missed the
  distribution idea. Ask them to raise the shot count and watch the bars
  settle.
- A learner who finishes early: give them **Reset mission** and ask them to
  predict the SWAP count *before* re-running.

### Assessment and data

The in-app quiz is optional, growth-framed, never graded, and stored only in
the learner's own browser — **it is not collected and cannot be collected by
the app**. If you want data for a study, gather it on paper or through your
institution's own survey tool, with consent. QSimCity has no telemetry and
no accounts by design (see [privacy.md](privacy.md)), and no learning
outcomes have been measured yet (see
[LEARNING_EVALUATION.md](LEARNING_EVALUATION.md)).

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
