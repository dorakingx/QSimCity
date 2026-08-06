# Soak Test Summary

- Commit: `5b2f0fe344e4119e89b82bb9a6185abccf326ac2`
- Generated: 2026-08-06T05:36:35.823Z
- Duration: **657.8s** (minimum 600s)
- Workload cycles: **9**
- Heap samples: 9
- Post-warm-up baseline minimum heap: 38.0 MiB
- Trailing minimum heap: 44.6 MiB
- Trailing-minimum growth ratio: **1.176** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 339 ms (limit 3000 ms, measured in-page from a trusted click)
- Same interaction observed through the driver's actionability protocol: 2693 ms (harness protocol overhead on a continuously rendering page; not a user-visible number)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
