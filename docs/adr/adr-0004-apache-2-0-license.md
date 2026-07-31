# ADR-0004: QSimCity is licensed under Apache License 2.0

Date: 2026-07-31. Status: Accepted. Supersedes
[ADR-0001](adr-0001-no-license-selection.md).

## Context

ADR-0001 recorded that no license had been selected, because choosing one is a
legal decision belonging to the project owner and not something to be decided
on their behalf. That left the repository under default copyright: no reuse,
redistribution, or modification rights, which is why every document was careful
never to describe the project as open-source.

The owner has now authorized publication as a public repository and asked for
the same license the reference application uses. That project, PGSimCity,
is licensed under Apache License 2.0 (verified from its repository metadata on
2026-07-31, SPDX identifier `Apache-2.0`).

## Decision

QSimCity adopts **Apache License 2.0**.

The `LICENSE` file contains the canonical Apache-2.0 text obtained from
apache.org, with the appendix's placeholder filled in as
`Copyright 2026 dorakingx`. A `NOTICE` file accompanies it, as Apache-2.0
conventionally expects.

Two points about "the same license as the reference project" are worth stating
explicitly, because they are easy to conflate:

- Adopting the same **license type** is unremarkable. Apache-2.0 is a standard
  legal instrument that any author may apply to their own work; doing so
  creates no relationship with, and implies no endorsement by, any other
  project that uses it.
- Copying another project's **LICENSE file verbatim**, including its copyright
  line, would have been wrong: it would assert someone else's copyright over
  this repository's original work. The copyright holder here is this project's
  owner, and no text was taken from the reference project's repository.

## Consequences

- Reuse, redistribution, and modification are now granted under the terms of
  Apache-2.0, including its patent grant and its requirement to preserve
  attribution and state changes.
- Describing QSimCity as an open-source project is now accurate, and
  `pnpm goal:check` stops rejecting that wording. The check does not simply
  fall silent: while a license file exists it now requires the documentation to
  name the same license the file actually contains, so the two cannot drift
  apart.
- The independence disclaimer is unchanged and unrelated to licensing.
  QSimCity remains an unofficial, independent educational and research
  visualization project, not produced, endorsed, sponsored, or approved by
  Electronic Arts, Maxis, IBM, any quantum-hardware vendor, or the maintainers
  of the reference application.
- Source files do not carry per-file Apache headers. The license applies to the
  repository as a whole through `LICENSE`; adding headers to every file later
  is a mechanical change that does not affect the grant.
