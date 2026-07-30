# ADR-0002: Technology stack and monorepo layout

Date: 2026-07-30. Status: Accepted.

## Context

QSimCity must be a static, client-side web app and offline-capable PWA with a
scientifically testable core, a 3D world, an accessible 2D mode, and an
optional Python Qiskit bridge. Strong package boundaries are mandatory
(domain/simulator must not import Three.js; UI must not implement its own
scientific engine).

## Decision

pnpm 11 workspaces monorepo, all versions pinned exactly (`save-exact`):

| Choice | Version | Purpose / rationale |
| --- | --- | --- |
| TypeScript | 5.9.3 | Strict mode everywhere. 7.0 (native) is newly released; typescript-eslint and several tools do not yet certify it. 5.9.x is the most widely supported stable line. Revisit post-v1. |
| Vite | 8.x | Build tool; static output; first-class worker + PWA ecosystem |
| React | 19.x | UI layer; concurrent rendering for timeline updates |
| Three.js | 0.185.x | 3D engine — the only bundled 3D dependency |
| Vitest | 4.x | Unit/property/integration tests; v8 coverage |
| Playwright | 1.62.x | E2E, browser matrix, visual regression, a11y checks |
| fast-check | 4.x | Property-based testing |
| zod | 4.x | Trace schema validation at runtime boundaries |
| vite-plugin-pwa | 1.x | Workbox-based service worker generation |
| ESLint 10 + typescript-eslint 8 | pinned | Lint incl. boundary rules |
| Python 3.12+ / uv | uv.lock | Qiskit bridge, reproducible env |

Packages are consumed as TypeScript source through workspace `exports`
pointing at `src/index.ts` — no per-package build step. Root `tsc --noEmit`
typechecks the entire graph; Vite bundles the app.

Layout: `apps/web` (qsimcity-web), `packages/{domain,trace,simulator,
reference-compiler,world,visual-engine,ui}`, `python/qsimcity_qiskit`,
`examples/{circuits,traces,backend-snapshots}`, `docs`, `tools`, `tests`,
`release-evidence`.

## Boundary rules (enforced by ESLint `no-restricted-imports` + tests)

- `domain`, `trace`, `simulator`, `reference-compiler`: no `three`, no React,
  no DOM types beyond workers.
- `world`, `visual-engine`: may import `three`; must not mutate domain state.
- `ui`: consumes trace/domain APIs; no independent scientific math.
- Trace is the single replay backbone.

## Alternatives considered

- Turborepo/Nx: unnecessary orchestration for this size; plain pnpm suffices.
- Babylon.js: heavier bundle; Three.js has broader instancing/LOD examples.
- Svelte/Solid: viable, but React 19 has the deepest a11y/testing ecosystem.
- Per-package tsup builds: slower iteration; source-consumption is simpler
  and equally type-safe with project-wide `tsc --noEmit`.

## Consequences

Single lockfile, fast installs, one typecheck gate, exact reproducibility.
Bundle cost is controlled by lazy-loading three.js and the editor.
