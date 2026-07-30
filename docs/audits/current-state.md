# Current State Audit

Audit date: 2026-07-30

## Environment

| Item | Value |
| --- | --- |
| Working directory | `/Users/hatanakatomoya/Developer/App/qsimcity` |
| Git repository | Not initially; initialized during this audit (`git init -b main`) |
| Current branch | `feat/qsimcity-production-v1` (created from empty `main`) |
| HEAD SHA | None (no commits at audit time) |
| Modified files | None |
| Untracked files | None (directory was empty) |
| Ignored files | None |
| Existing README | None |
| Existing CLAUDE.md | None |
| Existing AGENTS.md | None |
| Existing package manager | None; pnpm 11.14.0 enabled via corepack |
| Node.js | v22.23.1 (via nvm; system default is v20.18.0) |
| Python | 3.14.4 (system); `uv` available at `~/Library/Python/3.12/bin/uv` |
| Browser-test environment | Playwright to be installed; Chromium/Firefox/WebKit targets |
| Existing tests | None |
| Existing build status | N/A (empty directory) |
| Existing QSimCity implementation | None |
| Unrelated project present | No — directory was completely empty |

## Conclusion

The directory was empty, so QSimCity is initialized here as a brand-new
independent project per the preservation rules. No existing work is at risk.
No license file existed; none is selected on behalf of the project owner
(see ADR-0001).

## Toolchain decisions

- Node.js pinned to 22.x (LTS line compatible with pnpm 11 and Vite 7).
- pnpm pinned via `packageManager` field and `engines`.
- Python bridge managed with `uv` and a committed `uv.lock`.
