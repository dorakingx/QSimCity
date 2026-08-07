# WISER Education submission — QSimCity

## The learning gap

Newcomers meet quantum computing as circuit diagrams and state vectors,
and take away two ideas that are wrong in different directions.

The first is that **the circuit you write is the circuit that runs**.
Almost every introduction stops at the abstract circuit. The compiler —
which decides where your logical qubits live, inserts SWAP operations to
drag distant qubits together, rewrites your gates into the machine's own
basis, cancels what it can, and schedules the result — is invisible.
Learners are then surprised that a circuit they wrote in two gates
arrives at the machine as a longer, differently shaped one, and have no
intuition for why connectivity, depth, and gate count dominate practical
quantum computing.

The second is that **a quantum state is a thing that moves around**.
Popular animations show glowing orbs travelling down wires. Learners
build a transport metaphor that later blocks understanding of
measurement, entanglement, and why quantum information cannot simply be
copied or observed in flight.

Existing tools sit at the extremes: circuit composers show the abstract
circuit and hide the machine; hardware dashboards show calibration data
and assume you already know why it matters. Between them is a gap — an
explorable account of what actually happens between "I wrote a circuit"
and "here are my results".

## The solution

QSimCity renders the *compilation and execution pipeline* as a city, and
drives every light that carries meaning from a real computation trace. The
City Legend names each of those and classifies the rest as illustrative.

You write or drag together a circuit. It is parsed, laid out onto a device
topology, routed with real SWAP insertion, translated into the machine's
basis, optimised, scheduled, executed on a statevector simulator with an
optional noise model, measured, and fed back classically. Each stage is a
district. A convoy carries your compiled job down the boulevard from one
district to the next, arriving exactly when that stage's events fire.
Logical-qubit banners ride physical pylons and swap places at the tick a
SWAP is inserted. Measured bits leave the harbour as courier vans.
Container stacks on the results dock grow as shots land.

Two rules are intended to make it teach rather than merely impress. They
are design commitments, machine-checked in the product; whether they
change what a learner understands is untested (see
[`LEARNING_EVALUATION.md`](LEARNING_EVALUATION.md)):

1. **Everything that moves is classical.** Vehicles and people carry
   instructions, jobs, or measured bits — never amplitudes or quantum
   states. The City Legend says so explicitly for every animated class,
   and a unit test enforces it — one that derives its required coverage
   from the names the renderer gives the objects it animates, so a new
   animated object fails the test until it is explained. The transport
   misconception is designed against rather than reinforced.
2. **Every number carries its provenance.** Each displayed quantity has a
   source classification and a certainty label — `EXACT`, `COMPUTED`,
   `SAMPLED`, `ESTIMATED`, `CALIBRATION`, `MEASURED`, or `ILLUSTRATIVE`.
   An "Active simplifications" panel states what the model is not.

Everything runs client-side in the browser. There is no account, no
upload, no telemetry, and a complete non-WebGL path.

## Target audience

- **Primary:** curious beginners aged roughly 12 and up, including
  secondary-school students with no linear algebra, working alone or with
  a teacher. The child explanation register and picture-led onboarding
  target the younger end of this band.
- **Secondary:** undergraduates meeting compilation for the first time,
  and outreach or science-communication settings needing a 45-minute
  activity that needs no installation.
- **Tertiary:** educators who want a demonstration surface where the
  compiler is visible, and practitioners explaining SWAP overhead to
  non-specialists.

## Learning objectives

After a 45-minute session a learner should be able to:

1. Explain that a compiler rewrites a circuit before it runs, and name at
   least three things it changes.
2. Describe what an initial **layout** does and why the choice matters.
3. Explain why **routing** inserts SWAP operations, and connect SWAP
   count to device connectivity.
4. Say what **basis translation** is and why the machine cannot run an
   arbitrary gate.
5. Give one example of an **optimisation** that removes work.
6. Describe what **scheduling** decides.
7. Distinguish the **logical** qubit from the **physical** qubit it
   currently occupies, and explain how a SWAP changes that mapping.
8. Explain that **measurement** produces classical bits, and that
   repeated shots produce a distribution.
9. Describe how **noise** changes results — a shifted distribution, not a
   wrong answer.
10. Explain what **classical feedback** does with a measured bit.

Objectives 2–7 are the ones this visualisation is built to carry, and are
the primary outcome in the evaluation plan.

## Pedagogical sequence

The product implements a deliberate progression, not a sandbox:

