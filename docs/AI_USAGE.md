# AI Usage Disclosure

QSimCity was built with substantial AI assistance, disclosed here in the
interest of transparency for the WISER Education submission and for anyone
evaluating or extending the project.

## The most important sentence in this document

**The adversarial reviews in `docs/audits/` were performed by AI agents.
They are not human expert review, not independent external validation, and
not peer review.** Where those reviews assign scores or declare findings
resolved, that is one language model's assessment of another's work,
constrained by machine-checked evidence. Treat it as internal QA, not as
third-party assurance.

Likewise: **no human learner has used this product in a study.** No
learning outcome is claimed anywhere. See
[`LEARNING_EVALUATION.md`](LEARNING_EVALUATION.md).

## What AI did

Claude (Anthropic) acted as the primary implementation engineer across the
project, working in an agentic coding environment: writing and refactoring
the TypeScript and Python source, designing the procedural city and its
deterministic generators, implementing the simulator, compiler, and trace
stack and the learning path, authoring tests, driving a real browser to
verify visual results, recording the demo video, and producing the
documentation — including this file. Multiple AI agents sometimes worked in
parallel on separated packages, with their output merged and re-verified
through the same gates as any other contribution.

Specifically AI-generated: essentially all source code, all tests, all
documentation prose, the procedural art direction, the mission and
assessment content, the evaluation protocol, and the adversarial review
findings and scores.

## What constrains it

The project's own machinery, not trust, is the control:

- **Every claim is gated.** `pnpm goal:check` derives verdicts from
  content-hash-bound evidence envelopes (tests, coverage, mutation
  testing, frame time, remount safety, Lighthouse, soak, screenshots,
  reviews). Prose — AI-written or otherwise — is never accepted as
  evidence, and an envelope whose source-tree hash does not match the tree
  is rejected.
- **Science is cross-validated against an independent implementation.**
  The statevector simulator is checked against Qiskit to eight decimal
  places and count distributions by total-variation distance; compiled
  circuits are property-tested for unitary equivalence and executed end to
  end. This is the strongest non-AI check in the project: Qiskit was not
  written by this process.
- **Determinism is enforced.** No runtime randomness in generation or
  rendering; sample traces reproduce byte-identically across processes and
  against the Python bridge.
- **Adversarial review is recorded and machine-checked** — with the
  caveat at the top of this document about what that review is worth.

## Where AI assistance demonstrably failed, and was caught

Recorded honestly, because a disclosure that lists only successes is not a
disclosure. Each of these was produced by AI work and later caught by
measurement or adversarial review, not by inspection:

- A **3D remount memory leak** (~11.5 MiB per view switch): disposed
  engines stayed alive because canvas listeners retained them. Caught by
  the soak, fixed, and now guarded by a dedicated fixed-count gate.
- A **frame-rate benchmark that measured an empty scene** and reported a
  single median, hiding that the figure was display-capped. Caught by
  adversarial review; rebuilt to report percentiles, cap detection, and a
  vsync-disabled ceiling.
- An **evidence path-doubling bug** that wrote envelopes into a junk
  directory the gate then read from, so the gate validated the wrong file.
- The **end-to-end suite running on software rasterization** (p50 314 ms
  per frame), which made a test intermittently exceed its timeout and the
  fresh-clone gate fail — while the committed evidence claimed a pass.
- **Ambient traffic that never used the main boulevard**, so the most
  viewed street in the product was empty by construction while the
  documentation described a living city.
- A **mission panel that clipped its own celebration off-screen on
  phones**, introduced by an earlier fix to the same area.
- A **remount safety gate whose verdict was set by its own run length**:
  it passed at 25 cycles and failed the identical experiment at 60, so the
  sample size was deciding the result while looking like a sample size.
- A **WebGL context-leak probe that could not fail** — it counted how many
  further contexts the browser would hand out, which Chrome never refuses,
  and destroyed the contexts it was supposed to be counting. With a probe
  that worked, the application turned out to be leaking one context per
  3D/2D switch, up to the browser's limit of 16.
- A **frame-rate gate a blank page passed identically**, because every
  scored figure was capped by the display refresh rate.
- A **frame sampler that left one animation loop running per segment**, so
  reported frame counts were inflated by the segment index.
- A **release gate that required a measurement key the tool never writes**,
  and so could never pass with its own evidence.
- **Certainty labels computed by string-comparing a display label**, which
  labelled every ideal replay SAMPLED while the City Legend promised EXACT.
- **Nine accessibility barriers no automated tool detects**, including
  Space no longer activating focused buttons, single-key shortcuts with no
  off switch, and the operating system's reduced-motion preference being
  ignored by the 3D city — all under a clean axe and Lighthouse 100.

Two patterns worth naming. The first: in every case the *prose* was
confident and the *measurement* was not. The second is subtler and shows
up repeatedly above — AI-written *tests and gates* tend to be written so
that they pass. A probe that cannot fail, a threshold checked against a
key that is never written, a run length that stops just before the trend
appears, and a criterion an empty page satisfies are all the same mistake,
and none of them is visible from reading the output. Every one was found
by an adversarial pass that re-ran the tool with one parameter changed.
That is the reason this project gates on evidence, and the reason the
gates themselves have to be attacked.

## Originality

All geometry, textures, icons, audio, and prose are generated procedurally
or written originally within this repository. No third-party art, fonts,
audio files, or game assets are bundled; automated scans reject prohibited
names and non-English text, and `THIRD_PARTY_NOTICES.md` covers the code
dependencies. A full asset audit is in
[`ATTRIBUTIONS.md`](ATTRIBUTIONS.md). A commercial city-building game is
used only as a *quality benchmark* for review scoring — no code, asset,
text, layout, or branding from it or any other product is copied.

## Human role

The project owner directs goals, authorizes releases, licensing, and
deployment, and owns the repository. Decisions recorded in `docs/adr/`
note where the owner decided explicitly (licence choice, deployment
authorization). Deploying this branch, uploading the demo video, obtaining
human expert review, and running the learning study are all human actions
that have deliberately **not** been performed by this process.
