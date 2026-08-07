# Learning evaluation: instrument, protocol, and current status

## Status: no human subjects have been tested

**QSimCity has not been evaluated with learners. There are no learning
outcomes to report, and none are claimed anywhere in this repository.**

What exists today is (a) an assessment instrument built into the product,
(b) a study protocol ready to run, and (c) machine-checked evidence that
the *software* behaves as described. Effectiveness is an open question.
Any statement in this project that sounds like an efficacy claim is a
defect; please report it.

This matters because the failure mode is specific and common: an
attractive visualisation feels educational to its author and to reviewers,
while producing no measurable change in learner understanding — and can
even install durable misconceptions. QSimCity is designed to make that
question answerable rather than to assume the answer.

## The instrument

The product ships a five-question picture-based assessment
(`packages/ui/src/components/Assessment.tsx`,
`packages/ui/src/content/assessment.ts`). It is offered twice: once before
Mission 1, and once after six missions are complete. It is:

- **Optional and dismissible.** It never blocks progress, and the offer can
  be declined at any point.
- **Growth-framed, and never marked right or wrong in front of the
  learner.** Choosing an option records it and moves on: there is no
  per-item feedback, no red mark, and no penalty for a lower post score.
  Being precise about what that does *not* mean, because an earlier version
  of this bullet overclaimed on three counts: the summary *is* derived from
  correctness and *is* a count out of five ("You explored N of 5 ideas"),
  it does **not** name which ideas were met, and the word "grade" does
  appear — in the reassurances "never a grade" and "There are no grades
  here". The behaviour is unshaming; the earlier description of it was
  false.
- **Local-only.** Answers are written to `localStorage` under
  `qsimcity.progress.v1` and are never transmitted. There is no analytics
  or telemetry of any kind in the product (see
  [`privacy.md`](privacy.md)). Clearing site data erases everything.
- **Picture-led,** so a pre-reading or low-reading learner can answer.

Because responses stay on the learner's device, **the product cannot
collect study data on its own**. Any study must gather responses through a
separate, consented channel — the protocol below assumes paper or an
institutional survey tool, not app telemetry.

### What the five items probe

These are the items the product actually ships, verbatim from
`packages/ui/src/content/assessment.ts`:

| id | Prompt | Target idea | Misconception it is designed to catch |
| --- | --- | --- | --- |
| `entangled-pair` | "These two qubits were linked into a pair. We measure both. What do we see most often?" | Entangled outcomes are correlated | "One qubit sends a signal to the other", or "the answers are random and unrelated" |
| `swap-homes` | "A SWAP move just happened on the chip. What changed?" | Routing moves logical qubits between physical sites | Any two qubits can interact directly and for free |
| `noise-results` | "A storm of noise hits the machine while it runs. What happens to the results?" | Noise shifts the distribution | A noisy machine returns a "wrong answer" rather than a changed distribution |

