# Soak Test Summary

- Commit: `d7609fc26d6c407d47ed59af22e20677fa8f9443`
- Generated: 2026-08-07T13:54:05.687Z
- Duration: **601.6s** (minimum 600s)
- Workload cycles: **105**
- Heap samples: 210
- Post-warm-up baseline minimum heap: 28.6 MiB
- Trailing minimum heap: 37.1 MiB
- Trailing-minimum growth ratio: **1.297** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 15 ms (limit 3000 ms, measured in-page from a trusted click)
- Same interaction observed through the driver's actionability protocol: 55 ms (harness protocol overhead on a continuously rendering page; not a user-visible number)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
