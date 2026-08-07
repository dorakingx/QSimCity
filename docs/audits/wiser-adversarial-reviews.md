# WISER Adversarial Reviews

> **These reviews were performed by AI agents.** They are not human expert
> review, not independent external validation, and not peer review. Where
> a finding is declared resolved or a score assigned, that is one language
> model's assessment of another's work, constrained by machine-checked
> evidence. Read them as internal QA. See
> [`../AI_USAGE.md`](../AI_USAGE.md).

## Round 4: the seven separated reviews (AI-assisted)

A later round ran seven separated adversarial reviews, each asked to
falsify rather than confirm: quantum accuracy, WISER compliance,
accessibility, performance methodology, licensing, pedagogy/child UX, and
visual art direction. **All seven were performed by AI agents and are not
human expert review, independent external validation, or peer review.**

The single most serious finding in the whole project came out of the
pedagogy review, and it was a blocking one:

> `packages/world/src/districts.ts` described Routing Transit as "SWAP cars
> **shuttle quantum information** between platforms" — rendered in the
> Inspector at every explanation level including child, in both 3D and
> Accessible 2D. That is the exact transport misconception README and
> `WISER_SUBMISSION.md` claim the product is designed against, and the
> exact answer `LEARNING_EVALUATION.md` nominates as the disqualifying
> misconception-probe response.

The guard that was supposed to prevent this checked the `represents` field
of three legend entries by hand-written id list — a spot check quoted as a
rule. It has been replaced by
`packages/ui/test/transport-misconception.test.ts`, which scans every
string literal in the learner-visible content sources for any phrasing that
puts quantum state, amplitudes or "quantum information" in motion. On its
first run it caught a **second** instance the reviewer had not found, in
the teleportation scenario. Both are fixed.

Other findings from this round that changed the product or the claims:

- The pre-assessment was unreachable on the documented first-run path,
  because onboarding calls `setActiveMission` directly and bypasses the
  only site that offers it.
- The assessment's distractors do not instantiate the misconceptions its
  documentation says they catch, and several correct options echo the
  app's own child-register wording. `LEARNING_EVALUATION.md` now states
  plainly that the instrument must be revised before it is used to measure
  anything.
- "Growth-framed, never graded … the words grade, wrong and fail do not
  appear" was false on all three counts. Corrected.
- The 45-minute plan reaches six of ten objectives, not ten. Corrected in
  both README and the submission.
- Art direction: the coastline fix is real at the terrain mesh, but the
  slab read survives because the quay road still holds the un-offset base
  line; residential parcels are a flat-colour checkerboard with one
  repeated house asset; there are no longitudinal lane markings at street
  level; the kerb has zero height and the walk camera stands on it. These
  are recorded as open art-direction weaknesses rather than fixed, and the
  visual claim is scoped to "believable stylized city" accordingly.

Four separated AI reviewer agents — art direction, quantum-information
accuracy, child UX and accessibility, and performance — reviewed the
release evidence adversarially across three fix rounds. Every blocking
and major finding raised in any round was fixed and re-verified by the
reviewer that raised it; the verdicts below are from the final
confirmation round against evidence regenerated from a clean worktree.
The machine-checked record is `docs/audits/wiser-reviews.json`; the
`pnpm wiser:reviews` gate enforces four stances, zero open blockers or
majors, and a minimum category score of 4.5 across every reviewer.

## Stance: art-direction
Scoring round after three iterating rounds. All five outstanding minors are verified fixed in the regenerated clean-tree evidence (commit 3562bd4), and a live production-build session confirmed the motion language works: timeline ticks drive the convoy, the QPU gantry hook, a courier ribbon at Measurement Harbor, and a van passing at street level in walk mode, while the scene settles to near-stillness with only faint ambient shimmer once the replay ends (pixel-diff: 1.5k-4k px/s during replay vs ~400 px/s after). Adversarial hunting surfaced only three cosmetic nits. The product presents a cohesive, honest, legible city across all three times of day and both viewports.

| Category | Score | Cited screenshots |
| --- | --- | --- |
| visual-fidelity | 4.5 | desktop-night-overview.png, desktop-golden-street.png, desktop-day-interior.png, mobile-night-overview.png, mobile-golden-street.png |
| urban-coherence | 4.5 | desktop-day-overview.png, desktop-golden-overview.png, desktop-day-street.png, mobile-day-overview.png |
| semantic-animation | 4.5 | desktop-day-overview.png, desktop-day-street.png, desktop-golden-overview.png, mobile-golden-overview.png |
| interaction-clarity | 4.5 | desktop-day-legend.png, mobile-day-street.png, mobile-day-overview.png, desktop-day-overview.png |
| scientific-honesty | 5 | desktop-day-lab-results.png, desktop-day-legend.png |

