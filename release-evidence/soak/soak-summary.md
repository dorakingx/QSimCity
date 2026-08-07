# Soak Test Summary

- Commit: `088eab8daecfe12c795a087893e7bd85e0e0ba07`
- Generated: 2026-08-07T11:54:11.777Z
- Duration: **600.5s** (minimum 600s)
- Workload cycles: **105**
- Heap samples: 210
- Post-warm-up baseline minimum heap: 29.0 MiB
- Trailing minimum heap: 37.2 MiB
- Trailing-minimum growth ratio: **1.284** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 16 ms (limit 3000 ms, measured in-page from a trusted click)
- Same interaction observed through the driver's actionability protocol: 58 ms (harness protocol overhead on a continuously rendering page; not a user-visible number)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
