# Soak Test Summary

- Commit: `216164f8fa191901e9e2f9967c7eb2b95e44ac97`
- Generated: 2026-07-31T07:40:48.620Z
- Duration: **601.4s** (minimum 600s)
- Workload cycles: **286**
- Heap samples: 286
- Post-warm-up baseline minimum heap: 15.4 MiB
- Trailing minimum heap: 22.5 MiB
- Trailing-minimum growth ratio: **1.468** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 35 ms (limit 3000 ms)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
