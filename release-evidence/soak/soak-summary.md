# Soak Test Summary

- Commit: `ffd9874facadd374944dd5ecfc78b475a44a6dd1`
- Generated: 2026-07-31T09:43:12.161Z
- Duration: **601.4s** (minimum 600s)
- Workload cycles: **290**
- Heap samples: 290
- Post-warm-up baseline minimum heap: 15.4 MiB
- Trailing minimum heap: 22.6 MiB
- Trailing-minimum growth ratio: **1.464** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 22 ms (limit 3000 ms)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