> **The distractors do not currently instantiate these misconceptions.**
> An adversarial review established that every wrong option is implausible
> on its face ("The computer runs faster", "One qubit was deleted
> forever"), so the items are answerable by elimination without any quantum
> understanding — which would produce a high pre-test floor and a ceiling
> effect on exactly the three items named as the primary outcome. Several
> correct options also echo the app's own child-register wording almost
> verbatim, so a learner who read the event log could string-match the
> post-test. **The instrument must be revised before it is used to measure
> anything.** It is published here as a starting point, not as a validated
> instrument, and this is now the largest known gap in the evaluation plan.
| `more-shots` | "We repeat the run with many more shots. What happens to the bar chart?" | Sampling error shrinks with shots | More shots change the underlying physics rather than the estimate's precision |
| `measurement-bit` | "We measure a qubit at the end of the run. What comes out?" | Measurement yields a classical bit | A measurement returns "the quantum state" itself |

**Two documents disagreed about the primary outcome, and this one is
correct.** `docs/WISER_SUBMISSION.md` previously said objectives 2-7 were
the primary outcome; the instrument cannot report that, because it has no
item for objective 2 (layout), 4 (basis translation), 5 (optimisation) or
6 (scheduling). The pre-registration below commits to the three items that
exist, which map to objectives 3/7, 9 and 8.

`swap-homes`, `noise-results`, and `more-shots` are the primary outcome:
they are the compiler- and statistics-facing ideas this visualisation is
uniquely positioned to teach, and therefore the ones where a null result
would be most informative.

## Proposed study protocol

The following is a **plan**, not a report. Nothing in it has been carried
out.

### Design

A single-group pre/post design with a delayed retention check, plus a
non-equivalent comparison group where a partner classroom allows it. A
randomised controlled design would be stronger; the pragmatic version
below is what a single classroom can realistically run.

- **Participants.** Target n ≈ 60 across two age bands: 10–13 (the
  child-register path) and 14–18 or undergraduate novices (the beginner
  register). No prior quantum computing exposure required.
- **Comparison condition.** Where a second class is available, that class
  covers the same ten concepts with a conventional slide-and-diagram
  lesson of equal duration, taught by the same instructor.
- **Duration.** One 45-minute session, matching the lesson plan in
  [`EDUCATOR_GUIDE.md`](EDUCATOR_GUIDE.md).

### Measures

1. **Pre-test** — the five-item instrument, on paper, before any exposure.
2. **Post-test** — the same five items immediately after the session,
   plus three free-response prompts: *"Explain what a compiler did to your
   circuit"*, *"Why did the program need extra SWAP operations?"*, and
   *"What did noise change about your results?"*. Free responses are
   scored blind by two raters against a rubric, with inter-rater agreement
   reported.
3. **Retention** — the same five items two weeks later.
4. **Misconception probe** — one item that a fluent-but-wrong learner
   would answer confidently: *"While your program runs, what is travelling
   along the roads in the city?"* A correct answer names instructions,
   jobs, or measured bits. An answer naming amplitudes, wavefunctions, or
   "the quantum state" indicates the metaphor mis-taught, which is the
   specific risk this design takes on.
5. **Cognitive load and affect** — a short self-report (NASA-TLX-style
   effort item plus two affect items) to detect a visualisation that
   entertains without teaching, or teaches while overwhelming.

### Analysis

Pre/post change on the five items with a paired test and an effect size
with confidence interval; free-response rubric scores likewise; retention
compared against post. **Report the misconception-probe rate separately
and prominently, including when it is bad for the project.** An
intervention that raises confidence while installing "the quantum state
drives down the road" is worse than no intervention, and the study must be
able to say so.

### Ethics and data handling

Institutional review before any data collection. Informed consent from
participants and guardians for minors. Responses collected on paper or via
the institution's own survey tool, never through the application.
Pseudonymous identifiers for linking pre/post/retention, held separately
from responses. No audio, video, or screen recording of minors. Raw data
retained only as long as the analysis requires, then destroyed.

### Pre-registration and honesty commitments

Before recruiting, the hypotheses, primary outcome, exclusion rules, and
analysis plan will be pre-registered so a null result cannot be quietly
reframed as success. Committed in advance:

- The primary outcome is the pre/post change on `swap-homes`,
  `noise-results`, and `more-shots`.
- A null result will be published in this repository with the same
  prominence as a positive one.
- The misconception rate will be reported whatever it shows.
- Sample size, dropout, and any protocol deviation will be reported.

## What *is* established today

To be precise about the difference between "the software works" and "the
software teaches", the following are verified by machine-checked evidence
in `release-evidence/`, and none of them is evidence of learning:

- Every mission completes against a real trace produced by the compiler
  and simulator, not a scripted animation.
- A first-time learner can finish Mission 1 from on-screen guidance alone
  in desktop, touch, and keyboard-only modalities, from an empty profile.
- Every on-screen quantity carries a source classification and certainty
  label, and the labels match the code that produces the values.
- Simulator results agree with Qiskit Aer within sampling tolerance
  (`release-evidence/python/`).
- The city's motion is a pure function of `(trace, tick)`, so what a
  learner sees is reproducible and scrubable rather than decorative.

That is a claim about fidelity and usability. Whether it moves
understanding is exactly what the study above is for.
