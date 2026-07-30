# Soak Test Summary

- Commit: `bc435ebdaa95173dc9edadec0d743c27c117e232`
- Generated: 2026-07-30T17:55:07.287Z
- Duration: **52.8s** (minimum 600s)
- Workload cycles: **5**
- Heap samples: 5
- Post-warm-up baseline minimum heap: 12.4 MiB
- Trailing minimum heap: 17.4 MiB
- Trailing-minimum growth ratio: **1.400** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 230 ms (limit 3000 ms)
- Crashed: false

Result: **FAIL**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