### Findings
- **[minor / fixed]** Lab histogram left-anchored in an empty panel
- **[minor / fixed]** Orphaned Walk chip on mobile
- **[minor / fixed]** Bare paved band southeast of the QPU lattice
- **[minor / fixed]** Dead desk monitor in the interior
- **[minor / fixed]** Sky-heavy mobile overview framing
- **[minor / accepted]** Golden/night foreground silhouette
- **[minor / open]** Streetlamp head clipped at frustum edge on mobile street shots
- **[minor / open]** Lamp glow sprites read as flat discs in mobile night overview
- **[minor / open]** Keyboard focus ring baked into three evidence captures

## Stance: quantum-accuracy
Scoring round confirms the product's quantum-information accuracy is sound and stable. Spot verification: both evidence envelopes (release-evidence/wiser-fps/fps-report.json, release-evidence/wiser-screenshots/manifest.json) bind HEAD commit 3562bd4f3c02b98df24b174a89c1ba49e31a265c with worktreeDirty:false and identical sourceTreeHash 3355216dd7f59118; all 15 screenshot SHA-256 hashes match the manifest. desktop-day-lab-results.png shows the widened, centered two-bar Bell histogram under 'Measured counts (1024 shots)' with the SAMPLED badge and unchanged science (00/11 near 51%/49%), with 'Exact probabilities EXACT' collapsed below and the Active simplifications sidebar intact. I read the full diff of commit 3562bd4: the changes are provably presentation-only (Histogram bar-group width formula, QPU campus ground-color scoping, interior monitor material swap to the lit chart material, portrait orbit start pitch in cameras.ts, mobile chip CSS, an ARIA unit test) — no producer, trace, simulator, compiler, or labeling code was touched, and the camera change cannot affect scientific state. The City Legend still carries every verified accuracy fix: Job convoy COMPUTED, Courier vans SAMPLED (one van per sampled measurement), Logical qubit banners COMPUTED with SWAP exchange semantics, and Pylon/bridge lights dual-labeled EXACT with noisy replay SAMPLED. The scientific-core distribution-equivalence suite (packages/reference-compiler/test/compiled-execution.test.ts) passes 67/67. One new minor process note: the regenerated clean-tree evidence exists on disk but is not yet committed — the versions committed at HEAD still bind prior commit 9bd097d, so a fresh clone of HEAD would carry stale envelopes until the regenerated files are committed.

| Category | Score | Cited screenshots |
| --- | --- | --- |
| visual-fidelity | 4.5 | desktop-day-interior.png, desktop-day-overview.png, desktop-golden-street.png |
| urban-coherence | 4.5 | desktop-day-overview.png, desktop-night-overview.png |
| semantic-animation | 5 | desktop-day-legend.png, mobile-day-street.png |
| interaction-clarity | 4.5 | mobile-day-street.png, mobile-day-overview.png, desktop-day-legend.png |
| scientific-honesty | 5 | desktop-day-lab-results.png, desktop-day-legend.png |

### Findings
- **[minor / open]** Regenerated clean-tree evidence is uncommitted; committed envelopes still bind commit 9bd097d
- **[info / verified]** Post-fix commit 3562bd4 verified presentation-only; no science or labeling surface touched
- **[info / verified]** All prior accuracy findings remain fixed in regenerated evidence

## Stance: child-ux-accessibility
Final scoring round. I reproduced the round-4 major live on the production build (390x844 hasTouch, tools/serve-production, Missions -> Light Up the Twin Towers -> Bell pair -> Run -> celebration): the histogram now scales inside the panel (rendered 306px from a 460px viewBox), mission panel and document both measure zero horizontal overflow (356/356 and 390/390), and the step-3 text, Reset, timeline at 16/16, SAMPLED badge, and the full celebration card are all visible and reachable — the major is fixed, and the new E2E guard in tests/e2e/mobile.spec.ts asserts exactly this. The mode-strip trailing padding (48px) keeps the active Accessible 2D chip fully bright at scroll end, and the Accessible 2D results fit the phone with no sideways scroll. All previously verified fixes spot-checked clean (joystick bottom 612 vs dock top 688, district label plates, lit interior sign and monitors, tick-driven replay motion 5/16 -> 9/16). Two new minors only: sub-7px effective histogram tick text after viewBox scaling, and a benign duplicate histogram from the mission panel staying mounted under Accessible 2D.

| Category | Score | Cited screenshots |
| --- | --- | --- |
| visual-fidelity | 4.5 | desktop-night-street.png, desktop-golden-overview.png, mobile-night-overview.png, mobile-golden-street.png, desktop-day-overview.png, desktop-day-interior.png |
| urban-coherence | 4.5 | desktop-day-overview.png, desktop-golden-overview.png, mobile-day-overview.png, mobile-night-overview.png |
| semantic-animation | 4.5 | mobile-day-overview.png, mobile-night-overview.png, desktop-day-legend.png, desktop-golden-overview.png |
| interaction-clarity | 4.5 | mobile-day-street.png, mobile-golden-street.png, mobile-day-overview.png |
| scientific-honesty | 5 | desktop-day-lab-results.png, desktop-day-legend.png, mobile-day-overview.png |

