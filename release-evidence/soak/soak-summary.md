# Soak Test Summary

- Commit: `57c9a9d03ea2152eeb1b64bbf6308b9ec84910ee`
- Generated: 2026-08-05T09:18:37.604Z
- Duration: **602.6s** (minimum 600s)
- Workload cycles: **8**
- Heap samples: 8
- Post-warm-up baseline minimum heap: 37.3 MiB
- Trailing minimum heap: 41.0 MiB
- Trailing-minimum growth ratio: **1.099** (limit 1.5)
- Uncaught errors: 0
- Console errors: 0
- Failed requests: 0
- WebGL context loss / restore: 0 / 0
- Final interaction latency: 2417 ms (limit 3000 ms)
- Crashed: false

Result: **PASS**

Pass criteria were fixed before the run in `tools/soak/run-soak.ts` and were not
adjusted afterwards. Raw samples are in `heap-samples.csv`; all console and
error events are in `console-events.json`.
