# Soak Test Summary

- Commit: `9b58109270706e6befd324bfc52568047347a87a`
- Generated: 2026-07-30T18:05:21.368Z
- Duration: **600.3s** (minimum 600s)
- Workload cycles: **290**
- Heap samples: 290
- Post-warm-up baseline minimum heap: 14.8 MiB
- Trailing minimum heap: 21.4 MiB
- Trailing-minimum growth ratio: **1.443** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 23 ms (limit 3000 ms)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