1. **Picture onboarding** — three illustrated doors and a reading-level
   choice (Kids / Beginners / Experts). Near-zero reading required.
2. **Mission 1, Bell pair** — one-tap template, Run, watch the replay to
   the end. The first payoff: two bars, always agreeing.
3. **Missions 2–7** — *Three of a Kind* (a GHZ chain); *The Long Way
   Around* (a deliberately bad layout whose SWAP cost the learner then
   fixes); *Storm Over the Grid* (noise); *Message from the Docks*
   (classical feed-forward); *The Great Cleanup* (optimisation); *Count on
   It* (sampling statistics). Each has machine-checkable completion against
   a real trace and immediate per-step feedback. Basis translation is
   taught in the Guided Tour and the Compare view rather than by a mission
   of its own.
4. **Guided Tour** — the same pipeline narrated end to end.
5. **Quantum Lab** — free exploration: write OpenQASM or drag blocks,
   change device, layout method, noise, and shots.
6. **Compare Mode** — ideal versus physical-ideal versus noisy, side by
   side with certainty labels.
7. **Assessment** — five picture questions before and after, growth-framed
   and never graded.

Scrubbing the timeline is the core interaction throughout: because every
surface derives from `(trace, tick)`, a learner can rewind any claim and
watch it happen again.

## Technologies

| Layer | Choice | Why |
| --- | --- | --- |
| Rendering | three.js (WebGL2), merged per-material geometry, instanced agents | One coherent city at ~180 draw calls |
| UI | React + Zustand | Small, testable, no framework lock-in |
| Build | Vite / Rolldown, PWA service worker | 158 KiB gzip initial JS of a 320 KiB budget; installable and offline-capable |
| Domain | Own TypeScript packages: gates, topologies, seeded RNG, OpenQASM parser | Deterministic and dependency-light |
| Compiler | Own reference compiler: normalise → layout → route → translate → optimise → schedule | The pipeline is the subject, so it must be inspectable |
| Simulation | Own statevector engine with noise channels, in a Web Worker | Keeps the main thread free for rendering |
| Trace format | QSimCity Trace: versioned, hashed, migratable | The single source every surface renders from |
| Cross-validation | Optional Python bridge to Qiskit and Qiskit Aer | Independent check that the science is right |
| Testing | Vitest, Playwright (Chromium/Firefox/WebKit/mobile), mutation testing | 942 unit and 94 end-to-end tests |

## Results and evidence

Every claim below is bound to an evidence envelope under
`release-evidence/` that records the source tree it measured; the release
gate recomputes them and refuses prose as evidence.

| Claim | Evidence |
| --- | --- |
| Simulator agrees with Qiskit Aer | `release-evidence/python/` — 71 pytest, within sampling tolerance |
| Traces reproduce their scientific content exactly | `release-evidence/trace-reproducibility/` — 12 independent processes agree on `semanticHash` |
| Compiled circuits preserve measured distributions | `packages/reference-compiler/test/compiled-execution.test.ts` |
| Frame time, honestly characterised | `release-evidence/wiser-fps/` — p50/p95/p99, long and dropped frames, refresh-cap detection, vsync-disabled ceiling |
| Repeated 3D/2D mounting is safe | `release-evidence/remount/` — 60 fixed cycles scored on heap slope, absolute growth, mount latency, and the app's own live WebGL contexts |
| Ten-minute production soak | `release-evidence/soak/` |
| Accessibility | Lighthouse accessibility 100 on four targets; axe WCAG 2.2 AA scans across surfaces |
| Bundle budget | 158 KiB gzip initial JS against 320 KiB; 349 KiB total JS against 600 KiB |
| Security | `pnpm audit` clean of high/critical; no committed secrets |
| Builds from a clean clone | `release-evidence/fresh-clone/` — 16 steps |
| Adversarial review | `docs/audits/wiser-adversarial-reviews.md` — **AI-assisted, not independent human validation** |

**No learning outcomes are claimed.** See
[`LEARNING_EVALUATION.md`](LEARNING_EVALUATION.md).

## Limitations

Stated plainly, and in full in [`limitations.md`](limitations.md):

- **No human evaluation.** Effectiveness is untested.
- **Reviews are AI-assisted.** The adversarial reviews were performed by
  language-model agents. They are not human expert review, not
  independent external validation, and not peer review.
- **Exact simulation is capped at 12 qubits** in the browser.
- **The compiler is a teaching reference,** not Qiskit's transpiler. It is
  labelled `reference_compiler` wherever its output is shown.
