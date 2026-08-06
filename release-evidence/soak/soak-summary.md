# Soak Test Summary

- Commit: `7b56020c7ad681cfc7b75042c544665340a30849`
- Generated: 2026-08-06T03:24:59.380Z
- Duration: **659.4s** (minimum 600s)
- Workload cycles: **9**
- Heap samples: 9
- Post-warm-up baseline minimum heap: 35.2 MiB
- Trailing minimum heap: 28.8 MiB
- Trailing-minimum growth ratio: **0.818** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 341 ms (limit 3000 ms, measured in-page from a trusted click)
- Same interaction observed through the driver's actionability protocol: 2704 ms (harness protocol overhead on a continuously rendering page; not a user-visible number)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
