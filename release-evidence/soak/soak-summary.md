# Soak Test Summary

- Commit: `896b7b36bd53f5fde4ed8d055d52448a22b61809`
- Generated: 2026-07-31T01:47:27.974Z
- Duration: **601.3s** (minimum 600s)
- Workload cycles: **284**
- Heap samples: 284
- Post-warm-up baseline minimum heap: 15.8 MiB
- Trailing minimum heap: 22.5 MiB
- Trailing-minimum growth ratio: **1.425** (limit 1.5)
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
