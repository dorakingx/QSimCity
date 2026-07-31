# Visual benchmark, final

Date: 2026-07-31. Method and raw scores:
`release-evidence/visual-benchmark/benchmark.json`.

The first completion claim asserted visual superiority over the reference
application without comparative evidence. This audit replaces that assertion
with a scored, category-by-category comparison, and — more importantly — with
the changes that were made to QSimCity because the comparison showed it losing.

## What was compared, and how

Eighteen categories drawn from `docs/visual-quality-rubric.md`, scored 1–5 for
both applications at a 1280×800 viewport. QSimCity was scored from captures of
its own production build; the reference was scored from its live behaviour,
recorded in `docs/reference-benchmark.md`. The reference is a third-party
application: no assets, code, or artwork were taken from it, and nothing here
implies affiliation with it.

Scoring a comparison against your own product invites flattery, so the
threshold is set where flattery does not help: **no category may score below
4/5**, and any category where QSimCity loses must be either fixed or stated
plainly as a loss.

## Result

**18 categories compared. Lowest QSimCity score 4/5. Ahead in 8, level in 9,
behind in 1.**

Ahead: skyline originality, medium-distance data-flow clarity, night mode,
touch and mobile presentation, inspector integration, semantic animation,
loading presentation, visual accessibility.

Behind: **day mode (4 vs 5)** — the reference has richer terrain, including
water, which QSimCity does not model. This is reported as a loss rather than
argued away.

## Changes made because the comparison found real deficits

Three deficits were found and fixed in the application, not in the scoring:

1. **No horizon.** The scene faded to flat background with no atmospheric
   depth. Fog was tightened to `380–1000` at night and `300–820` by day, giving
   the city a horizon; the starfield is excluded from fog so it stays crisp
   above it.
2. **Sparse districts.** District interiors read as empty next to the
   reference's dense massing. Filler building counts were raised by roughly 60%
   and placed in two rings rather than one, so districts have interior depth
   from every angle.
3. **Walk mode could strand the viewer.** Entering first-person at a peripheral
   district placed the camera facing away from the city, looking at empty
   ground. Walk entry now offsets toward the city centroid with a 42-unit
   standoff and a yaw computed toward the centre, so the viewer always starts
   looking at the city.

Day-mode terrain was not fixed. Adding water and terrain relief would be a new
feature rather than a repair, and the review's instruction was not to add
unrelated features, so the category is left as a documented loss.

## Categories at 4/5 and why they are not 5

Being level with the reference is the honest score for initial impression,
district differentiation, long-distance readability, first-person detail, the
four camera modes, and overall polish. QSimCity wins on legibility — twelve
districts readable in a single frame, ordered west to east along the actual
processing pipeline — while the reference wins on density and street-level
clutter. Neither difference is large enough to claim a category.

## Threats to this comparison

- Scores are expert judgement against a written rubric, not an automated
  metric. The rubric, the per-category notes, and the raw scores are published
  so the judgement can be disputed.
- The two applications have different goals. QSimCity is scored on whether its
  visuals carry meaning from a computation trace; a category where the
  reference is prettier but less informative is still counted as a loss.
- Captures are from one machine and one viewport. The mobile profile is covered
  by a separate automated category, but resolutions between the two are not.
