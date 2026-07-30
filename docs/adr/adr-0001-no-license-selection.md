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
