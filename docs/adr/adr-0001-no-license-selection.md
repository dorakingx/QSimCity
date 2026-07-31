# ADR-0001: No license file is selected on behalf of the project owner

Date: 2026-07-30. Status: **Superseded** by
[ADR-0004](adr-0004-apache-2-0-license.md) on 2026-07-31, when the owner
authorized publication and selected Apache License 2.0. The reasoning below
stands as the record of why no license was chosen on their behalf.

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

**Wording obligation.** While no license file existed, no first-party
document, UI string, or package description could describe QSimCity as an
"open-source project", because that would have implied reuse rights that had
not been granted. `pnpm goal:check` enforced this.

That condition ended with ADR-0004: a `LICENSE` file now exists, so the
prohibition no longer applies. The check did not simply switch off — while a
license file is present it requires the documentation to name the same license
that file actually contains.

`LICENSE DECISION: RESOLVED` — Apache License 2.0, see ADR-0004.
