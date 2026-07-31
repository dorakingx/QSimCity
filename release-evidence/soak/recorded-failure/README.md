# A soak run that failed

This is a real run that did not meet the criteria, kept deliberately.

Trailing heap-growth ratio 1.5708 against a limit of 1.5, so `passed` is
`false` and the completion gate refused it. It was taken while the same
machine was driving browser verification of the live deployment and two Vercel
deployments, so the host was not idle.

Its trailing third is a plateau rather than a climb — median 36.7 MB then
36.5 MB, with the window minimum falling from 25.0 MB to 23.6 MB — which
argues against an unbounded leak. That is an explanation, not an excuse: the
run failed the fixed criterion, the criterion was not changed, and the raw
samples are here so the judgement can be checked.

See `docs/audits/release-hardening.md` for the full set of observed ratios.
