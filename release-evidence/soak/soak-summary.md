# Soak Test Summary

- Commit: `4f97ca37dedf2ffd5182174a7b362460e32d1e3f`
- Generated: 2026-07-31T01:06:15.800Z
- Duration: **600.5s** (minimum 600s)
- Workload cycles: **271**
- Heap samples: 271
- Post-warm-up baseline minimum heap: 17.7 MiB
- Trailing minimum heap: 22.5 MiB
- Trailing-minimum growth ratio: **1.273** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 27 ms (limit 3000 ms)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