- **Noise is a simplified trajectory model,** not a hardware-calibrated
  simulation. Gate durations are `ESTIMATED`.
- **Playback pacing is presentation time,** not hardware timing.
- **Mobile figures are Chromium emulation** on a desktop GPU. No
  real-device measurement has been taken.
- **The city is an illustration.** Buildings, traffic, and pedestrians
  carry no scientific meaning beyond what the City Legend states.
- **A small memory residual survives repeated 3D/2D switching** — about
  90 KiB per switch of JavaScript bookkeeping inside three.js. GPU
  resources are released; the figure is measured and bounded by the
  remount gate rather than assumed away.

## Scalability

- **Delivery:** a static bundle on a CDN with a service worker. No server,
  no database, no per-user cost; one deployment serves a classroom or a
  country. It runs offline after first load.
- **Content:** missions, scenarios, districts, and explanation registers
  are data, so new material does not require engine changes.
- **Devices:** WebGL2 where available, with a complete Accessible 2D path
  that carries the entire workflow without a GPU — the same product on a
  school Chromebook or a locked-down lab machine.
- **Localisation:** the leveled-text system already separates copy from
  logic per register, which is the same seam a translation would use.
  Only English exists today.
- **Known ceiling:** exact simulation is bounded by statevector memory, so
  larger circuits need either a different backend or an approximate one.

## Team and contributions

Solo project by the repository owner (**Doraking**,
<https://github.com/dorakingx>): concept, architecture, implementation,
scientific design, evaluation design, and documentation.

Development was AI-assisted throughout — see
[`AI_USAGE.md`](AI_USAGE.md) for exactly which parts, and what was
verified independently.

## AI use disclosure

Substantial portions of the implementation, tests, documentation, and the
adversarial reviews were produced with AI assistance (Claude). The full
disclosure — what was AI-generated, what was human-directed, what was
machine-verified, and what remains unverified — is in
[`AI_USAGE.md`](AI_USAGE.md). The headline: **the adversarial reviews in
`docs/audits/` are AI-assisted and must not be read as human expert or
independent external validation.**

## Live URL and demo status

- **Live application:** <https://qsimcity.vercel.app> — verified reachable
  (HTTP 200). **It currently serves `main`, not the branch under review**;
  the deployed bundle hash differs from this branch's build. Deploying
  this branch is a human action that has deliberately not been taken.
- **Demo video:** produced and committed as a file in this repository —
  see [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) for the exact path, duration,
  resolution, checksum, and upload instructions. **It has not been
  uploaded anywhere**, because that requires credentials this process does
  not hold. No public video URL is claimed.

## Submission checklist

| # | Item | Status |
| --- | --- | --- |
| 1 | Learning gap stated | Yes — this document and `README.md` |
| 2 | Solution described | Yes |
| 3 | Target audience identified | Yes |
| 4 | Learning objectives enumerated | Yes — ten, mapped to pipeline stages |
| 5 | Pedagogical sequence documented | Yes |
| 6 | Technologies listed | Yes |
| 7 | Results and evidence | Yes — machine-checked envelopes in `release-evidence/` |
| 8 | Limitations stated | Yes — including no human evaluation |
| 9 | Scalability addressed | Yes |
| 10 | Team contributions | Yes |
| 11 | AI-use disclosure | Yes — `AI_USAGE.md` |
| 12 | Live URL | Yes — verified reachable; serves `main`, not this branch |
| 13 | Demo video | Produced and committed; **not uploaded** — no public URL claimed |
| 14 | User guide | `USER_GUIDE.md` |
| 15 | Educator guide with zero-setup 45-minute lesson plan | `EDUCATOR_GUIDE.md` |
| 16 | Attributions and asset licences | `ATTRIBUTIONS.md` — no third-party assets |
| 17 | Learning evaluation instrument and protocol | `LEARNING_EVALUATION.md` — no human data |
| 18 | Demo script | `DEMO_SCRIPT.md` |
| 19 | Licence | Apache-2.0, `LICENSE`, consistent across documents |
| 20 | Reproducible from a clean clone | `release-evidence/fresh-clone/` |
| 21 | Accessibility verified | Lighthouse 100 accessibility; axe WCAG 2.2 AA |
| 22 | Human expert review | **Not done** — reviews are AI-assisted |
| 23 | Learning outcomes measured | **Not done** — protocol only |
| 24 | Deployed to production from this branch | **Not done** — deliberately left to a human |

Items 22–24 are open by design. They require a human, and this submission
does not pretend otherwise.
