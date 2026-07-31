# Soak Test Summary

- Commit: `eb42aaa2aa0fc69a4bd0faa4a102ad407c3a5a20`
- Generated: 2026-07-31T01:21:52.588Z
- Duration: **601.3s** (minimum 600s)
- Workload cycles: **290**
- Heap samples: 290
- Post-warm-up baseline minimum heap: 16.3 MiB
- Trailing minimum heap: 22.5 MiB
- Trailing-minimum growth ratio: **1.375** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 51 ms (limit 3000 ms)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