### Findings
- **[major / fixed]** Phone mission panel overflow clipping results and celebration
- **[minor / fixed]** Mode-strip fade dimmed the active trailing chip (cua-r4-7)
- **[minor / fixed]** Accessible 2D two-bar chart overflowed phone panels (cua-r4-8)
- **[minor / fixed]** Mobile joystick overlapped the playback dock
- **[minor / fixed]** Prior-round fixes spot-checked and holding
- **[minor / open]** Histogram tick text drops to ~6.7px effective on phones
- **[minor / accepted]** Mission histogram stays mounted beneath Accessible 2D results

## Stance: performance
Live verification on the production build confirms the committed evidence rather than merely trusting it: rAF medians hit the 120 Hz host cap in all three desktop segments I re-measured myself (overview replay, continuous orbit drag, walk with W held), a 10-second night street dwell produced 1200 frames with median 8.3 ms, p99 9.2 ms, max 9.4 ms and zero frames over 33 ms, ten Explore/2D remount cycles left the GC'd heap at exactly ratio 1.000 (31.2 MB to 31.2 MB), and zero console or page errors occurred across both sessions. Interaction is effectively instant: load-to-3D-ready 709-968 ms, Run-to-replay-toolbar 58-91 ms, Explore-to-Accessible-2D 60 ms fresh and 24 ms after six remount cycles. Timed screenshot sequences during replay show real semantic motion distributed along the district band (plus the advancing timeline), not just HUD churn, and orbit/walk screenshots after heavy input show intact rendering from new vantages. fps-report.json and manifest.json envelopes verify as claimed: commitSha 3562bd4, worktreeDirty false, passed true, with the honestly named maxObservedSegmentMedianFps and explicit cap/host-GPU caveats. Two low-severity items remain open: the in-tree soak envelope predates the final tree (57c9a9d, worktreeDirty true) and must be regenerated in the planned final gate sequence — an ordering I judge sound since committing evidence changes the source hash — and the soak-only finalInteractionMs residual (2417 ms vs 24-60 ms in my live probes) persists under its 3000 ms threshold and is not reproduced by remount churn alone, pointing at the long scenario workload rather than a leak.

| Category | Score | Cited screenshots |
| --- | --- | --- |
| visual-fidelity | 4.5 | desktop-night-street.png, desktop-day-overview.png, desktop-day-interior.png, desktop-golden-overview.png |
| urban-coherence | 4.5 | desktop-day-overview.png, desktop-golden-overview.png, mobile-day-overview.png |
| semantic-animation | 4.5 | desktop-day-overview.png, desktop-day-street.png, desktop-night-overview.png |
| interaction-clarity | 4.5 | desktop-day-overview.png, mobile-day-street.png, desktop-day-legend.png |
| scientific-honesty | 5 | desktop-day-lab-results.png, desktop-day-legend.png |

### Findings
- **[none / verified]** Cap-limited frame rate reproduced live in all interactive segments
- **[none / verified]** Remount leak fix holds under live probing
- **[none / verified]** Interaction latency excellent and does not degrade with mode churn
- **[none / verified]** Semantic motion confirmed from timed frames, not screenshots alone
- **[none / verified]** FPS and screenshot evidence regenerated from the clean tree at 3562bd4
- **[minor / open]** Soak envelope in tree is stale; regeneration on the final clean tree is planned but not yet done
- **[minor / open]** finalInteractionMs residual after full soak remains unexplained (2417 ms vs 24-60 ms live)

## Category minimums across all reviewers

| Category | Minimum |
| --- | --- |
| visual-fidelity | 4.5 |
| urban-coherence | 4.5 |
| semantic-animation | 4.5 |
| interaction-clarity | 4.5 |
| scientific-honesty | 5 |

Zero blocking findings and zero major findings remain open in any stance;
the open entries above are tracked minors (scaled histogram tick text on
phones, three capture-hygiene and lamp-billboard cosmetics, the post-soak
interaction-latency residual that stays well inside its fixed threshold,
and evidence files that land in the release commit itself).

## How the review process ran

Each stance reviewed adversarially, in iterating rounds: findings were
fixed in source, evidence was regenerated, and the same stance re-verified
its own findings before scoring. Blocking and major findings fixed across
the rounds included: glass towers rendering black by day, the missing
night lighting story, the mobile joystick buried under the playback dock,
missing focus traps on aria-modal dialogs, the 2D coupling map showing
stale initial-layout residency, an FPS benchmark that measured an empty
scene, an evidence path-doubling bug that wrote envelopes into a junk
tree, the 3D remount memory leak (~11.5 MiB per view switch), a
placeholder-grade interior, unlit accent materials, and a phone mission
panel that clipped its own celebration. Scoring rounds included live
production-build verification: reviewers drove the real app with
Playwright, observed replay motion over timed frame sequences, measured
frame times, heap behavior across remounts, and interaction latency, and
in two cases independently reproduced the committed benchmark numbers.

## Visual regression baselines (W8.5)

The Playwright baseline set under `tests/e2e/visual.spec.ts-snapshots/`
was regenerated for the real-city rebuild (12 baselines including the
golden-hour city) and re-reviewed as images at each fix round; the mobile
portrait baseline was refreshed for the compact two-row chrome and the
final baseline run passes across the desktop and mobile projects.
