# ADR-0003: Narrow console-error exception for a WebKit/three.js texture warning

Date: 2026-07-31. Status: Accepted.

## Context

The end-to-end suite fails a test on any console error, in any browser. On
WebKit, three.js emits during initialization:

```text
WebGL: INVALID_OPERATION: texImage3D: FLIP_Y or PREMULTIPLY_ALPHA isn't
allowed for uploading 3D textures
```

Investigation established:

- **Origin is three.js, not QSimCity.** three.js sets `UNPACK_FLIP_Y_WEBGL`
  and `UNPACK_PREMULTIPLY_ALPHA_WEBGL` globally; WebKit rejects them for its
  internal 3D texture upload path. QSimCity uploads no 3D textures.
- **Rendering is unaffected.** A WebKit screenshot captured during the release
  audit shows the complete city — all twelve districts, window lights, ground
  grid, and labels — and `readPixels` confirms a live context.
- **WebKit only.** Chromium and Firefox are silent.
- **Not fixable from application code.** The pixel-store flags are set inside
  three.js's renderer before any QSimCity code runs.

Versions when observed: three.js 0.185.1, Playwright 1.62.0 WebKit build.

## Decision

Filter this **one exact message**, and only when the running browser is
WebKit. The filter lives in `tests/e2e/helpers.ts` next to the universal
environment-noise entries, and each browser-specific entry records the
browser, the exact signature, and this ADR.

Because a suppressed warning could otherwise hide a genuinely blank canvas,
every test that enters a 3D mode also asserts positive rendering through
`expectCityRendered`: a live, non-lost WebGL2 context plus the district
labels in the canvas description.

## Alternatives considered

- **Suppress all WebGL warnings.** Rejected: it would hide shader compilation
  failures and context loss, which are real defects.
- **Skip the console check on WebKit.** Rejected: it would blind the suite to
  every WebKit-specific application error.
- **Drop WebKit from the matrix.** Rejected: Safari support is a product
  requirement, and the browser renders correctly.
- **Pin an older three.js.** Rejected: the warning is cosmetic and older
  versions carry real defects.

## Consequences

Any other WebGL warning, shader failure, context loss, blank canvas, missing
district, or three.js error still fails the suite in every browser. If the
message signature changes in a future three.js release, the filter stops
matching and the suite fails, forcing a fresh review rather than silently
extending the exception.
