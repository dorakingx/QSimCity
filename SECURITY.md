# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the repository owner
rather than opening a public issue. Include reproduction steps and the affected
version or commit. Expect an acknowledgement within a few days.

## Threat model

QSimCity is a static, client-side application with no server, no database, no
accounts, and no user data leaving the browser. The realistic attack surface
is therefore:

1. **Untrusted program text** pasted into the editor.
2. **Untrusted trace files** imported from disk.
3. **Untrusted URL parameters** in a shared link.
4. **Supply chain** — dependencies shipped to the browser.
5. **Hosting configuration** — headers and caching.

## Controls

### Untrusted program text

- Parsed by a hand-written lexer/parser. **No `eval`, no `Function`
  constructor, no dynamic code execution anywhere in the codebase.**
- Hard limits: 512 KiB source, 24 qubits declared, 64 classical bits, 20,000
  instructions, gate-expansion depth 32 (blocks recursive-macro bombs).
- Simulation runs in a Web Worker, so a pathological circuit cannot freeze the
  main thread; runs are cancellable and report progress.
- All errors carry line/column positions and preserve user input.

### Untrusted trace files

- Size checked (32 MiB) **before** parsing, so a huge file cannot exhaust
  memory during `JSON.parse`.
- Validated by a strict zod schema that rejects unknown fields, plus
  cross-field invariants (bounds, layout permutations, tick monotonicity,
  count/shot consistency, probability normalization).
- Caps on events (250,000), qubits (64), and shots (1,000,000).
- Compressed archives are not accepted.
- Import failures surface a readable error and change no application state.

### Untrusted URL parameters

- Sample ids are checked against the bundled catalogue; anything else is
  ignored entirely.
- Numeric parameters are range-checked; out-of-range values are dropped rather
  than clamped silently into a running configuration.
- No URL parameter can inject program text or markup.

### Rendering

- React escapes all interpolated text. There is no `dangerouslySetInnerHTML`
  anywhere in the codebase.
- No user-controlled string is used to build a URL that the app then fetches.

### Transport and headers

Shipped in `vercel.json` and verified by `tools/test/vercel-config.test.ts`
against the real build output:

- `Content-Security-Policy`: `default-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'none'`,
  `connect-src 'self'`. **No `unsafe-eval`; no `unsafe-inline` in
  `script-src`.**
- `Strict-Transport-Security` with a two-year max-age and preload.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`.
- `Permissions-Policy` denying camera, microphone, geolocation, payment, USB,
  sensors, and interest cohorts.
- `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`.

### Supply chain

- Every dependency is pinned exactly (`save-exact`), with a committed lockfile
  and a pinned package manager and Node version.
- `pnpm audit` is run as part of release verification; **no high or critical
  advisories are accepted**.
- Runtime browser dependencies are deliberately few: React, three.js, zod, and
  workbox-window. Licenses are recorded in `THIRD_PARTY_NOTICES.md`.
- No secrets exist in the client bundle; the project has no credentials of any
  kind because it calls no services.

### Outbound links

External links (in documentation only) use `rel="noopener noreferrer"` where
they appear in the UI. The application itself makes no outbound requests.
