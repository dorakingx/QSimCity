# AI Usage Disclosure

QSimCity was built with substantial AI assistance, disclosed here in the
interest of transparency for the WISER Education submission and for
anyone evaluating or extending the project.

## What AI did

Claude (Anthropic) acted as the primary implementation engineer across the
project, working in an agentic coding environment: writing and refactoring
the TypeScript/Python source, designing the procedural city and its
deterministic generators, implementing the simulator/compiler/trace stack
and the learning path, authoring tests, running and reading the browser to
verify visual results, and producing the documentation. Multiple AI agents
sometimes worked in parallel on separated packages, with their output
merged and re-verified through the same gates as any human contribution.

## What constrains it

The project's own machinery, not trust, is the control:

- **Every claim is gated.** `pnpm goal:check` derives verdicts from
  content-hash-bound evidence envelopes (tests, coverage, mutation
  testing, FPS, Lighthouse, soak, screenshots, reviews). Prose — AI-written
  or otherwise — is never accepted as evidence.
- **Science is cross-validated.** The statevector simulator is checked
  against Qiskit to eight decimal places and count distributions by
  total-variation distance; compiled circuits are property-tested for
  unitary equivalence and executed end to end.
- **Adversarial review is recorded.** Independent review passes (art
  direction, quantum accuracy, child UX/accessibility, performance) score
  the product against fixed rubrics with cited screenshots; open blocking
  or major findings fail the gate.
- **Determinism is enforced.** No runtime randomness in generation or
  rendering; sample traces reproduce byte-identically across processes
  and against the Python bridge.

## Originality

All geometry, textures, icons, audio, and prose are generated procedurally
or written originally within this repository. No third-party art, fonts,
audio files, or game assets are bundled; automated scans reject prohibited
names and non-English text, and `THIRD_PARTY_NOTICES.md` covers the code
dependencies. A commercial city-building game is used only as a *quality
benchmark* for review scoring — no code, asset, text, layout, or branding
from it or any other product is copied.

## Human role

The project owner directs goals, authorizes releases, licensing, and
deployment, and owns the repository. Decisions recorded in `docs/adr/`
note where the owner decided explicitly (license choice, deployment
authorization).
