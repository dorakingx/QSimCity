# Soak Test Summary

- Commit: `70eda7241ffe6e0802050a50cd3161e8510a5c3e`
- Generated: 2026-07-31T07:23:46.078Z
- Duration: **601.2s** (minimum 600s)
- Workload cycles: **281**
- Heap samples: 281
- Post-warm-up baseline minimum heap: 15.4 MiB
- Trailing minimum heap: 22.5 MiB
- Trailing-minimum growth ratio: **1.462** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 24 ms (limit 3000 ms)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
