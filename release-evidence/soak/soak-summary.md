# Soak Test Summary

- Commit: `0605d6f32cdb5bb1b4d65ad9d419838fc6f3b8b6`
- Generated: 2026-08-07T03:38:29.824Z
- Duration: **58.6s** (minimum 600s)
- Workload cycles: **4**
- Heap samples: 7
- Post-warm-up baseline minimum heap: 3.5 MiB
- Trailing minimum heap: 26.7 MiB
- Trailing-minimum growth ratio: **7.721** (limit 1.5)
- Uncaught errors: 1
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 0 ms (limit 3000 ms, measured in-page from a trusted click)
- Same interaction observed through the driver's actionability protocol: 51 ms (harness protocol overhead on a continuously rendering page; not a user-visible number)
- Crashed: false

Result: **FAIL**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
