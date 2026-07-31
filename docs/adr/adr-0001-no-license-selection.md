# ADR-0001: No license file is selected on behalf of the project owner

Date: 2026-07-30. Status: Accepted.

## Context

The repository was initialized empty. No license existed. Selecting an
open-source license is a legal decision belonging to the project owner.

## Decision

No `LICENSE` file is created. `README.md` notes that licensing is pending an
owner decision. All first-party code is original work. Third-party
dependencies keep their own licenses, recorded in `THIRD_PARTY_NOTICES.md`.

## Consequences

Until the owner selects a license, the default "all rights reserved" applies
to first-party content. Adding a license later is a one-file change.

**Wording obligation.** While no license file exists, no first-party document,
UI string, or package description may describe QSimCity as an "open-source
project", because that would imply reuse rights that have not been granted.
The accurate description is "an unofficial, independent educational and
research visualization project". `pnpm goal:check` enforces this: it fails if
README.md, docs/product-spec.md, CLAUDE.md, or CONTRIBUTING.md claims
open-source status while no LICENSE file is present, and the check relaxes
automatically once the owner adds one.

`LICENSE DECISION: OWNER REQUIRED`
