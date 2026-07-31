# Soak Test Summary

- Commit: `0d608726a450eac6302a8919bfac25eb5b589d0c`
- Generated: 2026-07-31T08:20:57.570Z
- Duration: **601.5s** (minimum 600s)
- Workload cycles: **283**
- Heap samples: 283
- Post-warm-up baseline minimum heap: 16.1 MiB
- Trailing minimum heap: 22.6 MiB
- Trailing-minimum growth ratio: **1.403** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 32 ms (limit 3000 ms)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
