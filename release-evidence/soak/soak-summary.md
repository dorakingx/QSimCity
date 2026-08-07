# Soak Test Summary

- Commit: `f5ae236807fa170fe421928eb603c7eb7e7f8d70`
- Generated: 2026-08-07T04:16:56.985Z
- Duration: **604.6s** (minimum 600s)
- Workload cycles: **106**
- Heap samples: 212
- Post-warm-up baseline minimum heap: 28.9 MiB
- Trailing minimum heap: 37.4 MiB
- Trailing-minimum growth ratio: **1.295** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 18 ms (limit 3000 ms, measured in-page from a trusted click)
- Same interaction observed through the driver's actionability protocol: 46 ms (harness protocol overhead on a continuously rendering page; not a user-visible number)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
