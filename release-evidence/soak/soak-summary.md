# Soak Test Summary

- Commit: `37731184c85b9c093c6bad053abf53c350720daa`
- Generated: 2026-08-07T03:54:19.159Z
- Duration: **119.7s** (minimum 600s)
- Workload cycles: **16**
- Heap samples: 31
- Post-warm-up baseline minimum heap: 29.0 MiB
- Trailing minimum heap: 29.7 MiB
- Trailing-minimum growth ratio: **1.023** (limit 1.5)
- Uncaught errors: 1
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 6 ms (limit 3000 ms, measured in-page from a trusted click)
- Same interaction observed through the driver's actionability protocol: 31 ms (harness protocol overhead on a continuously rendering page; not a user-visible number)
- Crashed: false

Result: **FAIL**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
